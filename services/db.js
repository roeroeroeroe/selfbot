import pg from 'pg';
import redis from './redis.js';
import logger from './logger.js';
import config from '../config.json' with { type: 'json' };
import twitch from './twitch/index.js';
import metrics from './metrics.js';

const MESSAGES_QUEUE_REDIS_KEY = 'sb:m:q';
const CHANNEL_REDIS_KEY_PREFIX = 'sb:c';

const QUERIES_METRICS_COUNTER = 'postgres_queries';
metrics.counter.create(QUERIES_METRICS_COUNTER);

const MAX_MESSAGES_BATCH_INSERT_INTERVAL_MS = 10000;
const MAX_MESSAGES_BATCH_SIZE = 1000;

const CREATE_CHANNELS_TABLE = `
CREATE TABLE IF NOT EXISTS channels (
	id VARCHAR(15) PRIMARY KEY,
	login VARCHAR(25) UNIQUE,
	display_name VARCHAR(25),
	log BOOLEAN,
	prefix VARCHAR(15) DEFAULT '${config.defaultPrefix}',
	suspended BOOLEAN,
	privileged BOOLEAN DEFAULT false,
	joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

const CREATE_CUSTOMCOMMANDS_TABLE = `
CREATE TABLE IF NOT EXISTS customcommands (
	name TEXT PRIMARY KEY,
	channel_id VARCHAR(15) REFERENCES channels(id) ON DELETE CASCADE,
	trigger TEXT NOT NULL,
	response TEXT,
	runcmd TEXT,
	whitelist TEXT[],
	cooldown INTEGER,
	reply BOOLEAN DEFAULT false,
	mention BOOLEAN DEFAULT false
)`;

const CREATE_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS messages (
	channel_id VARCHAR(15) REFERENCES channels(id) ON DELETE CASCADE,
	user_id VARCHAR(15),
	text VARCHAR(500) NOT NULL,
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

const CREATE_INDEX_MESSAGES_CHANNEL_ID = `
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id)`;

const CREATE_INDEX_MESSAGES_USER_ID = `
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`;

const CREATE_INDEX_MESSAGES_CHANNEL_USER = `
CREATE INDEX IF NOT EXISTS idx_messages_channel_user ON messages(channel_id, user_id)`;

const CHECK_CHANNEL_EXISTS = `
SELECT EXISTS(SELECT 1 FROM channels WHERE login = $1)`;

const INSERT_CHANNEL = `
INSERT INTO channels (
	id, login, display_name, log, prefix, suspended, privileged
) VALUES ($1, $2, $3, $4, $5, $6, $7)`;

const UPDATE_CHANNEL = k => `
UPDATE channels SET ${k} = $1 WHERE id = $2`;

const SELECT_CHANNEL = `
SELECT login, display_name, log, prefix, suspended, privileged, joined_at
FROM channels WHERE id = $1`;

const DELETE_CHANNEL = `
DELETE FROM channels WHERE id = $1`;

const INSERT_CUSTOM_COMMAND = `
INSERT INTO customcommands (
	name, channel_id, trigger, response, runcmd, whitelist, cooldown, reply, mention
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

const DELETE_CUSTOM_COMMAND = `
DELETE FROM customcommands WHERE name = $1`;

const INSERT_MESSAGES_BASE = `
INSERT INTO messages (
	channel_id, user_id, text, timestamp
) VALUES`;

const pool = new pg.Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST || '127.0.0.1',
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD,
	port: process.env.DB_PORT || 5432,
	max: process.env.DB_MAX_CLIENTS || 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
});

pool.on('connect', ({ processID }) =>
	logger.debug(`[DB] client connected (pid=${processID})`)
);
pool.on('error', err => logger.error('db error:', err));

async function query(query, values = []) {
	const c = await pool.connect();
	logger.debug(`[DB] running query "${query}" with values:`, values);
	metrics.counter.increment(QUERIES_METRICS_COUNTER);
	const t0 = performance.now();
	try {
		const res = await c.query(query, values);
		return res.rows;
	} catch (err) {
		logger.error('[DB] query failed:', err);
		throw err;
	} finally {
		const t1 = performance.now();
		c.release();
		logger.debug('[DB] query took', (t1 - t0).toFixed(3) + 'ms');
	}
}

async function init() {
	await query(CREATE_CHANNELS_TABLE);
	await query(CREATE_CUSTOMCOMMANDS_TABLE);
	await query(CREATE_MESSAGES_TABLE);

	for (const index of [
		CREATE_INDEX_MESSAGES_CHANNEL_ID,
		CREATE_INDEX_MESSAGES_USER_ID,
		CREATE_INDEX_MESSAGES_CHANNEL_USER,
	])
		await query(index);

	// prettier-ignore
	const { exists } = (await query(CHECK_CHANNEL_EXISTS, [config.entry_channel.login]))[0];
	if (!exists) {
		const user = await twitch.gql.user.resolve(config.entry_channel.login);
		if (!user)
			throw new Error(
				`entry channel "${config.entry_channel.login}" does not exist`
			);

		await insertChannel(
			user.id,
			user.login,
			user.displayName,
			config.logMessagesByDefault
		);
	}

	setInterval(
		async () => await flushMessages(),
		config.messagesBatchInsertIntervalMs
	);
}
// prettier-ignore
async function insertChannel(
	id,
	login,
	displayName,
	log = config.logMessagesByDefault,
	prefix = config.defaultPrefix,
	suspended = false,
	privileged = false
) {
	logger.debug(
		'[DB] inserting channel', id+':',
		'login:', login,
		'display_name:', displayName,
		'log:', log,
		'prefix:', prefix,
		'suspended:', suspended,
		'privileged:', privileged
	);
	await query(INSERT_CHANNEL, [
		id,
		login,
		displayName,
		log,
		prefix,
		suspended,
		privileged,
	]);
}
// prettier-ignore
async function updateChannel(channelId, key, value, channelData) {
	logger.debug(
		'[DB] updating channel', channelId+',',
		'setting new', key+':', value
	);
	if (!channelData) channelData = await getChannel(channelId);
	channelData[key] = value;
	await Promise.all([
		query(UPDATE_CHANNEL(key), [value, channelId]),
		redis.set(
			`${CHANNEL_REDIS_KEY_PREFIX}:${channelId}`,
			JSON.stringify(channelData)
		),
	]);
}

