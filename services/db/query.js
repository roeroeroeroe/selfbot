import db from './index.js';
import logger from '../logger.js';
import metrics from '../metrics.js';
import { QUERIES_METRICS_COUNTER } from './constants.js';

metrics.counter.create(QUERIES_METRICS_COUNTER);

export default async function query(sql, values = []) {
	logger.debug(`[DB] running query "${sql}" with values:`, values);
	metrics.counter.increment(QUERIES_METRICS_COUNTER);
	try {
		const t0 = performance.now(),
			res = await db.pool.query(sql, values),
			t1 = performance.now();
		logger.debug('[DB] query took', (t1 - t0).toFixed(3) + 'ms');
		return res.rows;
	} catch (err) {
		logger.error('[DB] query failed:', err);
		throw err;
	}
}
