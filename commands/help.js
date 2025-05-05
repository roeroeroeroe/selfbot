import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import commands from '../services/commands.js';
import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';

const packageName = (() => {
	const pkgPath = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'../package.json'
	);

	try {
		return JSON.parse(readFileSync(pkgPath, 'utf-8')).name;
	} catch (err) {
		logger.warning('error getting package name:', err);
		return path.basename(process.argv[1]);
	}
})();

export default {
	name: 'help',
	aliases: ['usage'],
	description: '',
	unsafe: false,
	flags: [],
	execute: async msg => {
		let usagePage = `Usage of ${packageName}:
  <prefix> <command> [options ...] [arguments ...]
Prefix: ${msg.prefix}
Commands:`;
		const usageLines = [];
		for (const command of commands.commandsMap.values()) {
			let line = `  ${[command.name, ...command.aliases].join(', ')}`;
			if (command.description) line += `__ALIGN__${command.description}`;
			usageLines.push(line);
		}
		usagePage += `\n${utils.format.align(usageLines)}\nUse "${msg.prefix} <command> --help" for help about a specific command`;

		try {
			const link = await hastebin.create(usagePage);
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	},
};
