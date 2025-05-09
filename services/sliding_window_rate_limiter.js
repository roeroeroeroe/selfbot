import RingBuffer from './ring_buffer.js';
import utils from '../utils/index.js';
import logger from './logger.js';

export default class SlidingWindowRateLimiter {
	#windowMs;
	#maxPerWindow;
	#buffer;
	#chain = Promise.resolve();

	constructor(windowMs, maxPerWindow) {
		if (!Number.isInteger(windowMs) || windowMs <= 1)
			throw new Error('windowMs must be an integer > 1');
		if (!Number.isInteger(maxPerWindow) || maxPerWindow < 1)
			throw new Error('maxPerWindow must be a positive integer');
		this.#windowMs = windowMs;
		this.#maxPerWindow = maxPerWindow;
		this.#buffer = new RingBuffer(maxPerWindow, {
			bufferFactory: cap => new Float64Array(cap),
			resizable: false,
		});
	}

	#prune(now = performance.now()) {
		const expiry = now - this.#windowMs;
		this.#buffer.pruneFront(ts => ts < expiry);
	}

	add(now = performance.now()) {
		this.#prune(now);
		if (this.#buffer.isFull())
			throw new Error(
				`rate limit hit: ${this.#maxPerWindow} in ${this.#windowMs}ms`
			);
		this.#buffer.push(now);
	}

	forceAdd(now = performance.now()) {
		this.#prune(now);
		this.#buffer.forcePush(now);
	}

	canProceed() {
		this.#prune();
		return this.#buffer.size < this.#maxPerWindow;
	}

	nextAvailable() {
		const now = performance.now();
		this.#prune(now);
		if (this.#buffer.size < this.#maxPerWindow) return 0;
		return this.#buffer.peekHead() + this.#windowMs - now;
	}

	wait() {
		const run = async () => {
			let now = performance.now();
			this.#prune(now);
			if (this.#buffer.size >= this.#maxPerWindow) {
				const delay = Math.ceil(this.#buffer.peekHead() + this.#windowMs - now);
				logger.debug(`[SlidingWindowRateLimiter] wait: sleeping ${delay}ms`);
				await utils.sleep(delay);
				now = performance.now();
				this.#prune(now);
			}
			this.#buffer.forcePush(now);
		};
		this.#chain = this.#chain.then(run, run);
		return this.#chain;
	}
}
