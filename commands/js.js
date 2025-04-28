import { inspect } from 'util';
import exec from '../services/exec.js';
import config from '../config.json' with { type: 'json' };
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

const context = {
	config,
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

export default {
	name: 'js',
	aliases: ['eval'],
	description: 'run arbitrary javascript',
	unsafe: true,
	flags: [],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no input provided', mention: true };
		const input = msg.args.join(' ');
		context.msg = msg;

		let result;
		try {
			result = await exec.js(input, context);
		} catch (err) {
			return { text: err.message, mention: true };
		}

		if (typeof result === 'object')
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

		return { text: result, mention: true };
	},
};
