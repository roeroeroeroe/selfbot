import Redis from 'ioredis';
import logger from '../logger.js';

let initialized = false;
function init() {
	if (initialized) throw new Error('already initialized');
	initialized = true;
	const client = new Redis({
		username: process.env.REDIS_USER,
		host: process.env.REDIS_HOST || '127.0.0.1',
		password: process.env.REDIS_PASSWORD,
		port: +process.env.REDIS_PORT || 6379,
		path: process.env.REDIS_SOCKET,
	});

	client.on('connect', () => logger.info('[REDIS] connected'));
	client.on('error', err => logger.error('[REDIS] error:', err));

	function get(key) {
		return client.get(key).then(v => {
			if (v === null) return null;
			try {
				return JSON.parse(v);
			} catch {
				return v;
			}
		});
	}

	function set(key, value, ttl) {
		const v =
			typeof value === 'string' || Buffer.isBuffer(value)
				? value
				: JSON.stringify(value);
		if (typeof ttl === 'number') return client.set(key, v, 'PX', ttl);
		else return client.set(key, v);
	}

	function del(key) {
		return client.del(key);
	}

	function dbsize() {
		return client.dbsize();
	}

	return { get, set, del, dbsize };
}

export default {
	init,
};
