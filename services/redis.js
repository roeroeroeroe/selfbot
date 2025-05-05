import Redis from 'ioredis';
import logger from './logger.js';

const redis = new Redis({
	username: process.env.REDIS_USER,
	host: process.env.REDIS_HOST || '127.0.0.1',
	password: process.env.REDIS_PASSWORD,
	port: process.env.REDIS_PORT || 6379,
	path: process.env.REDIS_SOCKET,
});

redis.on('connect', () => logger.info('[REDIS] connected'));
redis.on('error', err => logger.error('redis error:', err));

export default redis;
