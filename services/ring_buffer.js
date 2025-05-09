import logger from './logger.js';

export default class RingBuffer {
	static MAX_CAPACITY = 1 << 30;
	#bufferFactory;
	#minCapacity;
	#capacity;
	#buffer;
	#mask;
	#head;
	#tail;
	#size;

	constructor(
		initialCapacity,
		{ bufferFactory = cap => new Array(cap), resizable = true } = {}
	) {
		if (!Number.isInteger(initialCapacity) || initialCapacity < 1)
			throw new Error('initialCapacity must be a positive integer');
		const lzb = 32 - Math.clz32(initialCapacity - 1);
		if (lzb > 30)
			throw new Error(
				`initialCapacity too large: max supported capacity is 2^30 (${RingBuffer.MAX_CAPACITY})`
			);
		this.#minCapacity = 1 << lzb;
		this.resizable = resizable;
		this.#bufferFactory = bufferFactory;
		this.#capacity = this.#minCapacity;
		this.#buffer = bufferFactory(this.#capacity);
		this.#mask = this.#capacity - 1;
		this.#head = this.#tail = this.#size = 0;
	}

	push(item) {
		if (this.#size === this.#capacity) {
			if (!this.resizable)
				throw new Error('buffer overflow: buffer is fixed-size');
			const newCap = Math.min(this.#capacity << 1, RingBuffer.MAX_CAPACITY);
			if (newCap === this.#capacity) return this.forcePush(item);
			this.#resize(newCap);
		}
		this.#buffer[this.#tail] = item;
		this.#tail = (this.#tail + 1) & this.#mask;
		this.#size++;
	}

	shift() {
		if (!this.#size) return undefined;
		const item = this.#buffer[this.#head];
		this.#buffer[this.#head] = undefined;
		this.#head = (this.#head + 1) & this.#mask;
		this.#size--;
		return item;
	}

	peekHead() {
		if (!this.#size) return undefined;
		return this.#buffer[this.#head];
	}

	peekTail() {
		if (!this.#size) return undefined;
		return this.#buffer[(this.#tail - 1) & this.#mask];
	}

	forcePush(item) {
		this.#buffer[this.#tail] = item;
		this.#tail = (this.#tail + 1) & this.#mask;
		if (this.#size < this.#capacity) this.#size++;
		else this.#head = (this.#head + 1) & this.#mask;
	}

	pruneFront(predicate) {
		let c = 0;
		for (; this.#size && predicate(this.#buffer[this.#head]); c++) {
			this.#buffer[this.#head] = undefined;
			this.#head = (this.#head + 1) & this.#mask;
			this.#size--;
		}
		return c;
	}

	removeMatching(predicate) {
		let write = 0;
		const oldSize = this.#size;
		for (let read = 0; read < oldSize; read++) {
			const item = this.#buffer[(this.#head + read) & this.#mask];
			let keep = true;
			try {
				keep = !predicate(item);
			} catch (err) {
				logger.error('removeMatching predicate error:', err);
				keep = false;
			}
			if (keep) {
				this.#buffer[(this.#head + write) & this.#mask] = item;
				write++;
			}
		}
		for (let i = write; i < oldSize; i++)
			this.#buffer[(this.#head + i) & this.#mask] = undefined;
		this.#size = write;
		this.#tail = (this.#head + this.#size) & this.#mask;
		return oldSize - write;
	}

	clear() {
		for (let i = 0, N = this.#size; i < N; i++)
			this.#buffer[(this.#head + i) & this.#mask] = undefined;
		this.#head = this.#tail = this.#size = 0;
	}

	shrink() {
		if (this.#capacity === this.#minCapacity) return;
		this.#buffer = this.#bufferFactory(this.#minCapacity);
		this.#capacity = this.#minCapacity;
		this.#mask = this.#minCapacity - 1;
		this.clear();
	}

	#resize(newCapacity) {
		const buf = this.#bufferFactory(newCapacity);
		for (let i = 0, N = this.#size; i < N; i++)
			buf[i] = this.#buffer[(this.#head + i) & this.#mask];
		this.#buffer = buf;
		this.#capacity = newCapacity;
		this.#mask = newCapacity - 1;
		this.#head = 0;
		this.#tail = this.#size;
	}

	get capacity() {
		return this.#capacity;
	}

	get size() {
		return this.#size;
	}
}
