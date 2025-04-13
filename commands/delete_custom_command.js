import logger from '../services/logger.js';
import customCommands from '../services/custom_commands.js';
import utils from '../utils/index.js';
import { resolveUser } from '../services/twitch/gql.js';

export default {
	name: 'deletecommand',
	aliases: ['delcmd', 'cmddel'],
	description: 'remove an existing custom command',
	unsafe: false,
	flags: [
		{
			name: 'name',
			aliases: ['n', 'name'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'command to delete',
		},
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'delete all commands from a channel',
		},
		{
			name: 'global',
			aliases: ['g', 'global'],
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
		let commandsToDelete = [];
		if (msg.commandFlags.name) {
			const c = customCommands.getCommandByName(msg.commandFlags.name);
			if (c) commandsToDelete.push(c);
		} else if (msg.commandFlags.channel) {
			try {
				const user = await resolveUser(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				for (const c of customCommands.getChannelCommands(user.id))
					commandsToDelete.push(c);
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return {
					text: `error resolving channel ${msg.commandFlags.channel}`,
					mention: true,
				};
			}
		} else if (msg.commandFlags.global) {
			for (const c of customCommands.globalCommands) commandsToDelete.push(c);
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
			text: `successfully deleted ${utils.format.plural(commandsToDelete.length, 'command')}`,
			mention: true,
		};
	},
};
