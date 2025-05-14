import RingBuffer from './ring_buffer.js';

export default class Mutex {
	#locked = false;
	#waiters = new RingBuffer(1 << 4);

	async lock() {
		if (!this.#locked) {
			this.#locked = true;
			return;
		}
		await new Promise(res => this.#waiters.push(res));
	}

	unlock() {
		if (this.#waiters.size) this.#waiters.shift()();
		else this.#locked = false;
	}
}
