import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import * as constants from './constants.js';
import config from '../../../config.json' with { type: 'json' };
import events, { subs } from './events/index.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';
import metrics from '../../metrics/index.js';
import {
	init as initPredictions,
	cleanup as cleanupPredictions,
} from './events/prediction.js';

const connections = new Map();
const topicsById = new Map();
const topicsByName = new Map();
const taskQueue = new AsyncQueue(processTask);
const spawnRateLimiter = new SlidingWindowRateLimiter(
	constants.WS_CONNECTION_SPAWN_WINDOW_MS,
	constants.WS_CONNECTION_SPAWNS_PER_WINDOW
);
let connectionIdCounter = 0;

function init() {
	if (config.twitch.hermes.subscribeToUserTopics)
		for (const sub of subs.user) subscribe(sub, config.bot.id);
	initPredictions();
}
// prettier-ignore
function subscribe(sub, channelId) {
	const topicString = `${sub}.${channelId}`;
	if (topicsByName.has(topicString)) {
		logger.debug('[Hermes] subscribe: already subscribed to', topicString);
		return;
	}

	const { maxConnections, maxTopicsPerConnection } = config.twitch.hermes;
	if (topicsById.size >= maxConnections * maxTopicsPerConnection) {
		logger.debug('[Hermes] subscribe: max topics reached,',
		             'not subscribing to', topicString);
		return;
	}

	const id = utils.randomString(utils.BASE64URL_CHARSET, constants.ID_LENGTH);
	const topic = {
		id,
		topicString,
		channelId,
		state: constants.TopicState.SUBSCRIBING,
		connection: null,
	};
	topicsById.set(id, topic);
	topicsByName.set(topicString, topic);
	metrics.gauge.set(metrics.names.gauges.HERMES_TOPICS, topicsById.size);

	taskQueue.enqueue({ type: 'subscribe', topic });
	logger.debug('[Hermes] subscribe: enqueued task for', topicString);
}

function subscribeToChannel(channelId) {
	for (const sub of subs.channel) subscribe(sub, channelId);
	return subs.channel.length;
}

function unsubscribe(sub, channelId) {
	const topicString = `${sub}.${channelId}`;
	const topic = topicsByName.get(topicString);
	if (!topic) {
		logger.debug('[Hermes] unsubscribe: no subscription for', topicString);
		return;
	}

	topic.state = constants.TopicState.UNSUBSCRIBING;
	taskQueue.removeMatching(
		item => item.type === 'subscribe' && item.topic.id === topic.id
	);
	taskQueue.enqueue({ type: 'unsubscribe', topic });
	logger.debug('[Hermes] unsubscribe: enqueued task for', topicString);
}

