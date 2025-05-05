import logger from './logger.js';

export default class AsyncQueue {
	#head = null;
	#tail = null;
	#processing = false;

	constructor(worker) {
		this.worker = worker;
	}

	enqueue(item) {
		const node = { item, next: null };
		if (this.#tail) this.#tail.next = node;
		else this.#head = node;
		this.#tail = node;
		this.#dispatch();
	}

	removeMatching(predicate) {
		let dummy = { next: this.#head };
		let prev = dummy;
		let curr = this.#head;
		while (curr) {
			try {
				if (predicate(curr.item)) {
					prev.next = curr.next;
					if (curr === this.#tail) this.#tail = prev === dummy ? null : prev;
				} else prev = curr;
			} catch (err) {
				logger.error('removeMatching predicate error:', err);
				prev = curr;
			}
			curr = curr.next;
		}
		this.#head = dummy.next;
		if (!this.#head) this.#tail = null;
	}

	async #dispatch() {
		if (this.#processing) return;
		this.#processing = true;

		while (this.#head !== null) {
			const node = this.#head;
			this.#head = node.next;
			if (!this.#head) this.#tail = null;
			try {
				await this.worker(node.item);
			} catch (err) {
				logger.error('queue worker error:', err);
			}
		}

		this.#processing = false;
	}
}
