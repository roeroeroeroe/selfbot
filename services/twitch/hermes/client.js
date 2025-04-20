import events from './events.js';
import config from '../../../config.json' with { type: 'json' };
import logger from '../../logger.js';
import db from '../../db.js';
import utils from '../../../utils/index.js';

const WS_URL = `wss://hermes.twitch.tv/v1?clientId=${process.env.TWITCH_ANDROID_CLIENT_ID}`;
const HEALTH_CHECK_INTERVAL_MS = 2000;
const WS_RECONNECT_DELAY_MS = 5000;
const WS_CONNECTION_SPAWN_DELAY_MS = 1000;
const MAX_TOPICS_PER_CONNECTION = 100;
const MAX_CONNECTIONS = 100;
const BASE64URL_CHARSET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const CHANNEL_SUBS = [
	// 'activity-feed-alerts-v2',
	// 'activity-feed-moderator-v2',
	// 'ad-property-refresh',
	// 'ads',
	// 'ad-stitching',
	// 'alert-settings-update',
	// 'bits-ext-v1-transaction',
	// 'bits-rewards-celebration-v1',
	// 'broadcast-settings-update',
	// 'celebration-events-v1',
	// 'channel-bit-events-public',
	// 'channel-bits-onetap-events',
	// 'channel-bounty-board-events',
	// 'channel-emote-updates',
	// 'channel-sub-gifts-v1',
	// 'charity-campaign-donation-events-v1',
	// 'collaboration-status-channel-refetch',
	// 'community-points-channel-v1',
	// 'content-classification-labels-v1',
	// 'content-policy-properties',
	// 'creator-goals-events-v1',
	// 'extension-control',
	// 'guest-star-channel-v1',
	// 'hype-train-events-v1',
	// 'hype-train-events-v2',
	// 'leaderboard-events-v1',
	// 'pinned-chat-updates-v1',
	// 'plusprogram-points-v1',
	// 'polls',
	'raid',
	// 'request-to-join-channel-v1',
	// 'request-to-join-moderator-v1',
	// 'shared-chat-channel-v1',
	// 'shoutout',
	// 'sponsorships-v1',
	// 'stream-chat-room-v1',
	// 'upload',
	// 'upload-v2',
	// 'user-image-update',
	// 'video-playback',
];

const connections = [],
	subscriptionQueue = [],
	topicIdToChannelIdMap = new Map();
let idCounter = 0,
	lastCreationTime = 0,
	isProcessingQueue = false;

async function init() {
	validateConfig();
	subscribe('chatrooms-user-v1', config.bot.id);
	const channels = await db.query('SELECT id FROM channels');
	for (const channel of channels)
		for (const sub of CHANNEL_SUBS) subscribe(sub, channel.id);

	return channels.length * CHANNEL_SUBS.length + 1;
}

// prettier-ignore
function validateConfig() {
	const { maxHermesConnections, maxHermesTopicsPerConnection } = config;
	if (typeof maxHermesConnections !== 'number' || maxHermesConnections < 1)
		throw new Error('maxHermesConnections can not be less than 1');
	if (maxHermesConnections > MAX_CONNECTIONS)
		throw new Error(`maxHermesConnections can not be greater than ${MAX_CONNECTIONS}`);
	if (typeof maxHermesTopicsPerConnection !== 'number' || maxHermesTopicsPerConnection < 1)
		throw new Error('maxHermesTopicsPerConnection can not be less than 1');
	if (maxHermesTopicsPerConnection > MAX_TOPICS_PER_CONNECTION)
		throw new Error(`maxHermesTopicsPerConnection can not be greater than ${MAX_TOPICS_PER_CONNECTION}`);
}

