import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import * as constants from './constants.js';
import db from '../../db/index.js';
import twitch from '../index.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

export default class ChannelManager {
	#joinControllers = new Map();
	#loadInterval;
	#joinedChannelsCache = { channels: null, expiresAt: 0 };
	constructor(anonClient) {
		this.anon = anonClient;
		this.joinQueue = new AsyncQueue(job => this.#joinWorker(job));
		this.joinRateLimiter = new SlidingWindowRateLimiter(
			constants.JOINS_WINDOW_MS,
			constants.MAX_JOINS_PER_WINDOW
		);
		this.#joinedChannelsCache.channels = anonClient.joinedChannels;
		this.#joinedChannelsCache.expiresAt =
			performance.now() + constants.JOINED_CHANNELS_CACHE_TTL_MS;
	}
	// prettier-ignore
	async #load() {
		try {
			const t0 = performance.now();
			const channels = await db.query(
				'SELECT id, login, display_name, suspended FROM channels'
			);
			const t1 = performance.now();
			const usersMap = await twitch.helix.user.getMany(
				null, channels.map(c => c.id)
			);
			const t2 = performance.now();
			logger.debug(`[ChannelManager] load: db: ${channels.length} in`,
			             `${(t1 - t0).toFixed(3)}ms, twitch: ${usersMap.size}`,
			             `in ${(t2 - t1).toFixed(3)}ms`);
			for (let i = 0, c, u; i < channels.length; i++) {
				if (!(u = usersMap.get((c = channels[i]).id))) {
					if (!c.suspended) {
						await db.channel.update(c.id, 'suspended', true);
						logger.info('[ChannelManager] channel suspended:',
						            c.login);
					}
					continue;
				}
				if (c.suspended) {
					await db.channel.update(c.id, 'suspended', false);
					logger.info('[ChannelManager] channel unsuspended:',
					            c.login);
				}
				if (c.login !== u.login) {
					await db.channel.update(c.id, 'login', u.login);
					logger.info(`[ChannelManager] name change: ${c.login}`,
					            `-> ${u.login}`);
				}
				if (c.display_name !== u.display_name)
					await db.channel.update(c.id, 'display_name', u.display_name);

				twitch.hermes.subscribeToChannel(c.id);
				this.join(u.login);
			}
		} catch (err) {
			logger.error('error loading channels:', err);
		}
	}

	init() {
		this.#load();
		this.#loadInterval = setInterval(
			() => this.#load(),
			constants.LOAD_INTERVAL_MS
		);
	}

	async #joinWorker({ channel: c, controller }) {
		if (this.joinedChannels.has(c)) {
			this.#joinControllers.delete(c);
			return;
		}
		if (controller.signal.aborted) {
			this.#joinControllers.delete(c);
			logger.debug(`[ChannelManager] join ${c} canceled`);
			return;
		}
		await this.joinRateLimiter.wait();
		logger.debug(`[ChannelManager] trying to join ${c}`);
		utils
			.retry(
				() => {
					if (controller.signal.aborted) {
						const err = new Error('aborted');
						err.retryable = false;
						throw err;
					}
					return this.anon.join(c);
				},
				{
					baseDelay: 0,
					logLabel: 'ChannelManager',
					canRetry: err => err.retryable !== false,
				}
			)
			.then(() => {
				logger.debug(`[ChannelManager] joined ${c}`);
				this.#joinedChannelsCache.expiresAt = 0;
			})
			.catch(err => {
				if (err.message === 'aborted')
					logger.debug(`[ChannelManager] join ${c} canceled`);
				else logger.error(`failed to join ${c}:`, err);
			})
			.finally(() => this.#joinControllers.delete(c));
	}

	join(c) {
		if (this.#joinControllers.has(c)) return;
		const controller = new AbortController();
		this.#joinControllers.set(c, controller);
		this.joinQueue.enqueue({ channel: c, controller });
	}

	async part(c) {
		const controller = this.#joinControllers.get(c);
		if (controller) {
			controller.abort();
			this.#joinControllers.delete(c);
			this.joinQueue.removeMatching(job => job.channel === c);
			return;
		}
		logger.debug('[ChannelManager] trying to part', c);
		try {
			await this.anon.part(c);
			this.#joinedChannelsCache.expiresAt = 0;
		} catch (err) {
			logger.error(`error parting ${c}:`, err);
		}
	}

	cleanup() {
		this.joinQueue.clear();
		this.#joinControllers.clear();
		this.#joinedChannelsCache.channels.clear();
		clearInterval(this.#loadInterval);
	}

	get joinedChannels() {
		const now = performance.now();
		if (now < this.#joinedChannelsCache.expiresAt)
			return this.#joinedChannelsCache.channels;
		const channels = this.anon.joinedChannels;
		this.#joinedChannelsCache.channels = channels;
		this.#joinedChannelsCache.expiresAt =
			now + constants.JOINED_CHANNELS_CACHE_TTL_MS;
		return channels;
	}
}
