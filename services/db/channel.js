import config from '../../config.json' with { type: 'json' };
import db from './index.js';
import logger from '../logger.js';
import redis from '../redis.js';

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
		`[DB] inserting channel ${id}: login: ${login},`,
		`display_name: ${displayName}, log: ${log}, prefix: ${prefix},`,
		`suspended: ${suspended}, privileged: ${privileged}`
	);
	await db.query(db.INSERT_CHANNEL, [
		id,
		login,
		displayName,
		log,
		prefix,
		suspended,
		privileged,
	]);
}

async function updateChannel(channelId, key, value, channelData) {
	logger.debug(
		`[DB] updating channel ${channelId}, setting new ${key}: ${value}`
	);
	if (!channelData) channelData = await getChannel(channelId);
	channelData[key] = value;
	await db.query(db.UPDATE_CHANNEL(key), [value, channelId]);
	await redis.set(
		`${redis.CHANNEL_KEY_PREFIX}:${channelId}`,
		JSON.stringify(channelData),
		'PX',
		redis.CHANNEL_KEY_TTL
	);
}

async function deleteChannel(channelId) {
	logger.debug('[DB] deleting channel', channelId);
	await db.query(db.DELETE_CHANNEL, [channelId]);
	await redis.del(`${redis.CHANNEL_KEY_PREFIX}:${channelId}`);
	db.message.queueEntries.delete(channelId);
	logger.debug(`[REDIS] deleted channel ${channelId}`);
}

async function getChannel(channelId) {
	logger.debug('[DB] getting channel', channelId);
	const cache = await redis.get(`${redis.CHANNEL_KEY_PREFIX}:${channelId}`);
	if (cache) {
		logger.debug(`[REDIS] found channel ${channelId}: ${cache}`);
		return JSON.parse(cache);
	}

	const channel = (await db.query(db.SELECT_CHANNEL, [channelId]))[0];
	if (!channel) return logger.debug('[DB] unknown channel', channelId);

	const channelDataString = JSON.stringify(channel);
	logger.debug(`[DB] found channel ${channelId}: ${channelDataString}`);
	await redis.set(
		`${redis.CHANNEL_KEY_PREFIX}:${channelId}`,
		channelDataString,
		'PX',
		redis.CHANNEL_KEY_TTL
	);
	return channel;
}

export default {
	insert: insertChannel,
	update: updateChannel,
	delete: deleteChannel,
	get: getChannel,
};
