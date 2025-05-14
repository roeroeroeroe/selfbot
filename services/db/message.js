import pgStreams from 'pg-copy-streams';
import RingBuffer from '../ring_buffer.js';
import config from '../../config.json' with { type: 'json' };
import db from './index.js';
import metrics from '../metrics.js';
import logger from '../logger.js';

const messageQueueEntries = new Map();

function getMessageQueueEntry(channelId) {
	if (!messageQueueEntries.has(channelId))
		messageQueueEntries.set(channelId, {
			buffer: new RingBuffer(1 << 7),
			emptyStreak: 0,
		});
	return messageQueueEntries.get(channelId);
}

async function queueMessageInsert(channelId, userId, text, timestamp) {
	if (text.includes('\t'))
		return logger.warning('[DB] not queuing message: \\t not allowed:', text);

	const record = `${userId}\t${text.replace(/\\/g, '\\\\')}\t${timestamp}`;
	getMessageQueueEntry(channelId).buffer.push(record);
	logger.debug(`[DB] queued message for ${channelId}: ${record}`);
}

async function searchMessages(
	channelId,
	userId,
	lastMilliseconds,
	searchTerm,
	limit = 100,
	similarityThreshold = db.PG_TRGM_MIN_SIMILARITY_THRESHOLD
) {
	const clauses = [],
		values = [];

	if (channelId) clauses.push(`channel_id = $${values.push(channelId)}`);
	if (userId) clauses.push(`user_id = $${values.push(userId)}`);
	if (lastMilliseconds)
		clauses.push(
			`timestamp >= $${values.push(new Date(Date.now() - lastMilliseconds))}`
		);

	let termIndex, threshIndex;
	if (searchTerm) {
		clauses.push(`text % $${(termIndex = values.push(searchTerm))}`);
		threshIndex = values.push(similarityThreshold);
	}

	const multiplier =
			searchTerm && similarityThreshold > db.PG_TRGM_MIN_SIMILARITY_THRESHOLD
				? Math.ceil(similarityThreshold / db.PG_TRGM_MIN_SIMILARITY_THRESHOLD)
				: 1,
		cteLimitIndex = values.push(limit * multiplier),
		finalLimitIndex = values.push(limit);

	return await db.query(
		`
		WITH filtered AS (
			SELECT channel_id, user_id, text, timestamp
				FROM messages
			${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
			ORDER BY timestamp DESC
			LIMIT $${cteLimitIndex}
		)
		SELECT
			channel_id,
			user_id,
			text,
			timestamp,
			${searchTerm ? `similarity(text, $${termIndex}) AS similarity` : 'NULL AS similarity'}
		FROM filtered
		${searchTerm ? `WHERE similarity(text, $${termIndex}) >= $${threshIndex}` : ''}
		ORDER BY ${searchTerm ? 'similarity DESC, ' : ''}timestamp DESC
		LIMIT $${finalLimitIndex}`,
		values
	);
}

async function flushMessages() {
	const c = await db.pool.connect();
	try {
		await c.query('BEGIN');
		const stream = c.query(pgStreams.from(db.COPY_MESSAGES_STREAM));
		for (const [channelId, entry] of messageQueueEntries.entries()) {
			const buffer = entry.buffer;
			let count = 0;
			while (count < config.maxMessagesPerChannelFlush && buffer.size) {
				if (!stream.write(`${channelId}\t${buffer.shift()}\n`))
					await new Promise(res => stream.once('drain', res));
				count++;
			}
			if (buffer.size)
				logger.warning(
					`[DB] queued messages buffer for channel ${channelId}`,
					`exceeded max size (${config.maxMessagesPerChannelFlush})`,
					`by ${buffer.size} messages, consider decreasing`,
					"'messagesFlushIntervalMs' or increasing 'maxMessagesPerChannelFlush'"
				);
			if (count) {
				entry.emptyStreak = 0;
				continue;
			}
			if (++entry.emptyStreak >= db.MAX_MESSAGE_QUEUE_EMPTY_STREAKS) {
				messageQueueEntries.delete(channelId);
				logger.debug(
					`[DB] queued messages buffer for channel ${channelId}`,
					`deleted after reaching empty streak limit (${db.MAX_MESSAGE_QUEUE_EMPTY_STREAKS})`
				);
			}
		}
		stream.end();
		await new Promise((res, rej) => {
			stream.on('finish', res);
			stream.on('error', rej);
		});
		await c.query('COMMIT');
		metrics.counter.increment(db.QUERIES_METRICS_COUNTER);
	} catch (err) {
		await c.query('ROLLBACK').catch(() => {});
		logger.error('[DB] error flushing messages:', err);
	} finally {
		c.release();
		setTimeout(flushMessages, config.messagesFlushIntervalMs);
	}
}

export default {
	queueEntries: messageQueueEntries,

	queueInsert: queueMessageInsert,
	search: searchMessages,
	initFlushMessages: flushMessages,
};
