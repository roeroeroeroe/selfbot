import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import StringMatcher from './string_matcher.js';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import flag from './flag/index.js';
import utils from '../utils/index.js';

const VALID_LOCKS = new Set(['GLOBAL', 'CHANNEL', 'NONE']);

const MAX_COMMAND_NAME_DISTANCE = 5;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = new Map();
const aliases = new Map();
let dirty = false,
	commandNameMatcher;

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

async function add(command) {
	validateCommand(command);
	if (command.init) await command.init();
	const {
		flags: flagData,
		exclusiveGroups,
		parse,
	} = flag.parser.create(command.flags, command.exclusiveFlagGroups ?? []);
	command.flagData = flagData;
	command.parseArgs = parse;

	let usage = `Usage of ${command.name}`;
	if (command.aliases.length) usage += ` (${command.aliases.join(', ')})`;
	usage += ':';
	const flagLines = flagData.map(
		f => `  ${f.summary}${f.description ? `${alignSep}${f.description}` : ''}`
	);
	usage += `\n${utils.format.align(flagLines)}`;
	const displayByName = new Map(flagData.map(f => [f.name, f.optionsDisplay]));
	const exclusiveFlagLines = [];
	for (let i = 0; i < exclusiveGroups.length; i++) {
		const group = exclusiveGroups[i];
		if (group.length < 2) continue;
		exclusiveFlagLines.push(
			'  ' + group.map(n => displayByName.get(n)).join(`${alignSep}| `)
		);
	}
	if (exclusiveFlagLines.length)
		usage += `\n\nMutually exclusive flags:\n${utils.format.align(exclusiveFlagLines)}`;
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
	return commands.get(commandName) ?? commands.get(aliases.get(commandName));
}

function getClosestKnownName(commandNameInput) {
	if (dirty) {
		try {
			commandNameMatcher = new StringMatcher([
				...commands.keys(),
				...aliases.keys(),
			]);
		} catch (err) {
			logger.warning(
				'failed to initialize string matcher for command names:',
				err
			);
		}
		dirty = false;
	}
	if (!commandNameMatcher) return null;
	return commandNameMatcher.getClosest(
		commandNameInput,
		MAX_COMMAND_NAME_DISTANCE
	);
}

function has(commandName) {
	return commands.has(commandName) || aliases.has(commandName);
}
// prettier-ignore
function validateCommand(command) {
	if (typeof command.name !== 'string' || /\s/.test(command.name))
		throw new Error("'name' must be a string with no spaces");
	if (has(command.name))
		throw new Error(`command name "${command.name}" conflict`);
	if (!Array.isArray(command.aliases))
		throw new Error(`'aliases' for command "${command.name}" must be an array`);
	for (const alias of command.aliases) {
		if (typeof alias !== 'string' || /\s/.test(alias))
			throw new Error(`'aliases' for command "${command.name}" must be ` +
			                'an array of strings with no spaces');
		const duplicate = getCommandByName(alias);
		if (duplicate)
			throw new Error(`alias "${alias}" for command "${command.name}" ` +
			                `conflicts with command "${duplicate.name}"`);
	}
	if (typeof command.description !== 'string')
		throw new Error(`'description' for command "${command.name}" must be a string`);
	if (typeof command.unsafe !== 'boolean')
		throw new Error(`'unsafe' for command "${command.name}" must be a boolean`);
	if (typeof command.lock !== 'string' || !VALID_LOCKS.has(command.lock))
		throw new Error(`'lock' for command "${command.name}" must be one of: ` +
		                [...VALID_LOCKS].join(', '));
	if (command.exclusiveFlagGroups !== undefined &&
	    command.exclusiveFlagGroups !== null) {
		if (!Array.isArray(command.exclusiveFlagGroups))
			throw new Error(`'exclusiveFlagGroups' for "${command.name}" must be an array`);
		for (let i = 0; i < command.exclusiveFlagGroups.length; i++) {
			const group = command.exclusiveFlagGroups[i];
			if (!Array.isArray(group))
				throw new Error(`exclusiveFlagGroups[${i}] for "${command.name}" ` +
				                'must be an array of strings');
			if (group.length < 2)
				throw new Error(`exclusiveFlagGroups[${i}] for "${command.name}" ` +
				                'must contain at least two flags');
			for (const name of group)
				if (typeof name !== 'string')
					throw new Error(`exclusiveFlagGroups[${i}] for "${command.name}" ` +
					                'must be an array of strings');
		}
	}
	if (!Array.isArray(command.flags))
		throw new Error(`'flags' for command "${command.name}" must be an array`);
	if (command.init !== undefined && command.init !== null &&
	    typeof command.init !== 'function')
		throw new Error(`'init' for command "${command.name}" must be a function`);
	if (typeof command.execute !== 'function')
		throw new Error(`'execute' for command "${command.name}" must be a function`);
}

async function load() {
	commands.clear();
	aliases.clear();
	if (commandNameMatcher) commandNameMatcher = null;
	dirty = false;
	const commandFiles = fs
		.readdirSync(path.join(__dirname, '../commands'))
		.filter(f => f.endsWith('.js'));
	let c = 0;
	for (const f of commandFiles)
		try {
			const commandPath = pathToFileURL(
				path.join(__dirname, `../commands/${f}`)
			).href;
			const t0 = performance.now();
			const command = (await import(commandPath)).default;
			const t1 = performance.now();
			if (!config.commands.loadUnsafe && command.unsafe) {
				logger.debug(
					`[COMMANDS] skipping unsafe command ${f}: ${command.name}`
				);
				continue;
			}
			await add(command);
			const t2 = performance.now();
			logger.debug(
				`[COMMANDS] loaded ${f} in ${(t2 - t0).toFixed(3)}ms`,
				`(import: ${(t1 - t0).toFixed(3)}ms, add: ${(t2 - t1).toFixed(3)}ms):`,
				command.name +
					(command.aliases.length ? `, ${command.aliases.join(', ')}` : '')
			);
			c++;
		} catch (err) {
			err.message = `error loading command ${f}: ${err.message}`;
			throw err;
		}

	return c;
}

export default {
	add,
	delete: deleteCommand,
	getCommandByName,
	getClosestKnownName,
	get commandsMap() {
		return commands;
	},
	has,
	load,
};
