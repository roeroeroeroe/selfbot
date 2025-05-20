import db from './index.js';
import logger from '../logger.js';
import metrics from '../metrics/index.js';

export default async function query(sql, values = []) {
	logger.debug(`[DB] running query "${sql}" with values:`, values);
	metrics.counter.increment(metrics.names.counters.PG_QUERIES);
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
