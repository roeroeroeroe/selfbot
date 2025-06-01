import * as constants from './constants.js';
import config from '../../config.json' with { type: 'json' };
import redis from './redis.js';
import inMemory from './in_memory.js';
import metrics from '../metrics/index.js';

let cache;
switch (config.cache) {
	case 'valkey':
	case 'redis':
		cache = redis.init();
		break;
	case 'inMemory':
		cache = inMemory.init();
		break;
	default:
		throw new Error(`unknown cache type: ${config.cache}`);
}

async function getWithMetrics(key) {
	const v = await cache.get(key);
	metrics.counter.increment(
		v !== null
			? metrics.names.counters.CACHE_HITS
			: metrics.names.counters.CACHE_MISSES
	);
	return v;
}

export default {
	...constants,
	...cache,
	get: getWithMetrics,
};
