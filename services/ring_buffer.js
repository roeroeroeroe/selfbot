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
	#clearValue;

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
		if (ArrayBuffer.isView(this.#buffer))
			switch (this.#buffer.constructor) {
				// case Float16Array: // nodejs v24.0.0
				case Float32Array:
				case Float64Array:
					this.#clearValue = NaN;
					break;
				case Int8Array:
				case Uint8Array:
				case Uint8ClampedArray:
				case Int16Array:
				case Uint16Array:
				case Int32Array:
				case Uint32Array:
					this.#clearValue = 0;
					break;
				case BigInt64Array:
				case BigUint64Array:
					this.#clearValue = 0n;
			}
		else this.#clearValue = undefined;
	}

	push(item) {
		if (this.#size === this.#capacity) {
			if (!this.resizable)
				throw new Error('buffer overflow: buffer is fixed-size');
			const newCap = Math.min(this.#capacity << 1, RingBuffer.MAX_CAPACITY);
			if (newCap === this.#capacity) {
				logger.warning(
					'[RingBuffer] push: forcePush fallback due to max capacity'
				);
				this.forcePush(item);
				return;
			}
			this.#resize(newCap);
		}
		this.#buffer[this.#tail] = item;
		this.#tail = (this.#tail + 1) & this.#mask;
		this.#size++;
	}

	shift() {
		if (!this.#size) return null;
		const item = this.#buffer[this.#head];
		this.#buffer[this.#head] = this.#clearValue;
		this.#head = (this.#head + 1) & this.#mask;
		this.#size--;
		return item;
	}

	peekHead() {
		return this.#size ? this.#buffer[this.#head] : null;
	}

	peekTail() {
		return this.#size ? this.#buffer[(this.#tail - 1) & this.#mask] : null;
	}

	forcePush(item) {
		this.#buffer[this.#tail] = item;
		this.#tail = (this.#tail + 1) & this.#mask;
		if (this.#size < this.#capacity) this.#size++;
		else {
			logger.debug('[RingBuffer] forcePush: overwriting oldest item at head');
			this.#head = (this.#head + 1) & this.#mask;
		}
	}

	pruneFront(predicate) {
		let c = 0;
		for (; this.#size && predicate(this.#buffer[this.#head]); c++) {
			this.#buffer[this.#head] = this.#clearValue;
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
			try {
				if (!predicate(item))
					this.#buffer[(this.#head + write++) & this.#mask] = item;
			} catch (err) {
				logger.error('removeMatching predicate error:', err);
			}
		}
		for (let i = write; i < oldSize; i++)
			this.#buffer[(this.#head + i) & this.#mask] = this.#clearValue;
		this.#size = write;
		this.#tail = (this.#head + this.#size) & this.#mask;
		const c = oldSize - write;
		if (c) logger.debug(`[RingBuffer] removeMatching: removed ${c} items`);
		return c;
	}

	shrink() {
		if (!this.resizable) throw new Error('buffer is fixed-size, cannot shrink');
		if (this.#capacity === this.#minCapacity) return;
		logger.debug(
			`[RingBuffer] shrink: shrinking from ${this.#capacity} to ${this.#minCapacity}`
		);
		this.#buffer = this.#bufferFactory(this.#minCapacity);
		this.#capacity = this.#minCapacity;
		this.#mask = this.#minCapacity - 1;
		this.#head = this.#tail = this.#size = 0;
	}

	#resize(newCapacity) {
		logger.debug(
			`[RingBuffer] resize: resizing buffer: oldCap=${this.#capacity}, newCap=${newCapacity}`
		);
		const buf = this.#bufferFactory(newCapacity);
		for (let i = 0, N = this.#size; i < N; i++)
			buf[i] = this.#buffer[(this.#head + i) & this.#mask];
		this.#buffer = buf;
		this.#capacity = newCapacity;
		this.#mask = newCapacity - 1;
		this.#head = 0;
		this.#tail = this.#size;
	}

	*[Symbol.iterator]() {
		for (let i = 0; i < this.#size; i++)
			yield this.#buffer[(this.#head + i) & this.#mask];
	}

	toArray() {
		const out = new Array(this.#size);
		for (let i = 0; i < this.#size; i++)
			out[i] = this.#buffer[(this.#head + i) & this.#mask];
		return out;
	}

	get capacity() {
		return this.#capacity;
	}

	get size() {
		return this.#size;
	}
}
