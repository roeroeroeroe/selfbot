import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import cooldown from './cooldown.js';
import commands from './commands.js';
import customCommands from './custom_commands.js';
import hastebin from './hastebin.js';
import flag from './flag.js';
import utils from '../utils/index.js';

const CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX = 'handler:customcommand';

export default async function handle(msg) {
	msg.messageText = msg.messageText.replace(utils.regex.patterns.invisChars, '');
	msg.args = utils.shellSplit(msg.messageText);
	if (msg.ircTags['reply-parent-msg-id']) {
		msg.args.shift();
		msg.args.push(...utils.shellSplit(msg.ircTags['reply-parent-msg-body']));
	}

	if (msg.senderUserID === config.bot.id) {
		msg.prefix = msg.query?.prefix || config.defaultPrefix;
		const trigger = msg.args.shift()?.toLowerCase() || '';
		if (trigger.startsWith(msg.prefix)) {
			msg.commandName =
				trigger === msg.prefix
					? msg.args.shift()?.toLowerCase() || ''
					: trigger.slice(msg.prefix.length).toLowerCase();
			const command = commands.getCommandByName(msg.commandName);
			if (command) {
				logger.debug(
					`[HANDLER] got valid command: ${msg.commandName}, entering regular command handler`
				);
				const commandResult = await handleCommand(msg, command);
				logger.debug(
					`[HANDLER] executed command ${msg.commandName}, result:`,
					commandResult
				);
				sendResult(msg, commandResult);
				return;
			}
		}
	}

	let customCommandTriggered = false;
	for (const customCommand of customCommands.getGlobalAndChannelCommands(
		msg.channelID
	))
		if (customCommand.trigger.test(msg.messageText)) {
			logger.debug(
				`[HANDLER] custom command ${customCommand.name} triggered (trigger: ${customCommand.trigger.toString()}, message: ${msg.messageText}), checking cooldown and permissions`
			);
			customCommandTriggered = true;
			if (
				cooldown.has(
					`${CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX}:${msg.senderUserID}:${customCommand.name}`
				) ||
				(customCommand.whitelist !== null &&
					!customCommand.whitelist.includes(msg.senderUserID))
			)
				continue;
			logger.debug(
				`[HANDLER] cooldown and permissions checks passed for custom command ${customCommand.name} invoked by ${msg.senderUsername}, executing`
			);
			sendResult(msg, await executeCustomCommand(msg, customCommand));
			return;
		}

	if (!customCommandTriggered && msg.commandName && config.getClosestCommand) {
		logger.debug(
			`[HANDLER] unknown command ${msg.commandName}, trying to get closest match`
		);
		const bestMatch = utils.getClosestString(
			msg.commandName,
			commands.getKnownNames()
		);
		if (bestMatch) {
			logger.debug(
				`[HANDLER] got best match for command ${msg.commandName}: ${bestMatch}`
			);
			sendResult(msg, {
				text: `unknown command "${msg.commandName}", the most similar command is: ${bestMatch}`,
				mention: true,
			});
		}
	}
}

async function handleGlobalFlags(msg, command) {
	if (msg.commandFlags.help) {
		try {
			const link = await hastebin.create(command.helpPage, true);
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	}

	if (msg.commandFlags.fromPaste) {
		try {
			const content = await hastebin.get(msg.commandFlags.fromPaste);
			for (const arg of utils.shellSplit(content)) msg.args.push(arg);
		} catch (err) {
			logger.error('error fetching paste:', err);
			return { text: `error fetching paste: ${err.message}`, mention: true };
		}
	}
}

async function handleCommand(msg, command) {
	const { options, rest, errors } = flag.parse(msg.args, command.flagData);
	logger.debug(
		`[HANDLER] parsed flags for command ${command.name}:`,
		`flags: ${JSON.stringify(options)}`,
		`args: ${rest.join(',')}`,
		`errors: ${errors.join(',')}`
	);
	msg.commandFlags = options;
	msg.args = rest;

	const globalFlagsResult = await handleGlobalFlags(msg, command);
	if (globalFlagsResult) {
		logger.debug('[HANDLER] got global flags result:', globalFlagsResult);
		return globalFlagsResult;
	}

	if (errors.length) {
		let errorString = errors[0];
		if (errors.length > 1)
			errorString += ` (${errors.length - 1} more ${utils.format.plural(errors.length - 1, 'error')})`;
		return { text: errorString, mention: true };
	}

	try {
		logger.debug(`[HANDLER] trying to execute command ${msg.commandName}`);
		return await command.execute(msg);
	} catch (err) {
		logger.error(
			`regular command ${command.name} invoked by ${msg.senderUsername} in #${msg.channelName} execution error:`,
			err
		);
	}
}

async function executeCustomCommand(msg, customCommand) {
	if (customCommand.cooldown) {
		cooldown.set(
			`${CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX}:${msg.senderUserID}:${customCommand.name}`,
			customCommand.cooldown
		);
	}
	try {
		const result = {
			text: null,
			mention: customCommand.mention,
			reply: customCommand.reply,
		};
		if (customCommand.runcmd) {
			logger.debug(
				`[HANDLER] getting regular command ${customCommand.runcmd} for custom command ${customCommand.name}`
			);
			const command = commands.getCommandByName(customCommand.runcmd);
			if (!command) {
				logger.error(
					`regular command ${customCommand.runcmd} does not exist (custom command ${customCommand.name} invoked by ${msg.senderUsername} in #${msg.channelName})`
				);
				return;
			}
			msg.messageText = msg.messageText
				.replace(customCommand.trigger, '')
				.trim();
			logger.debug(
				`[HANDLER] removed trigger ${customCommand.trigger.toString()} from message, result: ${msg.messageText}`
			);
			msg.args = utils.shellSplit(msg.messageText);
			msg.commandName = command.name;
			logger.debug(
				`[HANDLER] custom command ${customCommand.name} -> regular command ${msg.commandName}, entering regular command handler`
			);
			const regularCommandResult = await handleCommand(msg, command);
			result.text = regularCommandResult?.text;
		} else {
			result.text = customCommand.response;
		}
		logger.info(
			`[HANDLER] ${msg.senderUsername} executed custom command ${customCommand.name} in #${msg.channelName}`
		);
		return result;
	} catch (err) {
		if (customCommand.cooldown)
			cooldown.delete(
				`${CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX}:${msg.senderUserID}:${customCommand.name}`
			);
		logger.error(
			`custom command ${customCommand.name} invoked by ${msg.senderUsername} in #${msg.channelName} execution error:`,
			err
		);
	}
}

function sendResult(msg, result) {
	if (!result?.text) return;
	logger.debug(
		`[HANDLER] sending result: text: ${result.text}, reply: ${result.reply}, mention: ${result.mention}`
	);
	msg.send(result.text, result.reply, result.mention);
}
