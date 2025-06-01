import { IN_MEMORY_SWEEP_INTERVAL_MS } from './constants.js';

const values = new Map();
const expirations = new Map();

function sweepExpired() {
	const now = performance.now();
	for (const [k, expiresAt] of expirations.entries())
		if (typeof expiresAt === 'number' && now >= expiresAt) {
			values.delete(k);
			expirations.delete(k);
		}
}

let initialized = false;
function init() {
	if (initialized) throw new Error('already initialized');
	initialized = true;
	setInterval(() => sweepExpired(), IN_MEMORY_SWEEP_INTERVAL_MS);
	// eslint-disable-next-line require-await
	async function get(key) {
		const v = values.get(key);
		if (v === undefined) return null;
		const expiresAt = expirations.get(key);
		if (typeof expiresAt === 'number' && performance.now() >= expiresAt) {
			values.delete(key);
			expirations.delete(key);
			return null;
		}
		return v;
	}
	// eslint-disable-next-line require-await
	async function set(key, value, ttl) {
		values.set(key, value);
		if (typeof ttl === 'number') expirations.set(key, performance.now() + ttl);
		else expirations.delete(key);
		return 'OK';
	}
	// eslint-disable-next-line require-await
	async function del(key) {
		if (!values.has(key)) {
			expirations.delete(key);
			return 0;
		}
		const expiresAt = expirations.get(key);
		values.delete(key);
		expirations.delete(key);
		return +(typeof expiresAt !== 'number' || performance.now() < expiresAt);
	}
	// eslint-disable-next-line require-await
	async function dbsize() {
		sweepExpired();
		return values.size;
	}

	return { get, set, del, dbsize };
}

export default {
	init,
};
