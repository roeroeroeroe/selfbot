import hastebin from '../hastebin.js';
import logger from '../logger.js';
import utils from '../../utils/index.js';

const GLOBAL_FLAGS_SCHEMA = [
	{
		name: 'help',
		type: 'boolean',
		defaultValue: false,
		aliases: [null, 'help'],
		required: false,
		description: 'print this help page',
	},
	{
		name: 'fromPaste',
		type: 'url',
		defaultValue: '',
		aliases: [null, 'from-paste'],
		required: false,
		description: 'populate arguments from paste',
	},
];

async function handleGlobalFlags(msg, command) {
	if (msg.commandFlags.help)
		try {
			const link = await hastebin.create(command.helpPage);
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}

	if (msg.commandFlags.fromPaste)
		try {
			const content = await hastebin.get(msg.commandFlags.fromPaste);
			for (const arg of utils.shellSplit(content)) msg.args.push(arg);
		} catch (err) {
			logger.error('error fetching paste:', err);
			return { text: `error fetching paste: ${err.message}`, mention: true };
		}
}

export default {
	GLOBAL_FLAGS_SCHEMA,

	handle: handleGlobalFlags,
};
