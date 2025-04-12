import Redis from 'ioredis';

export default new Redis({
	username: process.env.REDIS_USER,
	host: process.env.REDIS_HOST || '127.0.0.1',
	password: process.env.REDIS_PASSWORD,
	port: process.env.REDIS_PORT || 6379,
	path: process.env.REDIS_SOCKET,
});