function unsubscribeFromChannel(channelId) {
	for (const sub of subs.channel) unsubscribe(sub, channelId);
	return subs.channel.length;
}
// prettier-ignore
async function processTask({ type, topic }) {
	if (!topicsById.has(topic.id))
		return;
	logger.debug(`[Hermes] processTask: ${type} ${topic.topicString}`);

	if (type === 'subscribe') {
		if (topic.state !== constants.TopicState.SUBSCRIBING)
			return;
		let c;
		const max = config.twitch.hermes.maxTopicsPerConnection;
		for (const conn of connections.values())
			if (conn.topics.size + conn.pending.subscribe < max) {
				c = conn;
				logger.debug('[Hermes] processTask: using',
				             `connection ${c.id} for ${topic.topicString}`);
				break;
			}
		if (!c) {
			if (connections.size >= config.twitch.hermes.maxConnections) {
				logger.debug('[Hermes] processTask: max connections',
				             'reached, not subscribing to', topic.topicString);
				cleanupTopic(topic);
				return;
			}
			await spawnRateLimiter.wait();
			c = createConnection();
		}
		c.topics.add(topic);
		topic.connection = c;
		if (c.ready)
			sendMessage(c, 'subscribe', topic);
	} else if (type === 'unsubscribe') {
		const c = topic.connection;
		if (c?.ready)
			sendMessage(c, 'unsubscribe', topic);
		else
			cleanupTopic(topic);
	} else
		throw new Error(`unknown task type: ${type}`);
}
// prettier-ignore
function createConnection() {
	const c = {
		id: ++connectionIdCounter,
		ws: new WebSocket(constants.WS_URL),
		ready: false,
		topics: new Set(),
		pending: { authenticate: 0, subscribe: 0, unsubscribe: 0 },
		keepAliveMs: 0,
		healthTimeout: null,
	};
	connections.set(c.id, c);
	metrics.gauge.set(metrics.names.gauges.HERMES_CONNECTIONS, connections.size);
	logger.debug(`[Hermes] [connection ${c.id}] created`);

	c.ws.addEventListener('open', () => {
		logger.debug(`[Hermes] [connection ${c.id}] open`);
		if (process.env.TWITCH_HERMES_TOKEN) {
			sendMessage(c, 'authenticate');
			return;
		}
		c.ready = true;
		for (const topic of c.topics)
			if (topic.state === constants.TopicState.UNSUBSCRIBING)
				sendMessage(c, 'unsubscribe', topic);
			else
				sendMessage(c, 'subscribe', topic);
		closeIfIdle(c);
	});
	c.ws.addEventListener('message', ({ data }) => {
		resetHealthTimeout(c);
		let msg;
		try {
			msg = JSON.parse(data);
		} catch {
			logger.error(`[Hermes] [connection ${c.id}] malformed JSON`);
			return;
		}
		const handler = wsMessageHandlers[msg.type];
		if (handler)
			handler(c, msg);
		else
			logger.warning(`[Hermes] [connection ${c.id}] unknown`,
			               `message type ${msg.type}:`, msg);
	});
	c.ws.addEventListener('error', ({ error: err }) => {
		logger.error(`[Hermes] [connection ${c.id}] error:`, err?.message || err);
		const state = c.ws.readyState;
		if (state !== WebSocket.CLOSING && state !== WebSocket.CLOSED)
			c.ws.close();
	});
	c.ws.addEventListener('close', ({ code, reason }) => {
		logger.debug(`[Hermes] [connection ${c.id}] closed (${code}): ${reason}`);
		clearTimeout(c.healthTimeout);
		connections.delete(c.id);
		metrics.gauge.set(metrics.names.gauges.HERMES_CONNECTIONS,
		                  connections.size);
		setTimeout(() => {
			for (const topic of c.topics)
				if (topic.state === constants.TopicState.UNSUBSCRIBING)
					cleanupTopic(topic);
				else {
					topic.state = constants.TopicState.SUBSCRIBING;
					topic.connection = null;
					taskQueue.enqueue({ type: 'subscribe', topic });
				}
		}, constants.RESUBSCRIBE_DELAY_MS);
	});

	return c;
}
// prettier-ignore
function sendMessage(c, type, topic) {
	const id =
		topic?.id ||
		utils.randomString(utils.BASE64URL_CHARSET, constants.ID_LENGTH);
	const msg = { type, id, timestamp: new Date().toISOString() };
	if (type === 'authenticate')
		msg.authenticate = { token: process.env.TWITCH_HERMES_TOKEN };
	else
		msg[type] = { id, type: 'pubsub', pubsub: { topic: topic.topicString } };
	c.ws.send(JSON.stringify(msg));
	c.pending[type]++;
	logger.debug(`[Hermes] [connection ${c.id}] sent ${type}`,
	             `(id=${id})${topic ? ` to ${topic.topicString}` : ''}`);
}
// prettier-ignore
const wsMessageHandlers = {
	welcome: (c, msg) => {
		c.keepAliveMs = ((msg.welcome.keepaliveSec || 10) + 2.5) * 1000;
		logger.debug(`[Hermes] [connection ${c.id}] welcome, KA=${c.keepAliveMs}ms`);
		resetHealthTimeout(c);
	},
	keepalive: () => {},
	reconnect: c => {
		logger.debug(`[Hermes] [connection ${c.id}] server requested reconnect`);
		metrics.counter.increment(metrics.names.counters.HERMES_RECONNECTS_RX);
		c.ws.close();
	},
	authenticateResponse: (c, msg) => {
		c.pending.authenticate--;
		if (msg.authenticateResponse.result === 'error') {
			handleAuthError(c, msg.authenticateResponse);
			return;
		}
		c.ready = true;
		logger.debug(`[Hermes] [connection ${c.id}] authenticated`);
		for (const topic of c.topics)
			if (topic.state === constants.TopicState.UNSUBSCRIBING)
				sendMessage(c, 'unsubscribe', topic);
			else
				sendMessage(c, 'subscribe', topic);
		closeIfIdle(c);
	},
	subscribeResponse: (c, msg) => {
		c.pending.subscribe--;
		const topic = topicsById.get(msg.parentId);
		if (!topic) {
			closeIfIdle(c);
			return;
		}
		if (msg.subscribeResponse.result === 'error') {
			handleSubError(c, topic, msg.subscribeResponse);
			return;
		}
		if (topic.state !== constants.TopicState.SUBSCRIBING)
			return;
		topic.state = constants.TopicState.SUBSCRIBED;
		logger.debug(`[Hermes] [connection ${c.id}] subscribed ok`,
		             `to ${topic.topicString}`);
	},
	unsubscribeResponse: (c, msg) => {
		c.pending.unsubscribe--;
		const topic = topicsById.get(msg.parentId);
		if (topic) {
			logger.debug(`[Hermes] [connection ${c.id}] unsubscribed`,
			             `from ${topic.topicString}`);
			cleanupTopic(topic);
		}
		closeIfIdle(c);
	},
	notification: (c, msg) => {
		metrics.counter.increment(metrics.names.counters.HERMES_NOTIFICATIONS_RX);
		const raw = msg.notification?.pubsub;
		if (!raw) {
			logger.warning(`[Hermes] [connection ${c.id}] no pubsub data:`,
			               msg);
			return;
		}
		const subId = msg.notification?.subscription?.id;
		if (!subId) {
			logger.warning(`[Hermes] [connection ${c.id}] no subscription id:`,
			               msg);
			return;
		}
		const topic = topicsById.get(subId);
		if (!topic) {
			logger.warning(`[Hermes] [connection ${c.id}] unknown`,
			               `subscription id: ${subId}`);
			return;
		}
		let data;
		try {
			data = JSON.parse(raw);
		} catch {
			logger.warning(`[Hermes] [connection ${c.id}] malformed`,
			               'pubsub JSON:', raw);
			return;
		}
		if (!data.type) {
			logger.warning(`[Hermes] [connection ${c.id}] missing`,
			               'pubsub type:', data);
			return;
		}
		data.channelId = topic.channelId;
		const handler = events[data.type];
		if (!handler) {
			logger.debug(`[Hermes] [connection ${c.id}] unhandled`,
			             `event ${data.type}:`, data);
			return;
		}
		metrics.counter.increment(
			metrics.names.counters.HERMES_NOTIFICATIONS_PROCESSED
		);
		handler(data).catch(
			err => logger.error(`[Hermes] [connection ${c.id}] ${data.type}`,
			                    'handler error:', err)
		);
	},
};

