import { ChatClient, ConnectionPool } from '@mastondzn/dank-twitch-irc';
import RateLimiter from '../rate_limiter.js';
import config from '../../config.json' with { type: 'json' };
import logger from '../logger.js';
import handle from '../message_handler.js';
import regex from '../../utils/regex.js';
import { getUsers } from './helix.js';
import { query, updateChannel, queueMessageInsert, getChannel } from '../db.js';
import { trimString, toPlural } from '../../utils/formatters.js';
import { sleep } from '../../utils/utils.js';

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

function registerCommonEvents(c, clientName) {
	c.on('connecting', () => logger.debug(`${clientName} connecting...`));
	c.on('ready', () => logger.info(`${clientName} connected`));
	c.on('error', err => logger.error(`${clientName} error:`, err.message));
	c.on('close', err => {
		if (err) logger.fatal(`${clientName} closed due to error:`, err);
	});
	// TODO
	c.on('NOTICE', msg => logger.warning(`${clientName} NOTICE:`, msg));
	// TODO
	c.on('USERNOTICE', msg => logger.debug(`${clientName} USERNOTICE:`, msg));
}

async function loadChannels(client) {
	try {
		const channels = await query(
			'SELECT id, login, display_name, suspended FROM channels'
		);
		const users = await getUsers(
			null,
			channels.map(c => c.id)
		);
		const channelsToJoin = [];

		for (const c of channels) {
			const user = users.get(c.id);
			if (!user) {
				if (!c.suspended) updateChannel(c.id, 'suspended', true);
				continue;
			} else if (c.suspended) updateChannel(c.id, 'suspended', false);
			if (c.login !== user.login) {
				await updateChannel(c.id, 'login', user.login);
				logger.info(
					`[TMI] loadChannels: name change: ${c.login} => ${user.login}`
				);
			}
			if (c.display_name !== user.display_name)
				await updateChannel(c.id, 'display_name', user.display_name);
			channelsToJoin.push(user.login);
		}

		for (const c of channelsToJoin)
			if (!client.joinedChannels.has(c)) client.join(c);

		return channelsToJoin.length;
	} catch (err) {
		logger.error('error loading channels:', err);
	}
}

