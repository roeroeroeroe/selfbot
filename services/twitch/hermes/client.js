import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import * as constants from './constants.js';
import config from '../../../config.json' with { type: 'json' };
import events from './events.js';
import logger from '../../logger.js';
import db from '../../db/index.js';
import utils from '../../../utils/index.js';
import metrics from '../../metrics/index.js';

const connections = new Map(),
	topicsById = new Map(),
	topicsByName = new Map(),
	spawnRateLimiter = new SlidingWindowRateLimiter(
		constants.WS_CONNECTION_SPAWN_WINDOW_MS,
		constants.WS_CONNECTION_SPAWNS_PER_WINDOW
	),
	taskQueue = new AsyncQueue(processTask);
let connectionIdCounter = 0;

async function init() {
	for (const sub of constants.USER_SUBS) subscribe(sub, config.bot.id);
	const channels = await db.query('SELECT id FROM channels');
	for (const channel of channels)
		for (const sub of constants.CHANNEL_SUBS) subscribe(sub, channel.id);

	return (
		channels.length * constants.CHANNEL_SUBS.length + constants.USER_SUBS.length
	);
}

function subscribe(sub, channelId) {
	const topicString = `${sub}.${channelId}`;
	for (const t of topicsById.values())
		if (t.topicString === topicString) {
			logger.debug('[Hermes] subscribe: already subscribed to', topicString);
			return;
		}
	if (
		topicsById.size >=
		config.maxHermesConnections * config.maxHermesTopicsPerConnection
	)
		return logger.debug(
			'[Hermes] subscribe: max connections reached, not subscribing to',
			topicString
		);

	const id = utils.randomString(constants.BASE64URL_CHARSET, 21);
	const topic = {
		id,
		topicString,
		channelId: topicString.split('.').pop(),
		state: constants.TopicState.SUBSCRIBING,
		connectionId: null,
	};
	topicsById.set(id, topic);
	topicsByName.set(topicString, id);
	metrics.gauge.set(metrics.names.gauges.HERMES_TOPICS, topicsById.size);
	logger.debug('[Hermes] subscribe: enqueued task for', topicString);
	taskQueue.enqueue({ type: 'subscribe', topic });
}

function unsubscribe(sub, channelId) {
	const topicString = `${sub}.${channelId}`;
	const id = topicsByName.get(topicString);
	if (!id) {
		logger.debug(
			'[Hermes] unsubscribe: no existing subscription for',
			topicString
		);
		return;
	}
	const topic = topicsById.get(id);

	topic.state = constants.TopicState.UNSUBSCRIBING;
	taskQueue.removeMatching(
		item => item.type === 'subscribe' && item.topic.id === topic.id
	);
	logger.debug('[Hermes] unsubscribe: enqueued task for', topicString);
	taskQueue.enqueue({ type: 'unsubscribe', topic });
}

async function processTask({ type, topic }) {
	logger.debug(
		`[Hermes] processTask: processing ${type} for ${topic.topicString}`
	);
	if (!topic || !topicsById.has(topic.id)) return;
	switch (type) {
		case 'subscribe': {
			if (topic.state === constants.TopicState.UNSUBSCRIBING) {
				logger.debug(
					'[Hermes] processTask: skipping subscribe, topic is UNSUBSCRIBING:',
					topic.topicString
				);
				return;
			}
			let c;
			for (const conn of connections.values())
				if (
					conn.topicIds.size + conn.pending.subscribe <
					config.maxHermesTopicsPerConnection
				) {
					c = conn;
					logger.debug(
						`[Hermes] processTask: using connection ${c.id} for ${topic.topicString}`
					);
					break;
				}
			if (!c) {
				if (connections.size >= config.maxHermesConnections) {
					logger.debug(
						`[Hermes] max connections reached, not subscribing to ${topic.topicString}`
					);
					cleanupTopic(topic);
					return;
				}
				await spawnRateLimiter.wait();
				c = createConnection();
			}

			topic.connectionId = c.id;
			if (topic.state === constants.TopicState.UNSUBSCRIBING) return;
			c.topicIds.add(topic.id);
			if (c.isAuthenticated)
				sendMessage(c, 'subscribe', topic.topicString, topic.id);
			break;
		}
		case 'unsubscribe': {
			const c = connections.get(topic.connectionId);
			if (c?.isAuthenticated)
				sendMessage(c, 'unsubscribe', topic.topicString, topic.id);
			else cleanupTopic(topic);
			break;
		}
		default: {
			throw new Error(`unkown task type: ${type}`);
		}
	}
}

