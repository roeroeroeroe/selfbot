import logger from './logger.js';

export default class AsyncQueue {
	#processing;
	constructor(worker) {
		this.worker = worker;
		this.queue = [];
		this.#processing = false;
	}

	enqueue(item) {
		this.queue.push(item);
		this.#process();
	}

	removeMatching(predicate) {
		for (let i = this.queue.length - 1; i >= 0; --i)
			try {
				if (predicate(this.queue[i])) this.queue.splice(i, 1);
			} catch (err) {
				logger.error('removeMatching predicate error:', err);
			}
	}

	async #process() {
		if (this.#processing) return;
		this.#processing = true;

		while (this.queue.length)
			try {
				await this.worker(this.queue.shift());
			} catch (err) {
				logger.error('queue worker error:', err);
			}

		this.#processing = false;
	}
}