function connect(c) {
	c.ws.addEventListener('open', () => {
		logger.debug(`[Hermes] [connection ${c.id}] connected`);
		c.pendingTopics = c.topics;
		c.isAuthenticated = false;
		c.ws.send(
			JSON.stringify({
				id: utils.randomString(BASE64URL_CHARSET, 21),
				type: 'authenticate',
				authenticate: {
					token: process.env.TWITCH_ANDROID_TOKEN,
				},
				timestamp: new Date().toISOString(),
			})
		);
	});

	c.ws.addEventListener('message', ({ data }) => {
		let msg;
		try {
			msg = JSON.parse(data);
		} catch (err) {
			logger.error(
				`[Hermes] [connection ${c.id}] failed to parse message: ${err}`
			);
			return;
		}

		handleWSMessage(c, msg);
	});

	c.ws.addEventListener('error', err =>
		logger.error(`[Hermes] [connection ${c.id}] error:`, err)
	);

	c.ws.addEventListener('close', ({ code, reason }) => {
		logger.debug(
			`[Hermes] [connection ${c.id}] disconnected: code: ${code}, reason: ${reason}`
		);
		if (c.healthCheckInterval) clearInterval(c.healthCheckInterval);

		const index = connections.indexOf(c);
		if (index !== -1) connections.splice(index, 1);

		if (!c.topics.length) {
			logger.debug(
				`[Hermes] [connection ${c.id}] not reconnecting as no topics remain`
			);
			return;
		}

		setTimeout(() => {
			logger.debug(`[Hermes] [connection ${c.id}] attempting reconnect...`);
			const newConnection = {
				ws: new WebSocket(WS_URL),
				id: c.id,
				topics: [...c.topics],
			};
			connections.push(newConnection);
			connect(newConnection);
		}, WS_RECONNECT_DELAY_MS);
	});
}

function handleWSMessage(c, msg) {
	switch (msg.type) {
		case 'welcome':
			c.keepAliveMs = ((msg.welcome?.keepaliveSec || 10) + 2.5) * 1000;
			c.recoveryUrl = msg.welcome?.recoveryUrl; // TODO
			c.lastKeepaliveTime = Date.now();
			c.healthCheckInterval = setInterval(() => {
				if (Date.now() - c.lastKeepaliveTime > c.keepAliveMs) {
					logger.warning(
						`[Hermes] [connection ${c.id}] missed keepalive, reconnecting...`
					);
					clearInterval(c.healthCheckInterval);
					if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
				}
			}, HEALTH_CHECK_INTERVAL_MS);
			logger.debug(
				`[Hermes] [connection ${c.id}] received welcome, keepAliveMs set to ${c.keepAliveMs}`
			);
			break;

		case 'authenticateResponse':
			if (msg.authenticateResponse?.result === 'ok') {
				c.isAuthenticated = true;
				logger.debug(
					`[Hermes] [connection ${c.id}] authenticated successfully`
				);
				for (const topic of c.pendingTopics)
					c.ws.send(JSON.stringify(buildSubscriptionMessage(topic)));
				delete c.pendingTopics;
			} else {
				for (const topic of c.pendingTopics)
					topicIdToChannelIdMap.delete(topic.id);
				logger.error(
					`[Hermes] [connection ${c.id}] authentication failed: ${msg.authenticateResponse?.error}`
				);
				if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
			}
			break;

		case 'keepalive':
			c.lastKeepaliveTime = Date.now();
			break;

		case 'subscribeResponse':
			if (msg.subscribeResponse?.result === 'error') {
				logger.error(
					`[Hermes] [connection ${c.id}] error subscribing: ${msg.subscribeResponse.error} (code: ${msg.subscribeResponse.errorCode})`
				);
				if (!msg.parentId) {
					logger.warning(
						`[Hermes] [connection ${c.id}] not removing failed subscription: got no parent id:`,
						msg
					);
					return;
				}
				const topicIndex = c.topics.findIndex(t => t.id === msg.parentId);
				if (topicIndex !== -1) {
					const [removedTopic] = c.topics.splice(topicIndex, 1);
					topicIdToChannelIdMap.delete(removedTopic.id);
					logger.debug(
						`[Hermes] [connection ${c.id}] removed failed subscription to ${removedTopic.topicString}`
					);
				} else {
					logger.warning(
						`[Hermes] [connection ${c.id}] failed to find failed subscription with id ${msg.parentId}`
					);
				}
			}
			break;

		case 'unsubscribeResponse':
			if (msg.unsubscribeResponse?.result === 'error')
				logger.error(
					`[Hermes] [connection ${c.id}] error unsubscribing: ${msg.unsubscribeResponse.error} (code: ${msg.unsubscribeResponse.errorCode})`
				);
			break;

		case 'notification':
			if (!msg.notification?.pubsub) {
				logger.warning(
					`[Hermes] [connection ${c.id}] no pubsub data in notification: ${JSON.stringify(msg)}`
				);
				return;
			}
			if (!msg.notification.subscription?.id) {
				logger.warning(
					`[Hermes] [connection ${c.id}] no subscription id in notification: ${JSON.stringify(msg)}`
				);
				return;
			}

			let pubsubData;
			try {
				pubsubData = JSON.parse(msg.notification.pubsub);
			} catch (err) {
				logger.error(
					`[Hermes] [connection ${c.id}] failed to parse notification pubsub data:`,
					err
				);
				return;
			}

			pubsubData.channelId = topicIdToChannelIdMap.get(
				msg.notification.subscription.id
			);
			if (!pubsubData.channelId) {
				logger.warning(
					`[Hermes] [connection ${c.id}] unknown subscription id: ${msg.notification.subscription.id}`
				);
				return;
			}

			handlePubsubData(pubsubData);
			break;

		case 'reconnect':
			logger.debug(`[Hermes] [connection ${c.id}] server requested reconnect`);
			if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
			break;

		default:
			logger.warning(
				`[Hermes] [connection ${c.id}] unknown message type: ${msg.type}`
			);
	}
}

