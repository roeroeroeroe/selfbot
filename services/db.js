import pg from 'pg';
import redis from './redis.js';
import logger from './logger.js';
import config from '../config.json' with { type: 'json' };
import { resolveUser } from './twitch/gql.js';

const REDIS_MESSAGES_QUEUE_KEY = 'sb:m:q';
const REDIS_CHANNEL_KEY_PREFIX = 'sb:c';

const MAX_MESSAGE_BATCH_INSERT_INTERVAL_MS = 10000;
const MAX_MESSAGE_BATCH_SIZE = 1000;

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

export async function query(query, values = []) {
	const c = await pool.connect();
	logger.debug(`[DB] running query "${query}" with values:`, values);
	const before = performance.now();
	try {
		const res = await c.query(query, values);
		return res.rows;
	} catch (err) {
		logger.error('[DB] query failed:', err);
		throw err;
	} finally {
		c.release();
		logger.debug(
			'[DB] query took:',
			(performance.now() - before).toFixed(3) + 'ms'
		);
	}
}

export async function init() {
	if (
		config.messageBatchInsertIntervalMs > MAX_MESSAGE_BATCH_INSERT_INTERVAL_MS
	)
		throw new Error(
			`messageBatchInsertIntervalMs can not be greater than ${MAX_MESSAGE_BATCH_INSERT_INTERVAL_MS}`
		);
	if (config.maxMessageBatchInsertSize > MAX_MESSAGE_BATCH_SIZE)
		throw new Error(
			`maxMessageBatchInsertSize can not be greater than ${MAX_MESSAGE_BATCH_SIZE}`
		);
	await query(
		`CREATE TABLE IF NOT EXISTS channels (
			id VARCHAR(15) PRIMARY KEY,
			login VARCHAR(25) UNIQUE,
			display_name VARCHAR(25),
			log BOOLEAN,
			prefix VARCHAR(15) DEFAULT '${config.defaultPrefix}',
			suspended BOOLEAN,
			privileged BOOLEAN DEFAULT false,
			joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`
	);

	await query(
		`CREATE TABLE IF NOT EXISTS customcommands (
			name TEXT PRIMARY KEY,
			channel_id VARCHAR(15) REFERENCES channels(id) ON DELETE CASCADE,
			trigger TEXT NOT NULL,
			response TEXT,
			runcmd TEXT,
			whitelist TEXT[],
			cooldown INTEGER,
			reply BOOLEAN DEFAULT false,
			mention BOOLEAN DEFAULT false
		)`
	);

	await query(
		`CREATE TABLE IF NOT EXISTS messages (
			channel_id VARCHAR(15) REFERENCES channels(id) ON DELETE CASCADE,
			user_id VARCHAR(15),
			text VARCHAR(500) NOT NULL,
			timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`
	);

	for (const index of [
		'CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id)',
		'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)',
		'CREATE INDEX IF NOT EXISTS idx_messages_channel_user ON messages(channel_id, user_id)',
	])
		await query(index);

	const res = await query(
		'SELECT EXISTS(SELECT 1 FROM channels WHERE login = $1)',
		[config.entry_channel.login]
	);
	if (!res[0].exists) {
		const user = await resolveUser(config.entry_channel.login);
		if (!user?.id)
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
		config.messageBatchInsertIntervalMs
	);
}

export async function insertChannel(
	id,
	login,
	displayName,
	log = config.logMessagesByDefault,
	prefix = config.defaultPrefix,
	suspended = false,
	privileged = false
) {
	logger.debug(
		`[DB] inserting channel ${id}: login: ${login}, display_name: ${displayName}, log: ${log}, prefix: ${prefix}, suspended: ${suspended}, privileged: ${privileged}`
	);
	await query(
		'INSERT INTO channels (id, login, display_name, log, prefix, suspended, privileged) VALUES ($1, $2, $3, $4, $5, $6, $7)',
		[id, login, displayName, log, prefix, suspended, privileged]
	);
}

export async function updateChannel(channelId, key, value, channelData) {
	logger.debug(
		`[DB] updating channel ${channelId}, setting new ${key}: ${value}`
	);
	if (!channelData) channelData = await getChannel(channelId);
	channelData[key] = value;
	await Promise.all([
		query(`UPDATE channels SET ${key} = $1 WHERE id = $2`, [value, channelId]),
		redis.set(
			`${REDIS_CHANNEL_KEY_PREFIX}:${channelId}`,
			JSON.stringify(channelData)
		),
	]);
}

