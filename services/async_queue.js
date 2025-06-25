import RingBuffer from './ring_buffer.js';
import logger from './logger.js';

export default class AsyncQueue {
	#worker;
	#buffer;
	#minCapacity;
	#processing = false;
	#canceled = false;

	constructor(worker, initialCapacity = 16) {
		this.#worker = worker;
		this.#buffer = new RingBuffer(initialCapacity);
		this.#minCapacity = this.#buffer.capacity;
	}

	enqueue(item) {
		this.#buffer.push(item);
		if (!this.#processing) {
			logger.debug('[AsyncQueue] enqueue: starting processing loop');
			this.#process();
		}
	}

	removeMatching(predicate, max = Infinity) {
		return this.#buffer.removeMatching(predicate, max);
	}

	async #process() {
		this.#processing = true;
		this.#canceled = false;
		for (;;) {
			if (this.#canceled || !this.#buffer.size) {
				if (this.#buffer.capacity > this.#minCapacity) this.#buffer.shrink();
				this.#processing = false;
				return;
			}
			const item = this.#buffer.shift();
			try {
				await this.#worker(item);
			} catch (err) {
				logger.error('queue worker error:', err);
			}
		}
	}

	clear() {
		this.#buffer = new RingBuffer(this.#minCapacity);
		this.#canceled = true;
	}

	/** @param {(item: any) => Promise<void>} worker */ // silence ts_ls
	set worker(worker) {
		this.#worker = worker;
	}
}
