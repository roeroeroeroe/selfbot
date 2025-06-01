import config from '../../config.json' with { type: 'json' };
import hastebin from '../hastebin.js';
import logger from '../logger.js';
import utils from '../../utils/index.js';

const normalizedHastebinUrl = config.hastebinInstance.replace(/\/+$/, '') + '/';

const EXCLUSIVE_GROUPS = [
	['quiet', 'timeExec'],
	['quiet', 'toPaste'],
];
const SCHEMA = [
	{
		name: 'timeExec',
		aliases: [null, 'time'],
		type: 'boolean',
		required: false,
		defaultValue: false,
		description: 'print execution time',
	},
	// pre
	{
		name: 'help',
		aliases: [null, 'help'],
		type: 'boolean',
		required: false,
		defaultValue: false,
		description: 'print this help page',
	},
	{
		name: 'fromPaste',
		aliases: [null, 'from-paste'],
		type: 'url',
		required: false,
		defaultValue: null,
		description: 'populate arguments from paste',
	},
	// post
	{
		name: 'quiet',
		aliases: [null, 'quiet'],
		type: 'boolean',
		required: false,
		defaultValue: false,
		description: 'do not print output',
	},
	{
		name: 'toPaste',
		aliases: [null, 'to-paste'],
		type: 'boolean',
		required: false,
		defaultValue: false,
		description: 'upload the result to hastebin and return the link',
	},
];

async function preHandle(msg, command) {
	if (msg.commandFlags.timeExec) msg.execT0 = performance.now();
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
			for (const arg of utils.tokenizeArgs(content)) msg.args.push(arg);
		} catch (err) {
			logger.error('error getting paste:', err);
			return { text: `error getting paste: ${err.message}`, mention: true };
		}
}

const postFlagHandlers = [
	// quiet
	(msg, result) => {
		return msg.commandFlags.quiet ? null : result;
	},
	// timeExec
	(msg, result) => {
		if (!msg.commandFlags.timeExec) return result;
		const execT1 = performance.now();
		const duration = msg.execT0
			? (execT1 - msg.execT0).toFixed(3) + 'ms'
			: 'N/A';
		if (result.text)
			result.text += ` ${config.responsePartsSeparator} took ${duration}`;
		else result.text = `took ${duration}`;
		return result;
	},
	// toPaste
	async (msg, result) => {
		if (!msg.commandFlags.toPaste) return result;

		const text = result?.text;
		if (!text) return result;

		const maxLength = utils.getMaxMessageLength(
			msg.senderUsername,
			result.reply,
			result.mention
		);

		if (text.includes(normalizedHastebinUrl) && text.length <= maxLength)
			return result;

		try {
			result.text = await hastebin.create(text);
			return result;
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: `error creating paste: ${err.message}`, mention: true };
		}
	},
];

async function postHandle(msg, result) {
	for (let i = 0; i < postFlagHandlers.length; i++) {
		result = await postFlagHandlers[i](msg, result);
		if (result === null || result === undefined) return null;
	}

	return result;
}

export default {
	EXCLUSIVE_GROUPS,
	SCHEMA,

	preHandle,
	postHandle,
};
