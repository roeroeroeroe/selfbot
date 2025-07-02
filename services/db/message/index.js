import pgStreams from 'pg-copy-streams';
import RingBuffer from '../../ring_buffer.js';
import config from '../../../config.json' with { type: 'json' };
import * as queries from './queries.js';
import db from '../index.js';
import metrics from '../../metrics/index.js';
import logger from '../../logger.js';

const messageQueueEntries = new Map();
let flushTimeout;

function getMessageQueueEntry(channelId) {
	if (!messageQueueEntries.has(channelId))
		messageQueueEntries.set(channelId, {
			buffer: new RingBuffer(1 << 7),
			emptyStreak: 0,
		});
	return messageQueueEntries.get(channelId);
}

function queueMessageInsert(channelId, userId, text, timestamp) {
	if (text.includes('\t'))
		return logger.warning('[DB] not queuing message: \\t not allowed:', text);

	const record = `${userId}\t${text.replace(/\\/g, '\\\\')}\t${timestamp}`;
	getMessageQueueEntry(channelId).buffer.push(record);
	logger.debug(`[DB] queued message for ${channelId}: ${record}`);
}
// prettier-ignore
function searchMessages(channelId, userId, excludeChannelIds = [],
                        excludeUserIds = [], lastMilliseconds, searchTerm,
                        limit = db.SEARCH_MESSAGES_DEFAULT_LIMIT,
                        similarityThreshold = db.PG_TRGM_MIN_SIMILARITY_THRESHOLD) {
	const whereClauses = [], values = [];
	if (channelId)
		whereClauses.push(`channel_id = $${values.push(channelId)}`);
	if (userId)
		whereClauses.push(`user_id = $${values.push(userId)}`);
	if (excludeChannelIds.length)
		whereClauses.push(`channel_id NOT IN (${excludeChannelIds.map((id) => `$${values.push(id)}`).join(', ')})`);
	if (excludeUserIds.length)
		whereClauses.push(`user_id NOT IN (${excludeUserIds.map((id) => `$${values.push(id)}`).join(', ')})`);
	if (lastMilliseconds)
		whereClauses.push(`timestamp >= $${values.push(new Date(Date.now() - lastMilliseconds))}`);

	let termIndex, threshIndex;
	if (searchTerm) {
		whereClauses.push(`text % $${termIndex = values.push(searchTerm)}`);
		threshIndex = values.push(similarityThreshold);
	}

	const multiplier =
		searchTerm && similarityThreshold > db.PG_TRGM_MIN_SIMILARITY_THRESHOLD
			? Math.ceil(similarityThreshold / db.PG_TRGM_MIN_SIMILARITY_THRESHOLD)
			: 1,
		cteLimitIndex = values.push(limit * multiplier),
		finalLimitIndex = values.push(limit);

	return db.query(`
		WITH filtered AS (
			SELECT channel_id, user_id, text, timestamp
			FROM messages
			${whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''}
			ORDER BY timestamp DESC
			LIMIT $${cteLimitIndex}
		)
		SELECT
			channel_id,
			user_id,
			text,
			timestamp,
			${searchTerm ? `similarity(text, $${termIndex}) AS similarity` : `NULL AS similarity`}
		FROM filtered
		${searchTerm ? `WHERE similarity(text, $${termIndex}) >= $${threshIndex}` : ''}
		ORDER BY ${searchTerm ? 'similarity DESC, ' : ''}timestamp DESC
		LIMIT $${finalLimitIndex}`, values);
}

async function flushMessages(
	scheduleNext = true,
	maxPerChannelFlush = config.db.maxMessagesPerChannelFlush
) {
	let c, stream;
	try {
		for (const [channelId, entry] of messageQueueEntries.entries()) {
			const buffer = entry.buffer;
			if (!buffer.size) {
				if (++entry.emptyStreak >= db.MAX_MESSAGE_QUEUE_EMPTY_STREAKS) {
					messageQueueEntries.delete(channelId);
					logger.debug(
						`[DB] queued messages buffer for channel ${channelId}`,
						'deleted after reaching empty streak limit',
						`(${db.MAX_MESSAGE_QUEUE_EMPTY_STREAKS})`
					);
				}
				continue;
			}
			if (!c) {
				c = await db.pool.connect();
				await c.query('BEGIN');
				stream = c.query(pgStreams.from(queries.COPY_MESSAGES_STREAM));
			}
			let count = buffer.size;
			if (count > maxPerChannelFlush) {
				count = maxPerChannelFlush;
				logger.warning(
					`[DB] queued messages buffer for channel ${channelId}`,
					`exceeded max size (${maxPerChannelFlush})`,
					`by ${buffer.size - maxPerChannelFlush} messages, consider decreasing`,
					"'db.messagesFlushIntervalMs' or increasing 'db.maxMessagesPerChannelFlush'"
				);
			}
			for (let i = 0; i < count; i++)
				if (!stream.write(`${channelId}\t${buffer.shift()}\n`))
					await new Promise(res => stream.once('drain', res));
			entry.emptyStreak = 0;
		}
		if (stream) {
			stream.end();
			await new Promise((res, rej) => {
				stream.on('finish', res);
				stream.on('error', rej);
			});
			await c.query('COMMIT');
			metrics.counter.increment(metrics.names.counters.PG_QUERIES);
		}
	} catch (err) {
		logger.error('error flushing messages:', err);
		if (c) await c.query('ROLLBACK').catch(() => {});
	} finally {
		if (c) c.release();
		if (scheduleNext)
			flushTimeout = setTimeout(
				flushMessages,
				config.db.messagesFlushIntervalMs
			);
	}
}

async function cleanup() {
	clearTimeout(flushTimeout);
	flushTimeout = null;
	for (const entry of messageQueueEntries.values())
		if (entry.buffer.size) {
			await flushMessages(false, db.MAX_MESSAGES_PER_CHANNEL_FLUSH);
			return;
		}
}

export default {
	queries,
	queueEntries: messageQueueEntries,

	queueInsert: queueMessageInsert,
	search: searchMessages,
	initFlushMessages: flushMessages,
	cleanup,
};
