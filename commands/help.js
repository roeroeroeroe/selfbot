import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import commands from '../services/commands.js';
import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';

export default {
	name: 'help',
	aliases: ['usage'],
	description: "query bot's database",
	unsafe: false,
	flags: [],
	execute: async msg => {
		const commandsMap = commands.getCommandsMap();
		let usagePage = `Usage of ${await getPackageName()}:
  [prefix] [command] [options] [arguments ...]
Prefix: ${msg.prefix}
Commands:`;
		const usageLines = [];
		for (const command of commandsMap.values()) {
			let line = `  ${[command.name, ...command.aliases].join(', ')}`;
			if (command.description) line += `__ALIGN__${command.description}`;
			usageLines.push(line);
		}
		usagePage += `\n${utils.format.align(usageLines)}\nUse "${msg.prefix} [command] --help" for help about a specific command`;

		try {
			const link = await hastebin.create(usagePage, true);
			return {
				text: link,
				mention: true,
			};
		} catch (err) {
			logger.error('error creating paste:', err);
			return {
				text: 'error creating paste',
				mention: true,
			};
		}
	},
};

async function getPackageName() {
	const pkgPath = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'../package.json'
	);

	try {
		return JSON.parse(await readFile(pkgPath, 'utf-8')).name;
	} catch {
		return path.basename(process.argv[1]);
	}
}
