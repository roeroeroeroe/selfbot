import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import cooldown from './cooldown.js';
import commands from './commands.js';
import customCommands from './custom_commands.js';
import flag from './flag/index.js';
import utils from '../utils/index.js';
import metrics from './metrics/index.js';

const CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX = 'handler:customcommand';

const globalLocks = new Set();
const channelLocks = new Map();

export default async function handle(msg) {
	if (msg.self) return;
	msg.messageText = msg.messageText.replace(
		utils.regex.patterns.invisChars,
		''
	);

	if (msg.senderUserID === config.bot.id) {
		buildArgs(msg);
		msg.prefix = msg.query.prefix || config.commands.defaultPrefix;
		const trigger = msg.args.shift()?.toLowerCase() || '';
		if (trigger.startsWith(msg.prefix)) {
			msg.commandName =
				trigger === msg.prefix
					? msg.args.shift()?.toLowerCase() || ''
					: trigger.slice(msg.prefix.length).toLowerCase();
			const command = commands.getCommandByName(msg.commandName);
			if (command) {
				logger.debug(
					`[HANDLER] got command: ${msg.commandName}, entering regular command handler`
				);
				metrics.counter.increment(metrics.names.counters.COMMANDS_EXECUTED);
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

	let ccTriggered = false;
	for (const cc of customCommands.getGlobalAndChannelCommands(msg.channelID)) {
		if (!cc.trigger.test(msg.messageText)) continue;
		logger.debug(
			`[HANDLER] custom command ${cc.name} triggered`,
			`(trigger: ${String(cc.trigger)}, message: ${msg.messageText})`
		);
		ccTriggered = true;
		if (cc.whitelist !== null && !cc.whitelist.includes(msg.senderUserID))
			continue;
		const cooldownKey = `${CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX}:${msg.senderUserID}:${cc.name}`;
		if (cooldown.has(cooldownKey)) continue;
		logger.debug(
			'[HANDLER] cooldown and permissions checks passed for',
			`custom command ${cc.name} invoked by ${msg.senderUsername}, executing`
		);
		buildArgs(msg);
		metrics.counter.increment(metrics.names.counters.CUSTOM_COMMANDS_EXECUTED);
		sendResult(msg, await executeCustomCommand(msg, cc, cooldownKey));
		return;
	}

	if (!ccTriggered && msg.commandName && config.commands.suggestClosest) {
		logger.debug(
			`[HANDLER] unknown command ${msg.commandName}, trying to get closest match`
		);
		const closest = utils.getClosestString(
			msg.commandName,
			commands.getKnownNames()
		);
		if (closest) {
			logger.debug(
				`[HANDLER] got best match for command ${msg.commandName}: ${closest}`
			);
			sendResult(msg, {
				text: `unknown command "${msg.commandName}", the most similar command is: ${closest}`,
				mention: true,
			});
		}
	}
}

async function handleCommand(msg, command) {
	if (command.lock === 'GLOBAL') {
		if (globalLocks.has(command.name))
			return {
				text: `${command.name} already running (global lock)`,
				mention: true,
			};
		globalLocks.add(command.name);
	} else if (command.lock === 'CHANNEL') {
		let channels = channelLocks.get(command.name);
		if (!channels) {
			channels = new Set();
			channelLocks.set(command.name, channels);
		} else if (channels.has(msg.channelID))
			return {
				text: `${command.name} already running (channel lock)`,
				mention: true,
			};
		channels.add(msg.channelID);
	}

	try {
		const { options, rest, errors } = command.parseArgs(msg.args);
		logger.debug(
			`[HANDLER] parsed flags for command ${command.name}:`,
			`flags: ${JSON.stringify(options)}`,
			`args: ${rest.join(',')}`,
			`errors: ${errors.join(',')}`
		);
		msg.commandFlags = options;
		msg.args = rest;

		const pre = await flag.globalFlags.preHandle(msg, command);
		if (pre) return pre;

		if (errors.length) {
			let errorString = errors[0];
			if (errors.length > 1)
				errorString += ` (${errors.length - 1} more ${utils.format.plural(errors.length - 1, 'error')})`;
			return { text: errorString, mention: true };
		}
		logger.debug(`[HANDLER] trying to execute command ${msg.commandName}`);
		return await flag.globalFlags.postHandle(msg, await command.execute(msg));
	} catch (err) {
		logger.error(
			`regular command ${command.name} invoked by ${msg.senderUsername}`,
			`in #${msg.channelName} execution error:`,
			err
		);
	} finally {
		if (command.lock === 'GLOBAL') globalLocks.delete(command.name);
		else if (command.lock === 'CHANNEL') {
			const channels = channelLocks.get(command.name);
			if (channels) {
				channels.delete(msg.channelID);
				if (!channels.size) channelLocks.delete(command.name);
			}
		}
	}
}

async function executeCustomCommand(msg, customCommand, cooldownKey) {
	if (customCommand.cooldown) cooldown.set(cooldownKey, customCommand.cooldown);
	try {
		const result = {
			text: null,
			mention: customCommand.mention,
			reply: customCommand.reply,
		};
		if (customCommand.runcmd) {
			const command = commands.getCommandByName(customCommand.runcmd);
			if (!command) {
				logger.error(
					`regular command ${customCommand.runcmd} does not exist`,
					`(custom command ${customCommand.name} invoked by`,
					`${msg.senderUsername} in #${msg.channelName})`
				);
				return;
			}
			msg.messageText = msg.messageText
				.replace(customCommand.trigger, '')
				.trim();
			buildArgs(msg, true);
			msg.commandName = command.name;
			logger.debug(
				`[HANDLER] custom command ${customCommand.name} ->`,
				`regular command ${msg.commandName}, entering regular command handler`
			);
			result.text = (await handleCommand(msg, command))?.text;
		} else {
			result.text = customCommand.response;
		}
		logger.info(
			`[HANDLER] ${msg.senderUsername} executed custom command`,
			`${customCommand.name} in #${msg.channelName}`
		);
		return result;
	} catch (err) {
		if (customCommand.cooldown) cooldown.delete(cooldownKey);
		logger.error(
			`custom command ${customCommand.name} invoked by`,
			`${msg.senderUsername} in #${msg.channelName} execution error:`,
			err
		);
	}
}

function sendResult(msg, result) {
	if (result?.text === undefined || result?.text === null) return;
	logger.debug(
		`[HANDLER] sending result: text: ${result.text}, reply: ${result.reply}, mention: ${result.mention}`
	);
	msg.send(result.text, result.reply, result.mention);
}

function buildArgs(msg, force = false) {
	if (msg.args && !force) return;
	msg.args = utils.tokenizeArgs(msg.messageText);
	const parent = msg.ircTags['reply-parent-msg-body'];
	if (parent) {
		msg.args.shift();
		const parentArgs = utils.tokenizeArgs(parent);
		for (let i = 0; i < parentArgs.length; msg.args.push(parentArgs[i++]));
	}
}
