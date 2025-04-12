import { sleep } from '../utils/utils.js';

export default class RateLimiter {
	constructor(windowMs, maxPerWindow) {
		this.windowMs = windowMs;
		this.maxPerWindow = maxPerWindow;
		this.timestamps = [];
	}

	async wait() {
		while (true) {
			const now = Date.now();

			while (this.timestamps.length && now - this.timestamps[0] > this.windowMs)
				this.timestamps.shift();

			if (this.timestamps.length < this.maxPerWindow) {
				this.timestamps.push(now);
				return;
			}

			const waitTime = this.timestamps[0] + this.windowMs - now;
			if (waitTime > 0) await sleep(waitTime);
		}
	}

	add() {
		this.timestamps.push(Date.now());
	}
}
