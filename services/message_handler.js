import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import cooldown from './cooldown.js';
import commands from './commands.js';
import customCommands from './custom_commands.js';
import flag from './flag/index.js';
import utils from '../utils/index.js';
import metrics from './metrics.js';

const COMMANDS_EXECUTED_METRICS_COUNTER = 'commands_executed';
const CUSTOM_COMMANDS_EXECUTED_METRICS_COUNTER = 'custom_commands_executed';
metrics.counter.create(COMMANDS_EXECUTED_METRICS_COUNTER);
metrics.counter.create(CUSTOM_COMMANDS_EXECUTED_METRICS_COUNTER);

const CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX = 'handler:customcommand';

export default async function handle(msg) {
	if (msg.self) return;
	msg.messageText = msg.messageText.replace(
		utils.regex.patterns.invisChars,
		''
	);
	msg.args = utils.shellSplit(msg.messageText);
	const parent = msg.ircTags['reply-parent-msg-body'];
	if (parent) {
		msg.args.shift();
		msg.args.push(...utils.shellSplit(parent));
	}

	if (msg.senderUserID === config.bot.id) {
		msg.prefix = msg.query.prefix || config.defaultPrefix;
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
				metrics.counter.increment(COMMANDS_EXECUTED_METRICS_COUNTER);
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
			`[HANDLER] custom command ${cc.name} triggered (trigger: ${cc.trigger.toString()}, message: ${msg.messageText}), checking cooldown and permissions`
		);
		ccTriggered = true;
		if (cc.whitelist !== null && !cc.whitelist.includes(msg.senderUserID))
			continue;
		const cooldownKey = `${CUSTOM_COMMAND_COOLDOWN_KEY_PREFIX}:${msg.senderUserID}:${cc.name}`;
		if (cooldown.has(cooldownKey)) continue;
		logger.debug(
			`[HANDLER] cooldown and permissions checks passed for custom command ${cc.name} invoked by ${msg.senderUsername}, executing`
		);
		metrics.counter.increment(CUSTOM_COMMANDS_EXECUTED_METRICS_COUNTER);
		sendResult(msg, await executeCustomCommand(msg, cc, cooldownKey));
		return;
	}

	if (!ccTriggered && msg.commandName && config.getClosestCommand) {
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
	const { options, rest, errors } = flag.parse(msg.args, command.flagData);
	logger.debug(
		`[HANDLER] parsed flags for command ${command.name}:`,
		`flags: ${JSON.stringify(options)}`,
		`args: ${rest.join(',')}`,
		`errors: ${errors.join(',')}`
	);
	msg.commandFlags = options;
	msg.args = rest;

	const pre = await flag.globalFlags.preHandle(msg, command);
	if (pre) {
		logger.debug('[HANDLER] got global flags pre result:', pre);
		return pre;
	}

	if (errors.length) {
		let errorString = errors[0];
		if (errors.length > 1)
			errorString += ` (${errors.length - 1} more ${utils.format.plural(errors.length - 1, 'error')})`;
		return { text: errorString, mention: true };
	}

	try {
		logger.debug(`[HANDLER] trying to execute command ${msg.commandName}`);
		return await flag.globalFlags.postHandle(msg, await command.execute(msg));
	} catch (err) {
		logger.error(
			`regular command ${command.name} invoked by ${msg.senderUsername} in #${msg.channelName} execution error:`,
			err
		);
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
					`regular command ${customCommand.runcmd} does not exist (custom command ${customCommand.name} invoked by ${msg.senderUsername} in #${msg.channelName})`
				);
				return;
			}
			msg.messageText = msg.messageText
				.replace(customCommand.trigger, '')
				.trim();
			msg.args = utils.shellSplit(msg.messageText);
			msg.commandName = command.name;
			logger.debug(
				`[HANDLER] custom command ${customCommand.name} -> regular command ${msg.commandName}, entering regular command handler`
			);
			result.text = (await handleCommand(msg, command))?.text;
		} else {
			result.text = customCommand.response;
		}
		logger.info(
			`[HANDLER] ${msg.senderUsername} executed custom command ${customCommand.name} in #${msg.channelName}`
		);
		return result;
	} catch (err) {
		if (customCommand.cooldown) cooldown.delete(cooldownKey);
		logger.error(
			`custom command ${customCommand.name} invoked by ${msg.senderUsername} in #${msg.channelName} execution error:`,
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
