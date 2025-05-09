import logger from '../services/logger.js';
import db from '../services/db.js';
import commands from '../services/commands.js';
import customCommands from '../services/custom_commands.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'createcommand',
	aliases: ['addcmd', 'cmdadd'],
	description: 'create a new custom command',
	unsafe: false,
	flags: [
		{
			name: 'name',
			aliases: ['n', 'name'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'command name',
		},
		{
			name: 'channel',
			aliases: [null, 'channel'],
			type: 'username',
			defaultValue: '',
			required: false,
			description:
				'channel in which the command will be active (default: current channel)',
		},
		{
			name: 'trigger',
			aliases: [null, 'trigger'],
			type: 'string',
			defaultValue: '',
			required: true,
			description: 'command trigger',
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
			description: 'command response',
		},
		{
			name: 'runcmd',
			aliases: ['c', 'command'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'regular command to run',
			validator: v => commands.has(v),
		},
		{
			name: 'whitelist',
			aliases: ['w', 'whitelist'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'list of whitelisted users, e.g., "user1 user2"',
		},
		{
			name: 'cooldown',
			aliases: [null, 'cooldown'],
			type: 'duration',
			defaultValue: null,
			required: false,
			description: 'per-user cooldown',
		},
		{
			name: 'reply',
			aliases: [null, 'reply'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'reply to invoking user when sending response',
		},
		{
			name: 'mention',
			aliases: [null, 'mention'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'mention invoking user when sending response',
		},
		{
			name: 'global',
			aliases: ['g', 'global'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'command will be active in all channels',
		},
	],
	execute: async msg => {
		const channel = { id: null, login: null };
		if (!msg.commandFlags.global) {
			if (!msg.commandFlags.channel) {
				channel.id = msg.channelID;
				channel.login = msg.channelName;
			} else {
				try {
					const user = await twitch.gql.user.resolve(msg.commandFlags.channel);
					if (!user)
						return {
							text: `channel ${msg.commandFlags.channel} does not exist`,
							mention: true,
						};
					if (!(await db.channel.get(user.id)))
						return { text: `unknown channel: ${user.login}`, mention: true };
					channel.id = user.id;
					channel.login = user.login;
				} catch (err) {
					logger.error(
						`error resolving user ${msg.commandFlags.channel}:`,
						err
					);
					return { text: 'error resolving channel', mention: true };
				}
			}
		}
		if (!msg.commandFlags.runcmd && !msg.commandFlags.response)
			return {
				text: 'you must provide a response or regular command',
				mention: true,
			};

		const commandName =
			msg.commandFlags.name || `${channel.login || 'global'}_${Date.now()}`;

		if (customCommands.getCommandByName(commandName))
			return { text: `command ${commandName} already exists`, mention: true };

		let whitelist = null;
		if (msg.commandFlags.whitelist) {
			try {
				const whitelistInput = msg.commandFlags.whitelist.split(/\s+/);
				const usersMap = await twitch.helix.user.getMany(whitelistInput);
				whitelist = [];
				for (const login of whitelistInput) {
					const user = usersMap.get(login);
					if (!user)
						return { text: `user ${login} does not exist`, mention: true };
					whitelist.push(user.id);
				}
			} catch (err) {
				logger.error('error getting whitelist users:', err);
				return { text: 'error getting whitelist users', mention: true };
			}
		}
		try {
			await customCommands.add({
				name: commandName,
				channel_id: channel.id,
				trigger: msg.commandFlags.trigger,
				response: msg.commandFlags.response,
				runcmd: msg.commandFlags.runcmd,
				whitelist,
				cooldown: msg.commandFlags.cooldown,
				reply: msg.commandFlags.reply,
				mention: msg.commandFlags.mention,
			});
		} catch (err) {
			logger.error(`error creating command ${commandName}:`, err);
			return {
				text: `error creating command ${commandName}: ${err.message}`,
				mention: true,
			};
		}

		return {
			text: `command ${commandName} has been successfully created`,
			mention: true,
		};
	},
};
