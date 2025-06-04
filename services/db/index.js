import * as constants from './constants.js';
import init from './init/index.js';
import pool from './pool.js';
import query from './query.js';
import channel from './channel/index.js';
import customCommand from './custom_command/index.js';
import message from './message/index.js';
import logger from '../logger.js';

async function cleanup() {
	await message.cleanup();
	await pool.end();
	logger.debug('[DB] pool closed');
}

export default {
	...constants,
	init,
	pool,
	query,
	channel,
	customCommand,
	message,
	cleanup,
};
