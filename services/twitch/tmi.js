import { ChatClient, ConnectionPool } from '@mastondzn/dank-twitch-irc';
import SlidingWindowRateLimiter from '../sliding_window_rate_limiter.js';
import AsyncQueue from '../async_queue.js';
import config from '../../config.json' with { type: 'json' };
import logger from '../logger.js';
import handle from '../message_handler.js';
import db from '../db.js';
import utils from '../../utils/index.js';
import helix from './helix/index.js';
import metrics from '../metrics.js';

const MESSAGES_RX_METRICS_COUNTER = 'tmi_messages_received';
const MESSAGES_TX_METRICS_COUNTER = 'tmi_messages_sent';
metrics.counter.create(MESSAGES_RX_METRICS_COUNTER);
metrics.counter.create(MESSAGES_TX_METRICS_COUNTER);

const MESSAGE_MAX_LENGTH = 500;
const DEFAULT_SLOW_MODE_MS = 1100;
const MESSAGES_WINDOW_MS = 30000;
const REGULAR_MAX_MESSAGES_PER_WINDOW = 19;
const REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED = 99;
const VERIFIED_MAX_MESSAGES_PER_WINDOW = 7499;
const JOINS_WINDOW_MS = 10000;
const MAX_JOINS_PER_WINDOW = 999;
const REGULAR_MAX_CONNECTIONS_POOL_SIZE = 20;
const VERIFIED_MAX_CONNECTIONS_POOL_SIZE = 200;
const LOAD_CHANNELS_INTERVAL_MS = 3600000;

const GENERIC_CLIENT_OPTS = {
	connection: {
		type: config.ircClientTransport,
		secure: true,
	},
	installDefaultMixins: false,
};

// base16 32char string - emulate webchat
const BOT_MESSAGES_NONCE = utils.randomString('0123456789abcdef', 32);

function registerCommonEvents(c, clientName) {
	c.on('connecting', () => logger.debug(`${clientName} connecting...`));
	c.on('ready', () => logger.info(`${clientName} connected`));
	c.on('error', err => logger.error(`${clientName} error:`, err.message));
	c.on('close', err => {
		if (err) logger.fatal(`${clientName} closed due to error:`, err);
	});
	c.on('NOTICE', msg => logger.debug(`${clientName} NOTICE:`, msg));
	c.on('USERNOTICE', msg => logger.debug(`${clientName} USERNOTICE:`, msg));
}

async function loadChannels(client) {
	try {
		const channels = await db.query(
			'SELECT id, login, display_name, suspended FROM channels'
		);
		const users = await helix.user.getMany(
			null,
			channels.map(c => c.id)
		);
		const channelsToJoin = [];

		for (const c of channels) {
			const user = users.get(c.id);
			if (!user) {
				if (!c.suspended) db.channel.update(c.id, 'suspended', true);
				continue;
			}
			if (c.suspended) db.channel.update(c.id, 'suspended', false);

			if (c.login !== user.login) {
				await db.channel.update(c.id, 'login', user.login);
				logger.info(
					`[TMI] loadChannels: name change: ${c.login} => ${user.login}`
				);
			}
			if (c.display_name !== user.display_name)
				await db.channel.update(c.id, 'display_name', user.display_name);

			channelsToJoin.push(user.login);
		}

		for (const c of channelsToJoin)
			if (!client.joinedChannels.has(c)) client.join(c);

		return channelsToJoin.length;
	} catch (err) {
		logger.error('error loading channels:', err);
	}
}

