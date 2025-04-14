import logger from './logger.js';
import utils from '../utils/index.js';
import db from './db.js';

const globalCommands = [];
const channelCommands = new Map();
const commandLookup = new Map();

async function add(command, addToDB = true) {
	if (commandLookup.has(command.name))
		throw new Error('duplicate command name');
	if (!(command.trigger instanceof RegExp)) {
		const match = command.trigger.match(utils.regex.patterns.regexp);
		command.trigger = new RegExp(match[1], match[2]);
	}
	if (addToDB)
		await db.customCommand.insert(
			command.name,
			command.channel_id,
			String(command.trigger),
			command.response,
			command.runcmd,
			command.whitelist,
			command.cooldown,
			command.reply,
			command.mention
		);

	if (!command.channel_id) globalCommands.push(command);
	else {
		const arr = channelCommands.get(command.channel_id) || [];
		arr.push(command);
		channelCommands.set(command.channel_id, arr);
	}
	commandLookup.set(command.name, command);
}

async function deleteCommand(commandName, channelId, deleteFromDB = true) {
	if (deleteFromDB) await db.customCommand.delete(commandName);

	if (!channelId) {
		const i = globalCommands.findIndex(c => c.name === commandName);
		if (i !== -1) globalCommands.splice(i, 1);
		else
			logger.warning(
				`[CUSTOMCOMMANDS] not deleting global command ${commandName} from memory: failed to find command`
			);
	} else {
		const commands = channelCommands.get(channelId);
		if (commands) {
			const i = commands.findIndex(c => c.name === commandName);
			if (i !== -1) {
				commands.splice(i, 1);
				if (!commands.length) channelCommands.delete(channelId);
			} else
				logger.warning(
					`[CUSTOMCOMMANDS] not deleting channel command (${channelId}) ${commandName} from memory: failed to find command`
				);
		}
	}
	commandLookup.delete(commandName);
}

function getCommandByName(commandName) {
	return commandLookup.get(commandName);
}

function getChannelCommands(channelId) {
	return channelCommands.get(channelId) || [];
}

function* getGlobalAndChannelCommands(channelID) {
	for (const c of getChannelCommands(channelID)) yield c;
	for (const c of globalCommands) yield c;
}

function getAllCommands() {
	return [...globalCommands, ...Array.from(channelCommands.values()).flat()];
}

async function edit(commandName, newValues = {}) {
	if (
		newValues.name &&
		newValues.name !== commandName &&
		commandLookup.has(newValues.name)
	)
		throw new Error('duplicate command name');

	const oldCommand = commandLookup.get(commandName);
	if (!oldCommand) {
		logger.warning(
			`[CUSTOMCOMMANDS] not updating command ${commandName}: unknown command`
		);
		return;
	}

	const oldChannelId = oldCommand.channel_id;
	const updatedCommand = {
		...oldCommand,
		...newValues,
	};

	await db.customCommand.update(commandName, newValues);

	if ('name' in newValues || 'channel_id' in newValues) {
		await deleteCommand(commandName, oldChannelId, false);
		await add(updatedCommand, false);
	} else {
		commandLookup.set(commandName, updatedCommand);
		const commandsArray = oldChannelId
			? channelCommands.get(oldChannelId)
			: globalCommands;

		const i = commandsArray?.findIndex(c => c.name === commandName);
		if (i !== -1) commandsArray[i] = updatedCommand;
		else
			logger.warning(
				`[CUSTOMCOMMANDS] not updating command ${commandName} in memory: failed to find command`
			);
	}

	return updatedCommand;
}

async function load() {
	globalCommands.length = 0;
	channelCommands.clear();
	commandLookup.clear();

	for (const command of await db.query('SELECT * FROM customcommands')) {
		await add(command, false);
		logger.debug(`[CUSTOMCOMMANDS] loaded command ${command.name}`);
	}

	return channelCommands.size + globalCommands.length;
}

export default {
	globalCommands,

	add,
	delete: deleteCommand,
	getCommandByName,
	getChannelCommands,
	getGlobalAndChannelCommands,
	getAllCommands,
	edit,
	load,
};
