import Mutex from './mutex.js';
import RingBuffer from './ring_buffer.js';
import logger from './logger.js';

export default class AsyncQueue {
	#worker;
	#buffer;
	#minCapacity;
	#processing = false;
	#canceled = false;
	#mu = new Mutex();

	constructor(worker, initialCapacity = 16) {
		this.#worker = worker;
		this.#buffer = new RingBuffer(initialCapacity);
		this.#minCapacity = this.#buffer.capacity;
	}

	async enqueue(item) {
		await this.#mu.lock();
		try {
			this.#buffer.push(item);
		} finally {
			this.#mu.unlock();
		}
		if (!this.#processing) {
			logger.debug('[AsyncQueue] enqueue: starting processing loop');
			this.#process();
		}
	}

	async removeMatching(predicate) {
		await this.#mu.lock();
		try {
			return this.#buffer.removeMatching(predicate);
		} finally {
			this.#mu.unlock();
		}
	}

	async #process() {
		this.#processing = true;
		this.#canceled = false;
		for (;;) {
			await this.#mu.lock();
			if (this.#canceled || !this.#buffer.size) {
				if (this.#buffer.capacity > this.#minCapacity) this.#buffer.shrink();
				this.#processing = false;
				this.#mu.unlock();
				return;
			}
			const item = this.#buffer.shift();
			this.#mu.unlock();
			try {
				await this.#worker(item);
			} catch (err) {
				logger.error('queue worker error:', err);
			}
		}
	}

	async clear() {
		await this.#mu.lock();
		try {
			this.#buffer = new RingBuffer(this.#minCapacity);
			this.#canceled = true;
		} finally {
			this.#mu.unlock();
		}
	}

	/** @param {(item: any) => Promise<void>} worker */ // silence ts_ls
	set worker(worker) {
		this.#worker = worker;
	}
}
