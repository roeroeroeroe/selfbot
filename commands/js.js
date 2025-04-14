import { inspect } from 'util';
import logger from '../services/logger.js';
import hermes from '../services/twitch/hermes/client.js';
import gql from '../services/twitch/gql/index.js';
import helix from '../services/twitch/helix/index.js';
import hastebin from '../services/hastebin.js';
import db from '../services/db.js';
import utils from '../utils/index.js';
import cooldown from '../services/cooldown.js';
import redis from '../services/redis.js';
import commands from '../services/commands.js';
import customCommands from '../services/custom_commands.js';

export default {
	name: 'js',
	aliases: ['eval'],
	description: 'run arbitrary javascript',
	unsafe: true,
	flags: [],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no input provided', mention: true };
		const input = msg.args.join(' ');

		let result;
		try {
			result = await run(input);
		} catch (err) {
			logger.error(`failed to run "${input}":`, err);
			return { text: err.message, mention: true };
		}

		if (typeof result === 'object') {
			try {
				return {
					text: inspect(result, {
						colors: false,
						depth: 2,
						compact: true,
						breakLength: Infinity,
					}),
					mention: true,
				};
			} catch (err) {
				logger.error('failed to inspect result:', err);
				return { text: '[Uninspectable]', mention: true };
			}
		}

		return { text: result, mention: true };
	},
};

const context = {
	logger,
	hermes,
	gql,
	helix,
	hastebin,
	db,
	utils,
	cooldown,
	redis,
	commands,
	customCommands,
};
const contextKeys = [],
	contextValues = [];
for (const k in context) {
	contextKeys.push(k);
	contextValues.push(context[k]);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function run(input) {
	const func = new AsyncFunction(
		...contextKeys,
		`return await (async () => {
			${input}
		})();`
	);

	return await func(...contextValues);
}