function handlePubsubData(pubsubData = {}) {
	if (!pubsubData.type) {
		logger.warning(
			`[Hermes] missing type in pubsub data: ${JSON.stringify(pubsubData)}`
		);
		return;
	}

	const eventHandler = events[pubsubData.type];
	if (eventHandler) eventHandler(pubsubData);
}

function buildSubscriptionMessage(topic) {
	return {
		type: 'subscribe',
		id: topic.id,
		subscribe: {
			id: topic.id,
			type: 'pubsub',
			pubsub: { topic: topic.topicString },
		},
		timestamp: new Date().toISOString(),
	};
}

async function processQueue() {
	if (isProcessingQueue) return;
	isProcessingQueue = true;

	while (subscriptionQueue.length)
		await handleSubscription(subscriptionQueue.shift());

	isProcessingQueue = false;
}

async function handleSubscription(subscription) {
	const topicId = utils.randomString(BASE64URL_CHARSET, 21);
	const topicString = `${subscription.sub}.${subscription.channelId}`;

	let c = connections.find(
		c => c.topics.length < config.maxHermesTopicsPerConnection
	);
	if (c) {
		c.topics.push({ topicString, id: topicId });
		topicIdToChannelIdMap.set(topicId, subscription.channelId);
		if (c.isAuthenticated)
			c.ws.send(
				JSON.stringify(buildSubscriptionMessage({ topicString, id: topicId }))
			);
		return;
	}

	const waitTime = Math.max(
		0,
		WS_CONNECTION_SPAWN_DELAY_MS - (Date.now() - lastCreationTime)
	);
	if (waitTime) await utils.sleep(waitTime);

	if (connections.length >= config.maxHermesConnections) {
		logger.warning(
			`[Hermes] connection limit reached, not subscribing to ${topicString}`
		);
		return;
	}

	const ws = new WebSocket(WS_URL);
	lastCreationTime = Date.now();

	c = {
		ws,
		id: ++idCounter,
		topics: [{ topicString, id: topicId }],
	};
	topicIdToChannelIdMap.set(topicId, subscription.channelId);
	connect(c);
	connections.push(c);
}

function subscribe(sub, channelId) {
	subscriptionQueue.push({ sub, channelId });
	processQueue();
}

function unsubscribe(sub, channelId) {
	const topicString = `${sub}.${channelId}`;
	for (const c of connections) {
		const topicIndex = c.topics.findIndex(t => t.topicString === topicString);
		if (topicIndex === -1) continue;
		const topic = c.topics[topicIndex];

		if (c.isAuthenticated)
			c.ws.send(
				JSON.stringify({
					type: 'unsubscribe',
					id: utils.randomString(BASE64URL_CHARSET, 21),
					unsubscribe: {
						id: topic.id,
						type: 'pubsub',
						pubsub: {
							topic: topicString,
						},
					},
					timestamp: new Date().toISOString(),
				})
			);

		c.topics.splice(topicIndex, 1);
		topicIdToChannelIdMap.delete(topic.id);

		if (!c.topics.length) {
			logger.debug(`[Hermes] [connection ${c.id}] closing as no topics remain`);
			c.ws.close();
			const index = connections.indexOf(c);
			if (index !== -1) connections.splice(index, 1);
		}

		return;
	}

	logger.warning(`[Hermes] no subscription found for ${topicString}`);
}

export default {
	CHANNEL_SUBS,
	connections,

	init,
	subscribe,
	unsubscribe,
};
