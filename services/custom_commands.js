import logger from './logger.js';
import utils from '../utils/index.js';
import db from './db.js';

const globalCommands = [];
const channelCommands = new Map();
const commandLookup = new Map();

async function add(command, addToDB = true) {
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

	commandLookup.set(command.name, command);
	if (!command.channel_id) globalCommands.push(command);
	else {
		if (!channelCommands.has(command.channel_id))
			channelCommands.set(command.channel_id, []);
		channelCommands.get(command.channel_id).push(command);
	}
}

async function deleteCommand(commandName, channelId, deleteFromDB = true) {
	if (deleteFromDB) await db.customCommand.delete(commandName);

	commandLookup.delete(commandName);
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
	const command = commandLookup.get(commandName);
	if (!command) return;

	const oldChannelId = command.channel_id;

	await db.customCommand.update(commandName, newValues);
	Object.assign(command, newValues);
	if ('name' in newValues || 'channel_id' in newValues) {
		await deleteCommand(commandName, oldChannelId, false);
		await add(command, false);
	}

	return command;
}

async function load() {
	globalCommands.length = 0;
	channelCommands.clear();
	commandLookup.clear();

	for (const command of await db.query('SELECT * FROM customcommands')) {
		add(command, false);
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
