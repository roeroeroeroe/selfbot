import logger from '../services/logger.js';
import gql from '../services/twitch/gql/index.js';
import utils from '../utils/index.js';

export default {
	name: 'follow',
	aliases: [],
	description: 'follow channel',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'channel to follow',
		},
		{
			name: 'enableNotifications',
			aliases: ['n', 'notifications'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'enable notifications for channel',
		},
	],
	execute: async msg => {
		let channelId;
		const input = msg.commandFlags.channel || msg.args[0];
		if (input) {
			try {
				const user = await gql.user.resolve(input);
				if (!user)
					return {
						text: `channel ${input} does not exist`,
						mention: true,
					};
				channelId = user.id;
			} catch (err) {
				logger.error(`error resolving user ${input}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else {
			channelId = msg.channelID;
		}

		try {
			const res = await gql.user.follow(
				channelId,
				msg.commandFlags.enableNotifications
			);
			if (res.followUser.error?.code)
				return {
					text: `error following user: ${res.followUser.error.code}`,
					mention: true,
				};
			const user = res.followUser.follow.user;
			return {
				text: `followed ${utils.getEffectiveName(user.login, user.displayName)} ${user.id}`,
				mention: true,
			};
		} catch (err) {
			logger.error('error following user:', err);
			return {
				text: 'error following user',
				mention: true,
			};
		}
	},
};
