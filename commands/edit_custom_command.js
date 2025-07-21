import utils from '../utils/index.js';
import logger from '../services/logger.js';
import commands from '../services/commands.js';
import db from '../services/db/index.js';
import customCommands from '../services/custom_commands.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'editcommand',
	aliases: ['editcmd', 'cmdedit'],
	description: 'modify an existing custom command',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [
		['channel', 'global'],
		['response', 'runcmd'],
		['whitelist', 'clearWhitelist'],
		['reply', 'mention'],
	],
	flags: [
		{
			name: 'name',
			short: 'n',
			long: 'name',
			type: 'string',
			defaultValue: '',
			required: true,
			description: 'command to edit',
			validator: v => v,
		},
		{
			name: 'newName',
			short: null,
			long: 'new-name',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command name',
		},
		{
			name: 'channel',
			short: null,
			long: 'channel',
			type: 'username',
			defaultValue: null,
			required: false,
			description: 'new channel',
		},
		{
			name: 'global',
			short: 'g',
			long: 'global',
			type: 'boolean',
			defaultValue: null,
			required: false,
			description: 'make the command active in all channels',
		},
		{
			name: 'trigger',
			short: null,
			long: 'trigger',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command trigger (regular expression)',
			validator: v => utils.regex.construct(v) !== null,
		},
		{
			name: 'response',
			short: 'r',
			long: 'response',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command response',
		},
		{
			name: 'runcmd',
			short: 'c',
			long: 'command',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new regular command to run',
			validator: v => commands.has(v),
		},
		{
			name: 'whitelist',
			short: 'w',
			long: 'whitelist',
			type: 'username',
			list: { unique: true, minItems: 1 },
			defaultValue: null,
			required: false,
			description: 'new whitelisted users',
		},
		{
			name: 'clearWhitelist',
			short: 'W',
			long: 'clear-whitelist',
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'make the command accessible to everyone',
		},
		{
			name: 'cooldown',
			short: null,
			long: 'cooldown',
			type: 'duration',
			defaultValue: null,
			required: false,
			description: 'new per-user cooldown',
		},
		{
			name: 'reply',
			short: null,
			long: 'reply',
			type: 'boolean',
			defaultValue: null,
			required: false,
			description: 'reply to invoking user when sending response',
		},
		{
			name: 'mention',
			short: null,
			long: 'mention',
			type: 'boolean',
			defaultValue: null,
			required: false,
			description: 'mention invoking user when sending response',
		},
	],
	execute: async msg => {
		const command = customCommands.getCommandByName(msg.commandFlags.name);
		if (!command)
			return {
				text: `command ${msg.commandFlags.name} does not exist`,
				mention: true,
			};
		const newValues = {};
		if (msg.commandFlags.channel) {
			try {
				const user = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};

				if (!(await db.channel.get(user.id)))
					return { text: `unknown channel: ${user.login}`, mention: true };
				if (command.channel_id !== user.id) newValues.channel_id = user.id;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		}
		if (msg.commandFlags.global) newValues.channel_id = null;

		if (msg.commandFlags.newName) {
			if (customCommands.getCommandByName(msg.commandFlags.newName))
				return {
					text: `command ${msg.commandFlags.newName} already exists`,
					mention: true,
				};
			newValues.name = msg.commandFlags.newName;
		}

		if (msg.commandFlags.trigger) {
			const regex = utils.regex.construct(msg.commandFlags.trigger);
			if (String(regex) !== String(command.trigger)) newValues.trigger = regex;
		}

		if (msg.commandFlags.cooldown !== null)
			newValues.cooldown = msg.commandFlags.cooldown;

		for (const f of ['response', 'runcmd', 'mention', 'reply'])
			if (
				(msg.commandFlags[f] || msg.commandFlags[f] === false) &&
				msg.commandFlags[f] !== command[f]
			)
				newValues[f] = msg.commandFlags[f];

		if (msg.commandFlags.clearWhitelist) newValues.whitelist = null;
		if (msg.commandFlags.whitelist.length) {
			try {
				const usersMap = await twitch.helix.user.getMany(
					msg.commandFlags.whitelist
				);
				for (let i = 0; i < msg.commandFlags.whitelist.length; i++) {
					const n = msg.commandFlags.whitelist[i],
						u = usersMap.get(n);
					if (!u) return { text: `user ${n} does not exist`, mention: true };
					msg.commandFlags.whitelist[i] = u.id;
				}
				msg.commandFlags.whitelist = new Set(msg.commandFlags.whitelist);
			} catch (err) {
				logger.error('error getting users:', err);
				return { text: 'error getting whitelist users', mention: true };
			}
			newValues.whitelist = msg.commandFlags.whitelist;
		}

		if (!Object.keys(newValues).length)
			return {
				text: 'you must specify at least one property to edit',
				mention: true,
			};
		try {
			await customCommands.edit(command.name, newValues);
		} catch (err) {
			logger.error(`error editing command ${command.name}:`, err);
			return {
				text: `error updating command ${command.name}: ${err.message}`,
				mention: true,
			};
		}

		return {
			text: `successfully updated ${Object.keys(newValues).join(', ')}`,
			mention: true,
		};
	},
};
