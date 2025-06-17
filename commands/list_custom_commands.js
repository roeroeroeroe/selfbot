import logger from '../services/logger.js';
import customCommands from '../services/custom_commands.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'listcommands',
	aliases: ['listcmd', 'cmdlist'],
	description: 'list custom commands',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [['channel', 'global', 'all']],
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			defaultValue: null,
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
				const user = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				commands = customCommands.getChannelCommands(user.id);
				noCommandsMessage = `no commands found for #${utils.pickName(user.login, user.displayName)}`;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else if (msg.commandFlags.global) {
			commands = customCommands.getGlobalCommands();
			noCommandsMessage = 'no global commands found';
		} else if (msg.commandFlags.all) {
			commands = customCommands.getAllCommands();
			noCommandsMessage = 'no commands found';
		} else {
			commands = customCommands.getChannelCommands(msg.channelID);
			noCommandsMessage = `no commands found for #${msg.channelName}`;
		}

		if (!commands.length) return { text: noCommandsMessage, mention: true };

		try {
			const link = await paste.create(
				JSON.stringify(
					commands.map(c => ({ ...c, trigger: String(c.trigger) })),
					null,
					2
				)
			);
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	},
};
