import utils from '../utils/index.js';

export default class SlidingWindowRateLimiter {
	constructor(windowMs, maxPerWindow) {
		if (!Number.isInteger(windowMs) || windowMs <= 1)
			throw new Error('windowMs must be a > 1 integer');
		if (!Number.isInteger(maxPerWindow) || maxPerWindow < 1)
			throw new Error('maxPerWindow must be a positive integer');
		this.windowMs = windowMs;
		this.maxPerWindow = maxPerWindow;
		this.timestamps = [];
	}

	#pruneOld(now = Date.now()) {
		while (this.timestamps.length && now - this.timestamps[0] > this.windowMs)
			this.timestamps.shift();
	}

	async wait() {
		for (;;) {
			const now = Date.now();
			this.#pruneOld(now);

			if (this.timestamps.length < this.maxPerWindow) {
				this.timestamps.push(now);
				return;
			}

			const waitTime = this.timestamps[0] + this.windowMs - now;
			if (waitTime > 0) await utils.sleep(waitTime);
		}
	}

	add() {
		const now = Date.now();
		this.#pruneOld(now);
		this.timestamps.push(now);
	}

	canProceed() {
		this.#pruneOld(Date.now());
		return this.timestamps.length < this.maxPerWindow;
	}
}
