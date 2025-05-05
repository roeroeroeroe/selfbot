import utils from '../utils/index.js';

export default class SlidingWindowRateLimiter {
	#windowMs;
	#maxPerWindow;
	#mask;
	#buffer;
	#head = 0;
	#tail = 0;
	#count = 0;

	constructor(windowMs, maxPerWindow) {
		if (!Number.isInteger(windowMs) || windowMs <= 1)
			throw new Error('windowMs must be an integer > 1');
		if (!Number.isInteger(maxPerWindow) || maxPerWindow < 1)
			throw new Error('maxPerWindow must be a positive integer');
		this.#windowMs = windowMs;
		this.#maxPerWindow = maxPerWindow;
		const lzb = 32 - Math.clz32(maxPerWindow - 1);
		const cap = 1 << lzb;
		this.#mask = cap - 1;
		this.#buffer = new Float64Array(cap);
	}

	#prune(now) {
		while (this.#count && this.#buffer[this.#head] < now - this.#windowMs) {
			this.#head = (this.#head + 1) & this.#mask;
			this.#count--;
		}
	}

	add() {
		const now = performance.now();
		this.#prune(now);
		this.#buffer[this.#tail] = now;
		this.#tail = (this.#tail + 1) & this.#mask;
		this.#count++;
	}

	canProceed() {
		const now = performance.now();
		this.#prune(now);
		return this.#count < this.#maxPerWindow;
	}

	nextAvailable() {
		const now = performance.now();
		this.#prune(now);
		if (this.#count < this.#maxPerWindow) return 0;
		return this.#buffer[this.#head] + this.#windowMs - now;
	}

	async wait() {
		let now = performance.now();
		this.#prune(now);
		if (this.#count >= this.#maxPerWindow) {
			const until = this.#buffer[this.#head] + this.#windowMs;
			const waitTime = Math.max(0, until - now);
			await utils.sleep(waitTime);
			now = performance.now();
			this.#prune(now);
		}
		this.#buffer[this.#tail] = now;
		this.#tail = (this.#tail + 1) & this.#mask;
		this.#count++;
	}
}