function handleAuthError(c, { error = 'N/A', errorCode = 'N/A' }) {
	switch (errorCode) {
		case constants.AUTH_ERROR.AUTH001:
		case constants.AUTH_ERROR.AUTH002:
			logger.fatal(
				`[Hermes] [connection ${c.id}] auth error: ${errorCode} ${error}`
			);
			break;
		default:
			logger.warning(
				`[Hermes] [connection ${c.id}] unknown auth error code:`,
				errorCode,
				error
			);
			c.ws.close();
	}
}

function handleSubError(c, topic, { error = 'N/A', errorCode = 'N/A' }) {
	logger.warning(
		`[Hermes] [connection ${c.id}] sub error:`,
		topic.topicString,
		errorCode,
		error
	);
	switch (errorCode) {
		case constants.SUB_ERROR.SUB001:
		case constants.SUB_ERROR.SUB006:
			taskQueue.enqueue({ type: 'subscribe', topic });
			break;
		case constants.SUB_ERROR.SUB002:
		case constants.SUB_ERROR.SUB004:
		case constants.SUB_ERROR.SUB007:
			cleanupTopic(topic);
			break;
		default:
			logger.warning(
				`[Hermes] [connection ${c.id}] unknown sub error code:`,
				`${errorCode} ${error} for topic ${topic.topicString}`
			);
			cleanupTopic(topic);
	}
}

function cleanupTopic(topic) {
	const c = topic.connection;
	if (c) {
		c.topics.delete(topic);
		topic.connection = null;
		if (c.ready && c.ws.readyState === WebSocket.OPEN) closeIfIdle(c);
	}
	topicsById.delete(topic.id);
	topicsByName.delete(topic.topicString);
	metrics.gauge.set(metrics.names.gauges.HERMES_TOPICS, topicsById.size);
}
// prettier-ignore
function closeIfIdle(c) {
	if (!c.topics.size && !c.pending.authenticate &&
	    !c.pending.subscribe && !c.pending.unsubscribe)
		c.ws.close();
}

function resetHealthTimeout(c) {
	clearTimeout(c.healthTimeout);
	c.healthTimeout = setTimeout(() => {
		metrics.counter.increment(metrics.names.counters.HERMES_MISSED_KEEPALIVES);
		logger.debug(`[Hermes] [connection ${c.id}] missed keepalive`);
		c.ws.close();
	}, c.keepAliveMs);
}

function cleanup() {
	taskQueue.clear();
	cleanupPredictions();
	for (const c of connections.values()) {
		clearTimeout(c.healthTimeout);
		c.topics.clear();
		if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
	}
	connections.clear();
	topicsById.clear();
	topicsByName.clear();
}

export default {
	...constants,

	connections,
	topics: topicsById,

	init,
	subscribe,
	subscribeToChannel,
	unsubscribe,
	unsubscribeFromChannel,
	cleanup,
};