function createConnection() {
	const c = {
		id: ++connectionIdCounter,
		ws: new WebSocket(constants.WS_URL),
		isAuthenticated: false,
		topicIds: new Set(),
		pending: { authenticate: 0, subscribe: 0, unsubscribe: 0 },
		healthInterval: null,
		lastKeepalive: 0,
		keepAliveMs: 0,
	};
	connections.set(c.id, c);
	metrics.gauge.set(metrics.names.gauges.HERMES_CONNECTIONS, connections.size);
	logger.debug(`[Hermes] [connection ${c.id}] created`);

	c.ws.addEventListener('open', () => {
		logger.debug(`[Hermes] [connection ${c.id}] open`);
		sendMessage(c, 'authenticate');
	});
	c.ws.addEventListener('message', ({ data }) => {
		let msg;
		try {
			msg = JSON.parse(data);
		} catch {
			return logger.error(`[Hermes] [connection ${c.id}] malformed JSON`);
		}
		const handler = wsMessageHandlers[msg.type];
		if (handler) handler(c, msg);
		else
			logger.warning(
				`[Hermes] [connection ${c.id}] unknown message type "${msg.type}":`,
				msg
			);
	});
	c.ws.addEventListener('error', ({ error: err }) => {
		logger.error(`[Hermes] [connection ${c.id}] error:`, err?.message || err);
		if (
			c.ws.readyState !== WebSocket.CLOSING &&
			c.ws.readyState !== WebSocket.CLOSED
		)
			c.ws.close();
	});
	c.ws.addEventListener('close', ({ code, reason }) => {
		logger.debug(`[Hermes] [connection ${c.id}] close (${code}): ${reason}`);
		clearInterval(c.healthInterval);
		connections.delete(c.id);
		metrics.gauge.set(
			metrics.names.gauges.HERMES_CONNECTIONS,
			connections.size
		);

		for (const topicId of c.topicIds) {
			const topic = topicsById.get(topicId);
			if (!topic) continue;
			if (topic.state === constants.TopicState.UNSUBSCRIBING) {
				cleanupTopic(topic);
				continue;
			}
			topic.state = constants.TopicState.SUBSCRIBING;
			taskQueue.enqueue({ type: 'subscribe', topic });
		}
	});

	return c;
}

function sendMessage(
	c,
	type,
	topicString = '',
	id = utils.randomString(constants.BASE64URL_CHARSET, 21)
) {
	const msg = { type, id, timestamp: new Date().toISOString() };
	switch (type) {
		case 'authenticate':
			msg.authenticate = { token: process.env.TWITCH_ANDROID_TOKEN };
			break;
		case 'subscribe':
		case 'unsubscribe':
			msg[type] = { id, type: 'pubsub', pubsub: { topic: topicString } };
			break;
		default:
			throw new Error(`unknown message type: ${type}`);
	}
	c.ws.send(JSON.stringify(msg));
	c.pending[type]++;
	logger.debug(
		`[Hermes] [connection ${c.id}] sent ${type} (id=${id})${topicString ? ` to ${topicString}` : ''}`
	);
}

