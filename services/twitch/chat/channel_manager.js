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
	constructor(anonClient) {
		this.anon = anonClient;
		this.joinQueue = new AsyncQueue(job => this.#joinWorker(job));
		this.joinRateLimiter = new SlidingWindowRateLimiter(
			constants.JOINS_WINDOW_MS,
			constants.MAX_JOINS_PER_WINDOW
		);
	}

	async load() {
		try {
			const channels = await db.query(
				'SELECT id, login, display_name, suspended FROM channels'
			);
			const usersMap = await twitch.helix.user.getMany(
				null,
				channels.map(c => c.id)
			);
			for (const c of channels) {
				const user = usersMap.get(c.id);
				if (!user) {
					if (!c.suspended) {
						await db.channel.update(c.id, 'suspended', true);
						logger.info(`[ChannelManager] channel suspended: ${c.login}`);
					}
					continue;
				}
				if (c.suspended) {
					await db.channel.update(c.id, 'suspended', false);
					logger.info(`[ChannelManager] channel unsuspended: ${c.login}`);
				}
				if (c.login !== user.login) {
					await db.channel.update(c.id, 'login', user.login);
					logger.info(
						`[ChannelManager] name change: ${c.login} -> ${user.login}`
					);
				}
				if (c.display_name !== user.display_name)
					await db.channel.update(c.id, 'display_name', user.display_name);

				this.join(user.login);
			}
		} catch (err) {
			logger.error('error loading channels:', err);
		}
	}

	init() {
		this.load();
		this.#loadInterval = setInterval(
			() => this.load(),
			constants.LOAD_INTERVAL_MS
		);
	}

	async #joinWorker({ channel: c, controller }) {
		if (this.anon.joinedChannels.has(c)) {
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
			.then(() => logger.debug(`[ChannelManager] joined ${c}`))
			.catch(err => {
				if (err.message === 'aborted')
					logger.debug(`[ChannelManager] join ${c} canceled`);
				else logger.error(`failed to join ${c}:`, err);
			})
			.finally(() => this.#joinControllers.delete(c));
	}

	join(c) {
		if (this.#joinControllers.has(c) || this.anon.joinedChannels.has(c)) return;
		const controller = new AbortController();
		this.#joinControllers.set(c, controller);
		this.joinQueue.enqueue({ channel: c, controller });
	}

	async part(c) {
		const controller = this.#joinControllers.get(c);
		if (controller) {
			controller.abort();
			this.#joinControllers.delete(c);
			await this.joinQueue.removeMatching(job => job.channel === c);
			return;
		}
		logger.debug('[ChannelManager] trying to part', c);
		try {
			await this.anon.part(c);
		} catch (err) {
			logger.error(`error parting ${c}:`, err);
		}
	}

	async cleanup() {
		await this.joinQueue.clear();
		this.#joinControllers.clear();
		if (this.#loadInterval) {
			clearInterval(this.#loadInterval);
			this.#loadInterval = null;
		}
	}
}
