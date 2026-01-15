import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import * as constants from './constants.js';
import utils from '../../../utils/index.js';
import logger from '../../logger.js';
import metrics from '../../metrics/index.js';
import config from '../../../config.json' with { type: 'json' };
import { MAX_MESSAGE_LENGTH } from '../constants.js';

export default class ChatService {
	static DEFAULT_SLOW_MODE_MS =
		constants.DEFAULT_SLOW_MODE_MS_BY_BACKEND[config.twitch.sender.backend];
	static CAN_BYPASS_FOLLOWERS_ONLY_MODE = config.bot.rateLimits === 'verified';
	#queues = new Map();
	#sendStates = new Map();

	constructor(sender, botNonce) {
		this.sender = sender;
		this.botNonce = botNonce;
		this.#initRateLimiters();
	}

	getState(channelId) {
		let state = this.#sendStates.get(channelId);
		if (!state) {
			state = {
				slowModeDuration: ChatService.DEFAULT_SLOW_MODE_MS,
				lastSend: 0,
				lastDuplicateKey: null,
			};
			this.#sendStates.set(channelId, state);
			const queue = this.#queues.get(channelId);
			if (queue) queue.worker = job => this.worker(state, job);
		}
		return state;
	}

	setSlowModeDuration(channelId, ms) {
		const duration = Math.max(ChatService.DEFAULT_SLOW_MODE_MS, ms);
		logger.debug(
			`[CHAT] setting slowModeDuration to ${duration}ms for channel ${channelId}`
		);
		this.getState(channelId).slowModeDuration = duration;
	}

	send(
		channelId,
		channelLogin,
		userLogin,
		text,
		mention = false,
		privileged = false,
		parentId = '',
		action = false
	) {
		if (!channelId) throw new Error('missing channelId');
		if (!channelLogin) throw new Error('missing channelLogin');
		if (typeof text !== 'string') text = String(text);
		if (!(text = text.trim())) {
			logger.warning(`[CHAT] send: empty message (channelId=${channelId})`);
			return;
		}
		if (parentId && !userLogin) parentId = '';

		const maxLength = utils.getMaxMessageLength(
			userLogin,
			!!parentId,
			mention,
			action
		);
		text = utils.format.trim(text, maxLength).replace(/[\r\n]/g, ' ');

		this.#enqueue({
			channelId,
			channelLogin,
			userLogin,
			text,
			privileged,
			mention,
			parentId,
			action,
		});
		logger.debug(`[CHAT] enqueued: #${channelLogin} ${text}`);
	}

	async #dispatchMessage(
		state,
		channelId,
		channelLogin,
		userLogin,
		text,
		privileged,
		mention,
		parentId,
		action
	) {
		const now = performance.now();
		if (mention && userLogin && !parentId) text = `@${userLogin}, ${text}`;
		if (action) text = `/me ${text}`;

		if (!privileged) {
			const reply = !!parentId;
			const flags = reply ? 2 : mention ? 1 : 0;
			let key = flags + text;

			if (
				state.lastDuplicateKey === key &&
				now - state.lastSend < constants.DUPLICATE_MESSAGE_THRESHOLD_MS
			) {
				const maxLen =
					MAX_MESSAGE_LENGTH -
					(reply ? userLogin.length + constants.REPLY_OVERHEAD_LENGTH : 0);
				if (text.length + constants.INVIS_CHAR.length <= maxLen)
					text += constants.INVIS_CHAR;
				else
					text =
						utils.format.trim(text, maxLen - constants.INVIS_CHAR.length) +
						constants.INVIS_CHAR;
				key = flags + text;
			}
			state.lastDuplicateKey = key;
		}
		state.lastSend = now;
		metrics.counter.increment(metrics.names.counters.TMI_MESSAGES_TX);
		logger.debug(`[CHAT] sending: #${channelLogin} ${text}`);
		await this.sender.send(
			channelId,
			channelLogin,
			text,
			this.botNonce,
			parentId
		);
	}

	// prettier-ignore
	#initRateLimiters() {
		this.rateLimiters = {};
		if (config.bot.rateLimits === 'regular') {
			this.rateLimiters.normal = new SlidingWindowRateLimiter(
				constants.MESSAGES_WINDOW_MS,
				constants.REGULAR_MAX_MESSAGES_PER_WINDOW
			);
			this.rateLimiters.privileged = new SlidingWindowRateLimiter(
				constants.MESSAGES_WINDOW_MS,
				constants.REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED
			);
			this.recordSend = channelId => {
				const now = performance.now();
				this.rateLimiters.normal.forceAdd(now);
				this.rateLimiters.privileged.forceAdd(now);
				this.getState(channelId).lastSend = now;
			};
			this.worker = async (
				state,
				{ channelId, channelLogin, userLogin, text, mention, privileged, parentId, action }
			) => {
				if (privileged) {
					this.rateLimiters.normal.forceAdd();
					await this.rateLimiters.privileged.wait();
				} else {
					this.rateLimiters.privileged.forceAdd();
					await this.rateLimiters.normal.wait();
					const toWait = Math.max(
						Math.ceil(
							state.slowModeDuration - (performance.now() - state.lastSend)
						),
						0
					);
					if (toWait) {
						logger.debug(`[CHAT] sleeping for ${toWait}ms due to slow mode`);
						await utils.sleep(toWait);
					}
				}
				await this.#dispatchMessage(state, channelId, channelLogin,
					userLogin, text, privileged, mention, parentId, action);
			};
		} else if (config.bot.rateLimits === 'verified') {
			this.rateLimiters.verified = new SlidingWindowRateLimiter(
				constants.MESSAGES_WINDOW_MS,
				constants.VERIFIED_MAX_MESSAGES_PER_WINDOW
			);
			this.recordSend = channelId => {
				const now = performance.now();
				this.rateLimiters.verified.forceAdd(now);
				this.getState(channelId).lastSend = now;
			};
			this.worker = async (
				state,
				{ channelId, channelLogin, userLogin, text, mention, privileged, parentId, action }
			) => {
				await this.rateLimiters.verified.wait();
				if (!privileged) {
					const toWait = Math.max(
						Math.ceil(
							state.slowModeDuration - (performance.now() - state.lastSend)
						),
						0
					);
					if (toWait) {
						logger.debug(`[CHAT] sleeping for ${toWait}ms due to slow mode`);
						await utils.sleep(toWait);
					}
				}
				await this.#dispatchMessage(state, channelId, channelLogin,
					userLogin, text, privileged, mention, parentId, action);
			};
		} else throw new Error(`unknown rate limits preset: ${config.bot.rateLimits}`);
	}

	#enqueue(job) {
		if (!this.#queues.has(job.channelId)) {
			const state = this.getState(job.channelId);
			this.#queues.set(
				job.channelId,
				new AsyncQueue(job => this.worker(state, job), 1 << 3)
			);
		}
		this.#queues.get(job.channelId).enqueue(job);
	}

	cleanup() {
		for (const queue of this.#queues.values()) queue.clear();
	}
}