const wsMessageHandlers = {
	welcome: (c, msg) => {
		c.keepAliveMs = ((msg.welcome.keepaliveSec || 10) + 2.5) * 1000;
		logger.debug(`[Hermes] [connection ${c.id}] welcome, KA=${c.keepAliveMs}`);
		c.lastKeepalive = Date.now();
		c.healthInterval = setInterval(() => {
			if (Date.now() - c.lastKeepalive > c.keepAliveMs) {
				metrics.counter.increment(
					metrics.names.counters.HERMES_MISSED_KEEPALIVES
				);
				logger.debug(`[Hermes] [connection ${c.id}] missed keepalive`);
				clearInterval(c.healthInterval);
				c.ws.close();
			}
		}, constants.HEALTH_CHECK_INTERVAL_MS);
	},
	keepalive: c => {
		c.lastKeepalive = Date.now();
	},
	reconnect: c => {
		logger.debug(`[Hermes] [connection ${c.id}] server requested reconnect`);
		metrics.counter.increment(metrics.names.counters.HERMES_RECONNECTS_RX);
		c.ws.close();
	},
	authenticateResponse: (c, msg) => {
		c.pending.authenticate--;
		if (msg.authenticateResponse?.result !== 'ok') {
			logger.error(
				`[Hermes] [connection ${c.id}] auth error:`,
				msg.authenticateResponse?.error || 'N/A',
				msg.authenticateResponse?.errorCode || 'N/A'
			);
			c.ws.close();
			return;
		}
		c.isAuthenticated = true;
		logger.debug(`[Hermes] [connection ${c.id}] authenticated`);
		if (isConnectionIdle(c)) return c.ws.close();
		for (const topicId of c.topicIds) {
			const topic = topicsById.get(topicId);
			if (!topic) continue;
			sendMessage(
				c,
				topic.state === constants.TopicState.UNSUBSCRIBING
					? 'unsubscribe'
					: 'subscribe',
				topic.topicString,
				topic.id
			);
		}
	},
	subscribeResponse: (c, msg) => {
		c.pending.subscribe--;
		const topic = topicsById.get(msg.parentId);
		if (!topic) c.topicIds.delete(msg.parentId);
		else if (
			topic.state === constants.TopicState.SUBSCRIBING &&
			msg.subscribeResponse?.result === 'ok'
		) {
			topic.state = constants.TopicState.SUBSCRIBED;
			logger.debug(
				`[Hermes] [connection ${c.id}] subscribed ok to ${topic.topicString}`
			);
		} else if (msg.subscribeResponse?.result === 'error')
			if (msg.subscribeResponse.error === 'too many subscriptions') {
				topic.state = constants.TopicState.SUBSCRIBING;
				return taskQueue.enqueue({ type: 'subscribe', topic });
			} else {
				logger.error(
					`[Hermes] [connection ${c.id}] sub error:`,
					topic.topicString,
					msg.subscribeResponse.error,
					msg.subscribeResponse.errorCode
				);
				return cleanupTopic(topic, c);
			}
		if (c.isAuthenticated && isConnectionIdle(c)) c.ws.close();
	},
	unsubscribeResponse: (c, msg) => {
		c.pending.unsubscribe--;
		const topic = topicsById.get(msg.parentId);
		if (topic) {
			logger.debug(
				`[Hermes] [connection ${c.id}] unsubscribed from ${topic.topicString}`
			);
			return cleanupTopic(topic, c);
		}
		c.topicIds.delete(msg.parentId);
		if (c.isAuthenticated && isConnectionIdle(c)) c.ws.close();
	},
	// prettier-ignore
	notification: (c, msg) => {
		metrics.counter.increment(metrics.names.counters.HERMES_NOTIFICATIONS_RX);
		const raw = msg.notification?.pubsub;
		if (!raw)
			return logger.warning(`[Hermes] [connection ${c.id}] no pubsub data:`, msg);
		const subId = msg.notification?.subscription?.id;
		if (!subId)
			return logger.warning(`[Hermes] [connection ${c.id}] no subscription id:`, msg);
		const topic = topicsById.get(subId);
		if (!topic)
			return logger.warning(`[Hermes] [connection ${c.id}] unknown subscription id:`, subId);
		let data;
		try {
			data = JSON.parse(msg.notification.pubsub);
		} catch {
			return logger.error(`[Hermes] [connection ${c.id}] malformed pubsub JSON:`, msg.notification.pubsub);
		}
		if (!data.type)
			return logger.warning(`[Hermes] [connection ${c.id}] missing pubsub type:`, data);
		data.channelId = topic.channelId;
		const handler = events[data.type];
		if (handler) {
			metrics.counter.increment(metrics.names.counters.HERMES_NOTIFICATIONS_PROCESSED);
			handler(data);
		}
	},
};

function isConnectionIdle(c) {
	return !(
		c.topicIds.size |
		c.pending.authenticate |
		c.pending.subscribe |
		c.pending.unsubscribe
	);
}

function cleanupTopic(topic, c = connections.get(topic.connectionId)) {
	if (c) {
		c.topicIds.delete(topic.id);
		if (
			c.isAuthenticated &&
			c.ws.readyState === WebSocket.OPEN &&
			isConnectionIdle(c)
		)
			c.ws.close();
		logger.debug(
			`[Hermes] [connection ${c.id}] cleaned up topic ${topic.topicString}`
		);
	}
	topicsById.delete(topic.id);
	topicsByName.delete(topic.topicString);
	metrics.gauge.set(metrics.names.gauges.HERMES_TOPICS, topicsById.size);
}

export default {
	...constants,

	connections,
	topics: topicsById,

	init,
	subscribe,
	unsubscribe,
};
