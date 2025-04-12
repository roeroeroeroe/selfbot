import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import { initFlags } from './flag.js';
import { alignLines } from '../utils/formatters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = new Map();
const aliases = new Map();
let knownCommands = [],
	dirty = false;

function add(command) {
	if (!command.aliases) command.aliases = [];
	validateCommandModule(command);
	command.flagData = initFlags(command.flags || []);

	let usage = `Usage of ${command.name}`;
	if (command.aliases.length) usage += ` (${command.aliases.join(', ')})`;
	usage += ':';
	const usageLines = [];
	for (const flag of Object.values(command.flagData.flags)) {
		const optsParts = [];
		if (flag.aliases[0]) optsParts.push(`-${flag.aliases[0]}`);
		if (flag.aliases[1]) optsParts.push(`--${flag.aliases[1]}`);
		let line = `${optsParts.join(', ')} ${flag.type}${flag.required ? ' required' : ''}`;
		if (flag.description) line += `__ALIGN__${flag.description}`;
		usageLines.push(`  ${line}`);
	}
	usage += `\n${alignLines(usageLines)}`;
	command.helpPage = usage;

	commands.set(command.name, command);
	for (const alias of command.aliases) aliases.set(alias, command.name);
	dirty = true;
}

function deleteCommand(command) {
	commands.delete(command.name);
	for (const alias of command.aliases) aliases.delete(alias);
	dirty = true;
}

function getCommandByName(commandName) {
	return commands.get(commandName) || commands.get(aliases.get(commandName));
}

function getKnownNames() {
	if (dirty) {
		knownCommands = [...commands.keys(), ...aliases.keys()];
		dirty = false;
	}
	return knownCommands;
}

function getCommandsMap() {
	return commands;
}

function has(commandName) {
	return commands.has(commandName) || aliases.has(commandName);
}

function validateCommandModule(command) {
	if (typeof command.name !== 'string' || /\s/.test(command.name))
		throw new Error('command name must be a string with no spaces');

	if (has(command.name))
		throw new Error(`command name "${command.name}" conflict`);

	if (!Array.isArray(command.aliases))
		throw new Error(`aliases for command "${command.name}" must be an array`);

	for (const alias of command.aliases) {
		if (typeof alias !== 'string' || /\s/.test(alias))
			throw new Error(
				`aliases for command "${command.name}" must be an array of strings with no spaces`
			);

		const duplicate = getCommandByName(alias);
		if (duplicate)
			throw new Error(
				`alias "${alias}" for command "${command.name}" conflicts with command "${duplicate.name}"`
			);
	}

	if (typeof command.description !== 'string')
		throw new Error(
			`description for command "${command.name}" must be a string`
		);

	if (typeof command.unsafe !== 'boolean')
		throw new Error(`'unsafe' for command "${command.name}" must be a boolean`);

	if (!Array.isArray(command.flags))
		throw new Error(`flags for command "${command.name}" must be an array`);

	if (typeof command.execute !== 'function')
		throw new Error(
			`'execute' for command "${command.name}" must be a function`
		);
}

async function load() {
	commands.clear();
	aliases.clear();
	knownCommands.length = 0;
	dirty = false;
	const commandFiles = fs
		.readdirSync(path.join(__dirname, '../commands'))
		.filter(file => file.endsWith('.js'));
	let i = 0;
	for (const f of commandFiles)
		try {
			const commandModule = (
				await import(path.join(__dirname, `../commands/${f}`))
			).default;
			if (!config.loadUnsafeCommands && commandModule.unsafe) {
				logger.debug(
					`[COMMANDS] skipping unsafe command ${f}: ${commandModule.name}`
				);
				continue;
			}
			add(commandModule);
			logger.debug(`[COMMANDS] loaded ${f}: ${commandModule.name}`);
			i++;
		} catch (err) {
			logger.error(`error loading command ${f}:`, err);
		}

	return i;
}

export default {
	add,
	delete: deleteCommand,
	getCommandByName,
	getKnownNames,
	getCommandsMap,
	has,
	load,
};
