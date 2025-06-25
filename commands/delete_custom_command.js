import logger from '../services/logger.js';
import customCommands from '../services/custom_commands.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'deletecommand',
	aliases: ['delcmd', 'cmddel'],
	description: 'delete an existing custom command',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [['name', 'channel', 'global']],
	flags: [
		{
			name: 'name',
			short: 'n',
			long: 'name',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'command to delete',
		},
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			defaultValue: null,
			required: false,
			description: 'delete all commands in the specified channel',
		},
		{
			name: 'global',
			short: 'g',
			long: 'global',
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'delete all global commands',
		},
	],
	execute: async msg => {
		if (
			!msg.commandFlags.name &&
			!msg.commandFlags.channel &&
			!msg.commandFlags.global &&
			!msg.args.length
		)
			return { text: 'you must specify a command to delete', mention: true };
		const commandsToDelete = [];
		if (msg.commandFlags.name) {
			const c = customCommands.getCommandByName(msg.commandFlags.name);
			if (c) commandsToDelete.push(c);
		} else if (msg.commandFlags.channel) {
			try {
				const user = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				for (const c of customCommands.getChannelCommands(user.id))
					commandsToDelete.push(c);
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else if (msg.commandFlags.global) {
			for (const c of customCommands.getGlobalCommands())
				commandsToDelete.push(c);
		} else {
			for (const arg of msg.args) {
				const c = customCommands.getCommandByName(arg);
				if (c) commandsToDelete.push(c);
			}
		}

		if (!commandsToDelete.length)
			return { text: 'none of the provided commands exist', mention: true };

		for (const c of commandsToDelete) {
			try {
				await customCommands.delete(c.name, c.channel_id);
			} catch (err) {
				logger.error(`error deleting command ${c.name}:`, err);
				return {
					text: `error deleting command ${c.name}: ${err.message}`,
					mention: true,
				};
			}
		}

		return {
			text:
				commandsToDelete.length === 1
					? `successfully deleted command ${commandsToDelete[0].name}`
					: `successfully deleted ${commandsToDelete.length} commands`,
			mention: true,
		};
	},
};