export async function deleteChannel(channelId) {
	logger.debug(`[DB] deleting channel ${channelId}`);
	await Promise.all([
		query('DELETE FROM channels WHERE id = $1', [channelId]),
		redis.del(`${REDIS_CHANNEL_KEY_PREFIX}:${channelId}`),
	]);
}

export async function insertCustomCommand(
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
		`[DB] inserting custom command ${commandName}: channel_id: ${channelId}, trigger: ${trigger}, response: ${response}, runcmd: ${runcmd}, whitelist: ${whitelist}, cooldown: ${cooldown}, reply: ${reply}, mention: ${mention}`
	);
	await query(
		`INSERT INTO customcommands (name, channel_id, trigger, response, runcmd, whitelist, cooldown, reply, mention) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[
			commandName,
			channelId,
			trigger,
			response,
			runcmd,
			whitelist,
			cooldown,
			reply,
			mention,
		]
	);
}

export async function updateCustomCommand(commandName, newValues = {}) {
	const keys = Object.keys(newValues);
	logger.debug(
		`[DB] updating custom command ${commandName}, setting ${keys.length} new values`
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

export async function deleteCustomCommand(commandName) {
	logger.debug(`[DB] deleting custom command ${commandName}`);
	await query('DELETE FROM customcommands WHERE name = $1', [commandName]);
}

export async function queueMessageInsert(channelId, userId, text, timestamp) {
	if (text.includes('\t')) {
		logger.warning(`[DB] not queuing message: \\t not allowed: ${text}`);
		return;
	}

	const record = `${channelId}\t${userId}\t${text}\t${timestamp}`;
	await redis.rpush(REDIS_MESSAGES_QUEUE_KEY, record);
	logger.debug(`[DB] queued message: ${record}`);
}

export async function getChannel(channelId) {
	logger.debug(`[DB] getting channel ${channelId}`);
	const cache = await redis.get(`${REDIS_CHANNEL_KEY_PREFIX}:${channelId}`);
	if (cache) {
		logger.debug(`[REDIS] found channel ${channelId}:`, cache);
		return JSON.parse(cache);
	}

	const channel = (
		await query(
			'SELECT login, display_name, log, prefix, suspended, privileged, joined_at FROM channels WHERE id = $1',
			[channelId]
		)
	)[0];
	if (channel) {
		const channelDataString = JSON.stringify(channel);
		logger.debug(`[DB] found channel ${channelId}: ${channelDataString}`);
		await redis.set(
			`${REDIS_CHANNEL_KEY_PREFIX}:${channelId}`,
			channelDataString
		);
		return channel;
	}
	logger.debug(`[DB] unknown channel ${channelId}`);
}

async function flushMessages() {
	try {
		const queueLength = await redis.llen(REDIS_MESSAGES_QUEUE_KEY);
		if (queueLength > config.maxMessageBatchInsertSize)
			logger.warning(
				`[REDIS] message queue length (${queueLength}) exceeds max batch size: ${config.maxMessageBatchInsertSize}, consider decreasing 'messageBatchInsertIntervalMs' or increasing 'maxMessageBatchInsertSize'`
			);
		const messages = await redis.lrange(
			REDIS_MESSAGES_QUEUE_KEY,
			0,
			config.maxMessageBatchInsertSize - 1
		);
		if (!messages.length) return;

		await redis.ltrim(REDIS_MESSAGES_QUEUE_KEY, messages.length, -1);

		let queryText =
			'INSERT INTO messages (channel_id, user_id, text, timestamp) VALUES ';
		const values = [],
			placeholders = [];

		for (let i = 0; i < messages.length; i++) {
			const record = messages[i];
			const parts = record.split('\t');
			if (parts.length !== 4) {
				logger.warning(`[DB] invalid message format skipped: ${record}`);
				continue;
			}
			const base = placeholders.length * 4;
			values.push(parts[0], parts[1], parts[2], parts[3]);
			placeholders.push(
				`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
			);
		}

		if (!placeholders.length) return;
		queryText += placeholders.join(', ');

		logger.debug(`[DB] flushing ${placeholders.length} messages`);
		await query(queryText, values);
	} catch (err) {
		logger.error('[DB] failed to flush messages from Redis:', err);
	}
}
