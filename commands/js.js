import exec from '../services/exec.js';
import config from '../config.json' with { type: 'json' };
import configuration from '../services/configuration/index.js';
import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import paste from '../services/paste/index.js';
import db from '../services/db/index.js';
import metrics from '../services/metrics/index.js';
import utils from '../utils/index.js';
import color from '../services/color/index.js';
import cooldown from '../services/cooldown.js';
import cache from '../services/cache/index.js';
import commands from '../services/commands.js';
import customCommands from '../services/custom_commands.js';

const context = {
	process,
	performance,
	fetch,

	config,
	configuration,
	logger,
	twitch,
	paste,
	db,
	metrics,
	utils,
	color,
	cooldown,
	cache,
	commands,
	customCommands,
};

export default {
	name: 'js',
	aliases: ['eval'],
	description:
		'run arbitrary javascript; quotes may be stripped -- ' +
		"use backticks or escape inner quotes (e.g., const foo = '\\'bar\\'')",
	unsafe: true,
	lock: 'NONE',
	flags: [],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no input provided', mention: true };
		const input = msg.args.join(' ');

		let result;
		try {
			result = await exec.js(input, { ...context, msg });
		} catch (err) {
			return { text: err.message, mention: true };
		}

		if (typeof result === 'object')
			try {
				return { text: utils.deepInspect(result), mention: true };
			} catch (err) {
				logger.error('failed to inspect result:', err);
				return { text: '[Uninspectable]', mention: true };
			}

		return { text: result, mention: true };
	},
};
