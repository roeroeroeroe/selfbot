import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import db from '../../db/index.js';
import twitch from '../index.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

const LOAD_INTERVAL_MS = 1800000;
const JOINS_WINDOW_MS = 10000;
const MAX_JOINS_PER_WINDOW = 950;

export default class ChannelManager {
	#desiredChannels = new Set();
	constructor(anonClient) {
		this.anon = anonClient;
		this.joinQueue = new AsyncQueue(c => this.#joinWorker(c));
		this.joinRateLimiter = new SlidingWindowRateLimiter(
			JOINS_WINDOW_MS,
			MAX_JOINS_PER_WINDOW
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
		setInterval(() => this.load(), LOAD_INTERVAL_MS);
	}

	async #joinWorker(c) {
		if (this.anon.joinedChannels.has(c) || !this.#desiredChannels.has(c))
			return;
		await this.joinRateLimiter.wait();
		logger.debug(`[ChannelManager] trying to join ${c}`);
		utils
			.retry(
				() => {
					if (!this.#desiredChannels.has(c)) {
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
				else logger.error(`[ChannelManager] failed to join ${c}:`, err);
			});
	}

	async join(c) {
		if (this.#desiredChannels.has(c)) return;
		this.#desiredChannels.add(c);
		this.joinQueue.enqueue(c);
	}

	async part(c) {
		this.#desiredChannels.delete(c);
		logger.debug('[ChannelManager] trying to part', c);
		if (await this.joinQueue.removeMatching(item => item === c)) return;
		try {
			await this.anon.part(c);
		} catch (err) {
			logger.error(`error parting ${c}:`, err);
		}
	}
}
