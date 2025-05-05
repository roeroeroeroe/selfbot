import SlidingWindowRateLimiter from '../../sliding_window_rate_limiter.js';
import AsyncQueue from '../../async_queue.js';
import utils from '../../../utils/index.js';
import logger from '../../logger.js';
import metrics from '../../metrics.js';
import config from '../../../config.json' with { type: 'json' };

const MESSAGES_WINDOW_MS = 30000;
const REGULAR_MAX_MESSAGES_PER_WINDOW = 19;
const REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED = 99;
const VERIFIED_MAX_MESSAGES_PER_WINDOW = 7499;
const DUPLICATE_MESSAGE_THRESHOLD_MS = 30000;
const INVIS_CHAR = ' \u{E0000}';

const MESSAGES_TX_METRICS_COUNTER = 'tmi_messages_sent';
metrics.counter.create(MESSAGES_TX_METRICS_COUNTER);

export default class ChatService {
	static DEFAULT_SLOW_MODE_MS =
		config.chatServiceTransport === 'gql' ? 1250 : 1100;

	constructor(transport, botNonce) {
		this.transport = transport;
		this.botNonce = botNonce;
		this.queues = new Map();
		this.sendStates = new Map();
		this.#initRateLimiters();
		setInterval(
			() => {
				const now = Date.now();
				for (const [k, v] of this.sendStates.entries())
					if (now - v.lastSend > DUPLICATE_MESSAGE_THRESHOLD_MS * 2) {
						this.sendStates.delete(k);
						this.queues.delete(k);
					}
			},
			DUPLICATE_MESSAGE_THRESHOLD_MS * 2 + 1000
		);
	}

	#getState(channelId) {
		let state = this.sendStates.get(channelId);
		if (!state) {
			state = {
				slowModeDuration: ChatService.DEFAULT_SLOW_MODE_MS,
				lastSend: 0,
				lastDuplicateKey: null,
			};
			this.sendStates.set(channelId, state);
		}
		return state;
	}

	send(
		channelId,
		channelLogin,
		userLogin,
		text,
		mention = false,
		privileged = false,
		parentId = ''
	) {
		if (!channelId) throw new Error('missing channelId');
		if (!channelLogin) throw new Error('missing channelLogin');
		if (typeof text !== 'string') text = String(text);

		const maxLength = utils.getMaxMessageLength(userLogin, !!parentId, mention);
		text = utils.format.trim(text, maxLength).replace(/[\r\n]/g, ' ');

		const pattern = utils.regex.checkMessage(text);
		if (pattern) {
			logger.warning(
				`[CHAT] caught message (pattern: ${pattern}, channel: ${channelLogin || channelId}, user: ${userLogin || 'N/A'}): ${text}`
			);
			text = userLogin
				? `@${userLogin}, ${config.againstTOS}`
				: config.againstTOS;
			parentId = '';
		} else if (mention && userLogin && !parentId)
			text = `@${userLogin}, ${text}`;

		this.#enqueue({
			channelId,
			channelLogin,
			text,
			privileged,
			mention,
			parentId,
		});
		logger.debug(`[CHAT] enqueued: #${channelLogin} ${text}`);
	}

	async #dispatchMessage(
		state,
		channelId,
		channelLogin,
		text,
		privileged,
		mention,
		parentId
	) {
		const now = Date.now();
		if (!privileged) {
			const reply = !!parentId;
			const flags = (reply ? 2 : 0) | (mention ? 1 : 0);
			let key = flags + text;
			if (
				state.lastDuplicateKey === key &&
				now - state.lastSend < DUPLICATE_MESSAGE_THRESHOLD_MS
			) {
				const maxLen = utils.getMaxMessageLength(null, reply, mention);
				if (text.length + INVIS_CHAR.length <= maxLen) {
					text += INVIS_CHAR;
					key += INVIS_CHAR;
				} else {
					text =
						utils.format.trim(text, maxLen - INVIS_CHAR.length) + INVIS_CHAR;
					key = flags + text;
				}
			}
			state.lastDuplicateKey = key;
		}
		state.lastSend = now;
		metrics.counter.increment(MESSAGES_TX_METRICS_COUNTER);
		logger.debug(`[CHAT] sending: #${channelLogin} ${text}`);
		// prettier-ignore
		await this.transport.send(channelId, channelLogin, text, this.botNonce, parentId);
	}

	recordSend(channelId) {
		const state = this.#getState(channelId);
		state.lastSend = Date.now();
	}

	// prettier-ignore
	#initRateLimiters() {
		this.rateLimiters = {};
		if (config.rateLimits === 'regular') {
			this.rateLimiters.normal = new SlidingWindowRateLimiter(
				MESSAGES_WINDOW_MS,
				REGULAR_MAX_MESSAGES_PER_WINDOW
			);
			this.rateLimiters.privileged = new SlidingWindowRateLimiter(
				MESSAGES_WINDOW_MS,
				REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED
			);
			this.bumpGlobalLimit = () => {
				this.rateLimiters.normal.add();
				this.rateLimiters.privileged.add();
			};
			this.worker = async (
				state,
				{ channelId, channelLogin, text, mention, privileged, parentId }
			) => {
				if (privileged) {
					this.rateLimiters.normal.add();
					await this.rateLimiters.privileged.wait();
				} else {
					this.rateLimiters.privileged.add();
					await this.rateLimiters.normal.wait();
					const toWait = Math.max(
						state.slowModeDuration - (Date.now() - state.lastSend),
						0
					);
					if (toWait) {
						logger.debug(`[CHAT] sleeping for ${toWait}ms due to slow mode`);
						await utils.sleep(toWait);
					}
				}
				await this.#dispatchMessage(state, channelId, channelLogin,
					text, privileged, mention, parentId);
			};
		} else if (config.rateLimits === 'verified') {
			this.rateLimiters.verified = new SlidingWindowRateLimiter(
				MESSAGES_WINDOW_MS,
				VERIFIED_MAX_MESSAGES_PER_WINDOW
			);
			this.bumpGlobalLimit = () => this.rateLimiters.verified.add();
			this.worker = async (
				state,
				{ channelId, channelLogin, text, mention, privileged, parentId }
			) => {
				await this.rateLimiters.verified.wait();
				if (!privileged) {
					const toWait = Math.max(
						state.slowModeDuration - (Date.now() - state.lastSend),
						0
					);
					if (toWait) {
						logger.debug(`[CHAT] sleeping for ${toWait}ms due to slow mode`);
						await utils.sleep(toWait);
					}
				}
				await this.#dispatchMessage(state, channelId, channelLogin,
					text, privileged, mention, parentId);
			};
		} else throw new Error(`unknown rate limits preset: ${config.rateLimits}`);
	}

	#enqueue(job) {
		if (!this.queues.has(job.channelId))
			this.queues.set(
				job.channelId,
				new AsyncQueue(this.worker.bind(this, this.#getState(job.channelId)))
			);
		this.queues.get(job.channelId).enqueue(job);
	}
}
