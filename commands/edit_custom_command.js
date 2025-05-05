import utils from '../utils/index.js';
import logger from '../services/logger.js';
import commands from '../services/commands.js';
import db from '../services/db.js';
import customCommands from '../services/custom_commands.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'editcommand',
	aliases: ['editcmd', 'cmdedit'],
	description: 'modify an existing custom command',
	unsafe: false,
	flags: [
		{
			name: 'name',
			aliases: ['n', 'name'],
			type: 'string',
			defaultValue: '',
			required: true,
			description: 'command to edit',
		},
		{
			name: 'newName',
			aliases: [null, 'new-name'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command name',
		},
		{
			name: 'channel',
			aliases: [null, 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new channel',
		},
		{
			name: 'trigger',
			aliases: [null, 'trigger'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command trigger',
			validator: v => {
				try {
					const m = v.match(utils.regex.patterns.regexp);
					new RegExp(m[1], m[2]);
					return true;
				} catch {
					return false;
				}
			},
		},
		{
			name: 'response',
			aliases: ['r', 'response'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new command response',
		},
		{
			name: 'runcmd',
			aliases: ['c', 'command'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'new regular command to run',
			validator: v => commands.has(v),
		},
		{
			name: 'whitelist',
			aliases: ['w', 'whitelist'],
			type: 'string',
			defaultValue: null,
			required: false,
			description: 'new list of whitelisted users, e.g., "user1 user2"',
		},
		{
			name: 'cooldown',
			aliases: [null, 'cooldown'],
			type: 'duration',
			defaultValue: null,
			required: false,
			description: 'new per-user cooldown',
		},
		{
			name: 'reply',
			aliases: [null, 'reply'],
			type: 'boolean',
			defaultValue: null,
			required: false,
			description: 'reply to invoking user when sending response',
		},
		{
			name: 'mention',
			aliases: [null, 'mention'],
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

		if (msg.commandFlags.newName) {
			if (customCommands.getCommandByName(msg.commandFlags.newName))
				return {
					text: `command ${msg.commandFlags.newName} already exists`,
					mention: true,
				};
			newValues.name = msg.commandFlags.newName;
		}

		if (msg.commandFlags.trigger) {
			const match = msg.commandFlags.trigger.match(utils.regex.patterns.regexp);
			const regex = new RegExp(match[1], match[2]);
			if (regex.toString() !== command.trigger.toString())
				newValues.trigger = regex;
		}

		for (const field of ['response', 'runcmd', 'cooldown', 'mention', 'reply'])
			if (
				(msg.commandFlags[field] || msg.commandFlags[field] === false) &&
				msg.commandFlags[field] !== command[field]
			)
				newValues[field] = msg.commandFlags[field];

		if (msg.commandFlags.whitelist !== null) {
			let whitelist = null;
			if (msg.commandFlags.whitelist !== '')
				try {
					const whitelistInput = msg.commandFlags.whitelist.split(/\s+/);
					const usersMap = await twitch.helix.user.getMany(whitelistInput);
					whitelist = [];
					for (const login of whitelistInput) {
						const user = usersMap.get(login);
						if (!user)
							return {
								text: `user ${login} does not exist`,
								mention: true,
							};
						whitelist.push(user.id);
					}
				} catch (err) {
					logger.error('error getting users:', err);
					return { text: 'error getting whitelist users', mention: true };
				}
			newValues.whitelist = whitelist;
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