class Client {
	#anon;
	#authed;
	#slowModes = new Map();
	#joinRateLimiter = new SlidingWindowRateLimiter(
		JOINS_WINDOW_MS,
		MAX_JOINS_PER_WINDOW
	);
	#sendRateLimiters = {};
	#sendQueues = new Map();
	#rateLimitSend;
	#addToSendRateLimit;

	constructor() {
		if (!process.env.TWITCH_ANDROID_TOKEN)
			throw new Error('missing TWITCH_ANDROID_TOKEN environment variable');
		this.#initializeClients();
		this.#initRateLimiters();
		this.#registerEventHandlers();
	}

	#initializeClients() {
		this.#anon = new ChatClient(GENERIC_CLIENT_OPTS);
		this.#authed = new ChatClient({
			username: config.bot.login,
			password: process.env.TWITCH_ANDROID_TOKEN,
			...GENERIC_CLIENT_OPTS,
		});

		if (config.authedClientConnectionsPoolSize >= 2)
			this.#authed.use(
				new ConnectionPool(this.#authed, {
					poolSize: config.authedClientConnectionsPoolSize,
				})
			);
	}

	#initRateLimiters() {
		switch (config.rateLimits) {
			case 'regular':
				this.#sendRateLimiters.normal = new SlidingWindowRateLimiter(
					MESSAGES_WINDOW_MS,
					REGULAR_MAX_MESSAGES_PER_WINDOW
				);
				this.#sendRateLimiters.privileged = new SlidingWindowRateLimiter(
					MESSAGES_WINDOW_MS,
					REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED
				);
				this.#rateLimitSend = async msg => {
					if (msg.query.privileged) {
						this.#sendRateLimiters.normal.add();
						await this.#sendRateLimiters.privileged.wait();
					} else {
						this.#sendRateLimiters.privileged.add();
						await this.#sendRateLimiters.normal.wait();
						await this.#waitSlowMode(msg);
					}
				};
				this.#addToSendRateLimit = () => {
					this.#sendRateLimiters.normal.add();
					this.#sendRateLimiters.privileged.add();
				};
				break;
			case 'verified':
				this.#sendRateLimiters.verified = new SlidingWindowRateLimiter(
					MESSAGES_WINDOW_MS,
					VERIFIED_MAX_MESSAGES_PER_WINDOW
				);
				this.#rateLimitSend = async msg => {
					await this.#sendRateLimiters.verified.wait();
					if (!msg.query.privileged) await this.#waitSlowMode(msg);
				};
				this.#addToSendRateLimit = () => this.#sendRateLimiters.verified.add();
				break;
			default:
				throw new Error(`unhandled rate limit preset: ${config.rateLimits}`);
		}
	}

	#registerEventHandlers() {
		registerCommonEvents(this.#anon, '[TMI] [anon]');
		registerCommonEvents(this.#authed, `[TMI] [${config.bot.login}]`);
		this.#anon.on('JOIN', msg =>
			logger.debug('[TMI] [anon] JOIN:', msg.rawSource)
		);
		this.#anon.on('ROOMSTATE', msg => this.#handleRoomState(msg));
		this.#anon.on('PRIVMSG', msg => this.#handlePRIVMSG(msg));
		this.#anon.on('ready', () => this.#onAnonReady());
	}

	#handleRoomState(msg) {
		const slowMode = this.#getSlowMode(msg.channelID);
		slowMode.duration = Math.max(
			DEFAULT_SLOW_MODE_MS,
			(msg.slowModeDuration || 0) * 1000 + 100
		);
	}

	async #handlePRIVMSG(msg) {
		// ignore shared chat
		if (msg.sourceChannelId !== msg.channelId) return;

		msg.receivedAt = performance.now();
		logger.debug('[TMI] [anon] PRIVMSG:', msg.rawSource);
		metrics.counter.increment(MESSAGES_RX_METRICS_COUNTER);

		try {
			msg.query = await db.channel.get(msg.channelID);
			if (!msg.query) {
				logger.warning('[TMI] [anon] unknown channel:', msg.channelName);
				return;
			}
		} catch (err) {
			logger.error(`error getting channel ${msg.channelName}:`, err);
			return;
		}

		if (msg.query.log)
			try {
				await db.message.queueInsert(
					msg.channelID,
					msg.senderUserID,
					msg.messageText,
					msg.serverTimestamp.toISOString()
				);
			} catch (err) {
				logger.error('failed to queue message insert:', err);
			}

		if (msg.query.login !== msg.channelName) {
			logger.info(
				`[TMI] [anon] name change: ${msg.query.login} => ${msg.channelName}`
			);
			try {
				await db.channel.update(
					msg.channelID,
					'login',
					msg.channelName,
					msg.query
				);
			} catch (err) {
				logger.error('error updating channel:', err);
			}
		}

		if (msg.senderUserID === config.bot.id) {
			if (msg.ircTags['client-nonce'] !== BOT_MESSAGES_NONCE)
				this.#addToSendRateLimit();
			const isPrivileged =
				msg.isMod || msg.badges.hasVIP || msg.badges.hasBroadcaster;
			if (!isPrivileged) {
				const slowMode = this.#getSlowMode(msg.channelID);
				const now = Date.now();
				if (slowMode.lastSend < now) slowMode.lastSend = now;
			}
			if (msg.query.privileged !== isPrivileged)
				await db.channel.update(
					msg.channelID,
					'privileged',
					isPrivileged,
					msg.query
				);
		}

		msg.client = this;
		msg.send = async (text, reply, mention) =>
			this.#sendResult(msg, text, reply, mention);

		handle(msg);
	}

	async #sendResult(msg, text, reply, mention) {
		if (typeof text !== 'string') text = String(text);
		text = utils.format
			.trim(
				text,
				MESSAGE_MAX_LENGTH -
					((mention ? 3 + msg.senderUsername.length : 0) ||
						(reply ? 2 + msg.senderUsername.length : 0))
			)
			.replace(/\n|\r/g, ' ');

		const triggeredPattern = utils.regex.checkMessage(text);
		if (triggeredPattern) {
			logger.warning(
				`[TMI] [${config.bot.login}] caught message (pattern: ${triggeredPattern}, channel: ${msg.channelName}, invoked by: ${msg.senderUsername}): ${text}`
			);
			text = config.againstTOS;
		}

		let ircCommand;
		if (reply) {
			ircCommand = `@reply-parent-msg-id=${msg.messageID};client-nonce=${BOT_MESSAGES_NONCE} PRIVMSG #${msg.channelName} :${text}`;
		} else if (mention) {
			ircCommand = `@client-nonce=${BOT_MESSAGES_NONCE} PRIVMSG #${msg.channelName} :@${msg.senderUsername}, ${text}`;
		} else {
			ircCommand = `@client-nonce=${BOT_MESSAGES_NONCE} PRIVMSG #${msg.channelName} :${text}`;
		}

		let queue = this.#sendQueues.get(msg.channelID);
		if (!queue) {
			queue = new AsyncQueue(async ({ msg, ircCommand }) => {
				await this.#rateLimitSend(msg);
				logger.debug(
					`[TMI] [${config.bot.login}] sending irc command: "${ircCommand}"`
				);
				metrics.counter.increment(MESSAGES_TX_METRICS_COUNTER);
				this.#authed.sendRaw(ircCommand);
			});
			this.#sendQueues.set(msg.channelID, queue);
		}

		queue.enqueue({ msg, ircCommand });
	}

	async #onAnonReady() {
		this.connectedAt = Date.now();
		logger.debug('[TMI] [anon] ready, loading channels...');
		const c = await loadChannels(this);
		logger.info(
			`[TMI] [anon] joining ${c} ${utils.format.plural(c, 'channel')}...`
		);
		setInterval(() => loadChannels(this), LOAD_CHANNELS_INTERVAL_MS);
	}

	#getSlowMode(channelId) {
		if (!this.#slowModes.has(channelId))
			this.#slowModes.set(channelId, {
				duration: DEFAULT_SLOW_MODE_MS,
				lastSend: 0,
			});

		return this.#slowModes.get(channelId);
	}

	async #waitSlowMode(msg) {
		const slowMode = this.#getSlowMode(msg.channelID);
		const waitTime = Math.max(
			slowMode.duration - (Date.now() - slowMode.lastSend),
			0
		);
		if (waitTime) {
			logger.debug(
				`[TMI] [${config.bot.login}] sleeping for ${waitTime}ms due to slow mode`
			);
			await utils.sleep(waitTime);
		}
		slowMode.lastSend = Date.now();
	}

	connect() {
		this.#anon.connect();
		this.#authed.connect();
	}

	async join(channelLogin) {
		for (let i = 0; i <= config.joinRetries; i++) {
			await this.#joinRateLimiter.wait();
			logger.debug(
				`[TMI] [anon] trying to join #${channelLogin} (attempt ${i + 1})`
			);
			try {
				await this.#anon.join(channelLogin);
				return;
			} catch (err) {
				if (i === config.joinRetries)
					logger.error(
						`failed to join #${channelLogin} after ${i + 1} attempts`
					);
			}
		}
	}

	async part(channelLogin) {
		logger.debug(`[TMI] [anon] trying to part #${channelLogin}`);
		try {
			await this.#anon.part(channelLogin);
		} catch (err) {
			logger.error(`error parting #${channelLogin}:`, err);
		}
	}

	ping() {
		return this.#authed.ping();
	}

	get joinedChannels() {
		return this.#anon.joinedChannels;
	}

	get connections() {
		return this.#anon.connections;
	}
}

export default {
	REGULAR_MAX_CONNECTIONS_POOL_SIZE,
	VERIFIED_MAX_CONNECTIONS_POOL_SIZE,

	Client,
};
