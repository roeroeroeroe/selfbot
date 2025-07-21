import pg from 'pg';
import logger from '../logger.js';

const pool = new pg.Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST || '127.0.0.1',
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD,
	port: +process.env.DB_PORT || 5432,
	max: +process.env.DB_MAX_CLIENTS || 10,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 5000,
});

pool.on('connect', ({ processID }) =>
	logger.debug(`[DB] client connected (pid=${processID})`)
);
pool.on('error', err => logger.error('db error:', err));

export default pool;