async function deleteChannel(channelId) {
	logger.debug('[DB] deleting channel', channelId);
	await Promise.all([
		query(DELETE_CHANNEL, [channelId]),
		redis.del(`${CHANNEL_REDIS_KEY_PREFIX}:${channelId}`),
	]);
}
// prettier-ignore
async function getChannel(channelId) {
	logger.debug('[DB] getting channel', channelId);
	const cache = await redis.get(`${CHANNEL_REDIS_KEY_PREFIX}:${channelId}`);
	if (cache) {
		logger.debug('[REDIS] found channel', channelId+':', cache);
		return JSON.parse(cache);
	}

	const channel = (await query(SELECT_CHANNEL, [channelId]))[0];
	if (!channel) {
		logger.debug('[DB] unknown channel', channelId);
		return;
	}

	const channelDataString = JSON.stringify(channel);
	logger.debug('[DB] found channel', channelId+':', channelDataString);
	await redis.set(
		`${CHANNEL_REDIS_KEY_PREFIX}:${channelId}`,
		channelDataString
	);
	return channel;
}
// prettier-ignore
async function insertCustomCommand(
	commandName,
	channelId,
	trigger,
	response,
	runcmd,
	whitelist,
	cooldown,
	reply = false,
	mention = false
) {
	logger.debug(
		'[DB] inserting custom command', commandName+':',
		'channel_id:', channelId,
		'trigger:', trigger,
		'response:', response,
		'runcmd:', runcmd,
		'whitelist:', whitelist,
		'cooldown:', cooldown,
		'reply:', reply,
		'mention:', mention
	);
	await query(INSERT_CUSTOM_COMMAND, [
		commandName,
		channelId,
		trigger,
		response,
		runcmd,
		whitelist,
		cooldown,
		reply,
		mention,
	]);
}
// prettier-ignore
async function updateCustomCommand(commandName, newValues = {}) {
	const keys = Object.keys(newValues);
	logger.debug(
		'[DB] updating custom command', commandName+',',
		'setting', keys.length, 'new values'
	);
	const values = [];
	let queryStr = 'UPDATE customcommands SET ',
		i = 1;
	for (const k of keys) {
		queryStr += `${k} = $${i++}, `;
		values.push(newValues[k]);
	}
	values.push(commandName);
	await query(`${queryStr.slice(0, -2)} WHERE name = $${i}`, values);
}

async function deleteCustomCommand(commandName) {
	logger.debug('[DB] deleting custom command', commandName);
	await query(DELETE_CUSTOM_COMMAND, [commandName]);
}

async function queueMessageInsert(channelId, userId, text, timestamp) {
	if (text.includes('\t')) {
		logger.warning('[REDIS] not queuing message: \\t not allowed:', text);
		return;
	}

	const record = `${channelId}\t${userId}\t${text}\t${timestamp}`;
	await redis.rpush(MESSAGES_QUEUE_REDIS_KEY, record);
	logger.debug('[REDIS] queued message:', record);
}

async function flushMessages() {
	try {
		const queueLength = await redis.llen(MESSAGES_QUEUE_REDIS_KEY);
		if (queueLength > config.maxMessagesBatchInsertSize)
			logger.warning(
				`[REDIS] message queue length (${queueLength}) exceeds max batch size: ${config.maxMessagesBatchInsertSize}, consider decreasing 'messagesBatchInsertIntervalMs' or increasing 'maxMessagesBatchInsertSize'`
			);
		const messages = await redis.lrange(
			MESSAGES_QUEUE_REDIS_KEY,
			0,
			config.maxMessagesBatchInsertSize - 1
		);
		if (!messages.length) return;

		await redis.ltrim(MESSAGES_QUEUE_REDIS_KEY, messages.length, -1);

		let queryText = INSERT_MESSAGES_BASE;
		const values = [],
			placeholders = [];

		for (let i = 0; i < messages.length; i++) {
			const record = messages[i];
			const parts = record.split('\t');
			if (parts.length !== 4) {
				logger.warning(`[REDIS] invalid message format skipped: ${record}`);
				continue;
			}
			const base = placeholders.length * 4;
			values.push(parts[0], parts[1], parts[2], parts[3]);
			placeholders.push(
				`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
			);
		}

		if (!placeholders.length) return;
		queryText += '\n' + placeholders.join(',\n');

		logger.debug(`[DB] flushing ${placeholders.length} messages`);
		await query(queryText, values);
	} catch (err) {
		logger.error('[DB] failed to flush messages from Redis:', err);
	}
}

export default {
	MAX_MESSAGES_BATCH_INSERT_INTERVAL_MS,
	MAX_MESSAGES_BATCH_SIZE,

	init,
	query,
	channel: {
		insert: insertChannel,
		update: updateChannel,
		delete: deleteChannel,
		get: getChannel,
	},
	customCommand: {
		insert: insertCustomCommand,
		update: updateCustomCommand,
		delete: deleteCustomCommand,
	},
	message: {
		queueInsert: queueMessageInsert,
	},
};
