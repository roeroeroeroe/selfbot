import utils from '../utils/index.js';

export default class RateLimiter {
	constructor(windowMs, maxPerWindow) {
		this.windowMs = windowMs;
		this.maxPerWindow = maxPerWindow;
		this.timestamps = [];
	}

	#pruneOld(now = Date.now()) {
		while (this.timestamps.length && now - this.timestamps[0] > this.windowMs)
			this.timestamps.shift();
	}

	async wait() {
		while (true) {
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
		const now = Date.now();
		this.#pruneOld(now);

		return this.timestamps.length < this.maxPerWindow;
	}
}