export default class Client {
	// clients
	#anon;
	#authed;
	// rate limiters
	#slowModes;
	#joinRateLimiter;
	#sendRateLimiters = {};
	#sendQueues = new Map();
	#rateLimitSend;
	constructor() {
		if (!config.bot.login) throw new Error('missing bot login');
		if (!process.env.TWITCH_ANDROID_TOKEN)
			throw new Error('missing TWITCH_ANDROID_TOKEN environment variable');

		this.#anon = new ChatClient(GENERIC_CLIENT_OPTS);
		this.#authed = new ChatClient({
			username: config.bot.login,
			password: process.env.TWITCH_ANDROID_TOKEN,
			...GENERIC_CLIENT_OPTS,
		});

		this.#slowModes = new Map();
		this.#joinRateLimiter = new RateLimiter(
			JOINS_WINDOW_MS,
			MAX_JOINS_PER_WINDOW
		);

		if (config.rateLimits === 'regular') {
			if (
				config.authedClientConnectionsPoolSize >
				REGULAR_MAX_CONNECTIONS_POOL_SIZE
			)
				throw new Error(
					`authedClientConnectionsPoolSize can not be greater than ${REGULAR_MAX_CONNECTIONS_POOL_SIZE} with regular rate limits`
				);
			this.#sendRateLimiters.normal = new RateLimiter(
				MESSAGES_WINDOW_MS,
				REGULAR_MAX_MESSAGES_PER_WINDOW
			);
			this.#sendRateLimiters.privileged = new RateLimiter(
				MESSAGES_WINDOW_MS,
				REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED
			);
			this.#rateLimitSend = async msg => {
				if (msg.query.privileged) {
					this.#sendRateLimiters.normal.add();
					await this.#sendRateLimiters.privileged.wait();
				} else {
					await this.#sendRateLimiters.normal.wait();
					await this.#waitSlowMode(msg);
				}
			};
		} else if (config.rateLimits === 'verified') {
			if (
				config.authedClientConnectionsPoolSize >
				VERIFIED_MAX_CONNECTIONS_POOL_SIZE
			)
				throw new Error(
					`authedClientConnectionsPoolSize can not be greater than ${VERIFIED_MAX_CONNECTIONS_POOL_SIZE} with verified rate limits`
				);
			this.#sendRateLimiters.verified = new RateLimiter(
				MESSAGES_WINDOW_MS,
				VERIFIED_MAX_MESSAGES_PER_WINDOW
			);
			this.#rateLimitSend = async msg => {
				await this.#sendRateLimiters.verified.wait();
				if (!msg.query.privileged) await this.#waitSlowMode(msg);
			};
		} else {
			throw new Error(
				`invalid rate limits preset: ${config.rateLimits}, expected 'regular' or 'verified'`
			);
		}

		if (config.authedClientConnectionsPoolSize >= 2)
			this.#authed.use(
				new ConnectionPool(this.#authed, {
					poolSize: config.authedClientConnectionsPoolSize,
				})
			);

		registerCommonEvents(this.#anon, '[TMI] [anon]');
		registerCommonEvents(this.#authed, `[TMI] [${config.bot.login}]`);
		this.#anon.on('JOIN', msg =>
			logger.debug('[TMI] [anon] JOIN:', msg.rawSource)
		);

		this.#anon.on('ROOMSTATE', msg => {
			const slowMode = this.#getSlowMode(msg.channelID);
			slowMode.duration = Math.max(
				DEFAULT_SLOW_MODE_MS,
				(msg.slowModeDuration || 0) * 1000 + 100
			);
		});

		this.#anon.on('PRIVMSG', async msg => {
			// ignore shared chat
			if (msg.sourceChannelId !== msg.channelId) return;
			msg.receivedAt = performance.now();
			logger.debug('[TMI] [anon] PRIVMSG:', msg.rawSource);
			try {
				msg.query = await getChannel(msg.channelID);
				if (!msg.query) {
					logger.warning('[TMI] [anon] got no channel for message:', msg);
					return;
				}
			} catch (err) {
				logger.error(`error getting channel ${msg.channelName}:`, err);
				return;
			}
			if (msg.query.log)
				try {
					await queueMessageInsert(
						msg.channelID,
						msg.senderUserID,
						msg.messageText,
						msg.serverTimestamp.toISOString()
					);
				} catch (err) {
					logger.error('failed to queue message:', err);
				}
			if (msg.query.login !== msg.channelName) {
				logger.info(
					`[TMI] [anon] name change: ${msg.query.login} => ${msg.channelName}`
				);
				try {
					await updateChannel(
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
				const isPrivileged =
					msg.isMod || msg.badges.hasVIP || msg.badges.hasBroadcaster;
				if (!isPrivileged) {
					const slowMode = this.#getSlowMode(msg.channelID);
					const now = Date.now();
					if (slowMode.lastSend < now) slowMode.lastSend = now;
				}
				if (msg.query?.privileged !== isPrivileged)
					await updateChannel(
						msg.channelID,
						'privileged',
						isPrivileged,
						msg.query
					);
			}
			msg.client = this;
			msg.send = async (message, reply, mention) => {
				if (typeof message !== 'string') message = String(message);
				message = trimString(
					message,
					MESSAGE_MAX_LENGTH -
						((mention ? 3 + msg.senderUsername.length : 0) ||
							(reply ? 2 + msg.senderUsername.length : 0))
				).replace(/\n|\r/g, ' ');
				const triggeredPattern = regex.checkMessage(message);
				if (triggeredPattern) {
					logger.warning(
						`[TMI] [${config.bot.login}] caught message (pattern: ${triggeredPattern}, channel: ${msg.channelName}, invoked by: ${msg.senderUsername}): ${message}`
					);
					message = config.againstTOS;
				}

				let ircCommand = '';
				if (reply)
					ircCommand = `@reply-parent-msg-id=${msg.messageID} PRIVMSG #${msg.channelName} :${message}`;
				else if (mention)
					ircCommand = `PRIVMSG #${msg.channelName} :@${msg.senderUsername}, ${message}`;
				else ircCommand = `PRIVMSG #${msg.channelName} :${message}`;

				this.#sendQueues.set(
					msg.channelID,
					(this.#sendQueues.get(msg.channelID) || Promise.resolve()).then(
						async () => {
							await this.#rateLimitSend(msg);
							logger.debug(
								`[TMI] [${config.bot.login}] sending irc command: "${ircCommand}"`
							);
							this.#authed.sendRaw(ircCommand);
						}
					)
				);
			};
			handle(msg);
		});

		this.#anon.on('ready', async () => {
			this.connectedAt = Date.now();
			logger.debug('[TMI] [anon] ready, loading channels...');
			const c = await loadChannels(this);
			logger.info(`[TMI] [anon] joining ${c} ${toPlural(c, 'channel')}...`);
			setInterval(() => loadChannels(this), LOAD_CHANNELS_INTERVAL_MS);
		});
	}

	#getSlowMode(channelID) {
		if (!this.#slowModes.has(channelID))
			this.#slowModes.set(channelID, {
				duration: DEFAULT_SLOW_MODE_MS,
				lastSend: 0,
			});

		return this.#slowModes.get(channelID);
	}

	async #waitSlowMode(msg) {
		const slowMode = this.#getSlowMode(msg.channelID);
		const waitTime = Math.max(
			slowMode.duration - (Date.now() - slowMode.lastSend),
			0
		);
		if (waitTime > 0) {
			logger.debug(
				`[TMI] [${config.bot.login}] sleeping for ${waitTime}ms due to slow mode`
			);
			await sleep(waitTime);
		}
		slowMode.lastSend = Date.now();
	}

	connect() {
		this.#anon.connect();
		this.#authed.connect();
	}

	async join(channelName) {
		for (let i = 0; i <= config.joinRetries; i++) {
			await this.#joinRateLimiter.wait();
			logger.debug(
				`[TMI] [anon] trying to join #${channelName} (attempt ${i + 1})`
			);
			try {
				await this.#anon.join(channelName);
				return;
			} catch (err) {
				if (i === config.joinRetries)
					logger.error(
						`failed to join #${channelName} after ${i + 1} attempts`
					);
			}
		}
	}

	async part(channelName) {
		logger.debug(`[TMI] [anon] trying to part #${channelName}`);
		try {
			await this.#anon.part(channelName);
		} catch (err) {
			logger.error(`error parting #${channelName}:`, err);
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
