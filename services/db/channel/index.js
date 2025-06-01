import config from '../../../config.json' with { type: 'json' };
import * as queries from './queries.js';
import db from '../index.js';
import logger from '../../logger.js';
import cache from '../../cache/index.js';

function insertChannel(
	id,
	login,
	displayName,
	log = config.logMessagesByDefault,
	prefix = config.defaultPrefix,
	suspended = false,
	privileged = false
) {
	return db.query(queries.INSERT_CHANNEL, [
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
	if (!db.VALID_CHANNELS_COLUMNS.has(key))
		throw new Error(`invalid column name: ${key}`);
	if (!channelData) channelData = await getChannel(channelId);
	channelData[key] = value;
	await db.query(`UPDATE channels SET ${key} = $1 WHERE id = $2`, [
		value,
		channelId,
	]);
	await cache.set(
		`${cache.CHANNEL_KEY_PREFIX}:${channelId}`,
		channelData,
		cache.CHANNEL_KEY_TTL_MS
	);
}

async function deleteChannel(channelId) {
	await db.query(queries.DELETE_CHANNEL, [channelId]);
	logger.debug(`[DB] deleted channel ${channelId}`);
	await cache.del(`${cache.CHANNEL_KEY_PREFIX}:${channelId}`);
	logger.debug(`[CACHE] deleted channel ${channelId}`);
	db.message.queueEntries.delete(channelId);
}

async function getChannel(channelId) {
	const cached = await cache.get(`${cache.CHANNEL_KEY_PREFIX}:${channelId}`);
	if (cached) return cached;
	const channel = (await db.query(queries.SELECT_CHANNEL, [channelId]))[0];
	if (!channel) {
		logger.debug('[DB] unknown channel', channelId);
		return null;
	}
	await cache.set(
		`${cache.CHANNEL_KEY_PREFIX}:${channelId}`,
		channel,
		cache.CHANNEL_KEY_TTL_MS
	);
	return channel;
}

async function getChannelByLogin(channelLogin) {
	// prettier-ignore
	const channel = (await db.query(queries.SELECT_CHANNEL_BY_LOGIN, [channelLogin]))[0];
	if (!channel) {
		logger.debug('[DB] unknown channel', channelLogin);
		return null;
	}
	return channel;
}

export default {
	queries,

	insert: insertChannel,
	update: updateChannel,
	delete: deleteChannel,
	get: getChannel,
	getByLogin: getChannelByLogin,
};
