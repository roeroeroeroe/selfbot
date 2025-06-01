import logger from './logger.js';
import utils from '../utils/index.js';
import db from './db/index.js';

const commands = new Map();
const byName = new Map();

function normalizeTrigger(command) {
	if (!(command.trigger instanceof RegExp))
		command.trigger = utils.regex.construct(command.trigger);
	return command;
}

async function add(command, persist = true) {
	if (byName.has(command.name))
		throw new Error(`duplicate command name: ${command.name}`);

	normalizeTrigger(command);
	if (Array.isArray(command.whitelist) && !command.whitelist.length)
		command.whitelist = null;

	if (persist)
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

	const key = command.channel_id ?? null;
	const arr = commands.get(key) || [];
	arr.push(command);
	commands.set(key, arr);
	byName.set(command.name, command);
	return command;
}

async function deleteCommand(name, channelId = null, persist = true) {
	const existing = byName.get(name);
	if (!existing) {
		logger.warning(`[CUSTOMCOMMANDS] delete failed, no such command: ${name}`);
		return false;
	}

	if (persist) await db.customCommand.delete(name);

	const key = channelId ?? null;
	const arr = commands.get(key);
	if (arr) {
		const i = arr.findIndex(c => c.name === name);
		if (i !== -1) {
			arr.splice(i, 1);
			if (!arr.length) commands.delete(key);
		} else
			logger.warning(
				`[CUSTOMCOMMANDS] delete in-memory failed for ${name} in channel ${key || 'GLOBAL'}`
			);
	}
	byName.delete(name);
	return true;
}

async function edit(name, newValues = {}, persist = true) {
	const old = byName.get(name);
	if (!old) {
		logger.warning(`[CUSTOMCOMMANDS] edit failed, no such command: ${name}`);
		return null;
	}

	if (newValues.name && newValues.name !== name && byName.has(newValues.name))
		throw new Error(`duplicate command name: ${newValues.name}`);

	if (newValues.trigger instanceof RegExp)
		newValues.trigger = String(newValues.trigger);
	if (persist) await db.customCommand.update(name, newValues);

	const merged = { ...old, ...newValues };
	normalizeTrigger(merged);
	if (Array.isArray(merged.whitelist) && !merged.whitelist.length)
		merged.whitelist = null;
	const channelChanged =
		'channel_id' in newValues && newValues.channel_id !== old.channel_id;
	const nameChanged = 'name' in newValues && newValues.name !== name;

	if (channelChanged || nameChanged) {
		await deleteCommand(name, old.channel_id, false);
		await add(merged, false);
	} else {
		byName.set(name, merged);
		const arr = commands.get(old.channel_id ?? null);
		const i = arr.findIndex(c => c.name === name);
		if (i !== -1) arr[i] = merged;
		else
			logger.warning(
				`[CUSTOMCOMMANDS] edit in-memory failed for ${name} in channel ${old.channel_id || 'GLOBAL'}`
			);
	}
	return merged;
}

async function load() {
	commands.clear();
	byName.clear();

	for (const command of await db.query('SELECT * FROM customcommands')) {
		normalizeTrigger(command);
		const key = command.channel_id ?? null;
		const arr = commands.get(key) || [];
		arr.push(command);
		commands.set(key, arr);
		byName.set(command.name, command);
		logger.debug(`[CUSTOMCOMMANDS] loaded ${command.name}`);
	}

	return byName.size;
}

function getCommandByName(name) {
	return byName.get(name) || null;
}

function getGlobalCommands() {
	return commands.get(null) || [];
}

function getChannelCommands(channelId) {
	return commands.get(channelId) || [];
}

function* getGlobalAndChannelCommands(channelId) {
	const channelCommands = commands.get(channelId);
	if (channelCommands) for (const c of channelCommands) yield c;
	const globalCommands = commands.get(null);
	if (globalCommands) for (const c of globalCommands) yield c;
}

function getAllCommands() {
	return Array.from(commands.values()).flat();
}

export default {
	add,
	delete: deleteCommand,
	edit,
	load,

	getCommandByName,
	getGlobalCommands,
	getChannelCommands,
	getGlobalAndChannelCommands,
	getAllCommands,
};
