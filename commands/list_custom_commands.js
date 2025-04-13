import logger from '../services/logger.js';
import customCommands from '../services/custom_commands.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';
import { resolveUser } from '../services/twitch/gql.js';

export default {
	name: 'listcommands',
	aliases: ['listcmd', 'cmdlist'],
	description: 'list custom commands',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'list commands for channel',
		},
		{
			name: 'global',
			aliases: ['g', 'global'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'list global commands',
		},
		{
			name: 'all',
			aliases: ['a', 'all'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'list all commands',
		},
	],
	execute: async msg => {
		let commands = [],
			noCommandsMessage = '';
		if (msg.commandFlags.channel) {
			try {
				const user = await resolveUser(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				commands = customCommands.getChannelCommands(user.id);
				noCommandsMessage = `no commands found for channel ${utils.getEffectiveName(user.login, user.displayName)}`;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return {
					text: `error resolving channel ${msg.commandFlags.channel}`,
					mention: true,
				};
			}
		} else if (msg.commandFlags.global) {
			commands = customCommands.globalCommands;
			noCommandsMessage = 'no global commands found';
		} else if (msg.commandFlags.all) {
			commands = customCommands.getAllCommands();
			noCommandsMessage = 'no commands found';
		} else {
			commands = customCommands.getChannelCommands(msg.channelID);
			noCommandsMessage = `no commands found for channel ${msg.channelName}`;
		}

		if (!commands.length) return { text: noCommandsMessage, mention: true };

		try {
			const link = await hastebin.create(
				JSON.stringify(
					commands.map(c => ({ ...c, trigger: String(c.trigger) })),
					null,
					2
				),
				true
			);
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	},
};
