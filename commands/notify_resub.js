import logger from '../services/logger.js';
import gql from '../services/twitch/gql/index.js';

export default {
	name: 'notifyresub',
	aliases: ['nr', 'resub'],
	description: 'send resub notification',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			required: true,
			defaultValue: '',
			description: 'channel to send the notification in',
		},
		{
			name: 'includeStreak',
			aliases: ['i', 'include-streak'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'include months streak in the notification',
		},
	],
	execute: async msg => {
		let channelLogin = msg.channelName;
		if (msg.commandFlags.channel) {
			try {
				const user = await gql.user.resolve(msg.commandFlags.channel);
				if (!user)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				channelLogin = user.login;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return {
					text: `error resolving channel ${msg.commandFlags.channel}`,
					mention: true,
				};
			}
		}

		try {
			const res = await gql.channel.shareResubscription(
				channelLogin,
				msg.commandFlags.includeStreak,
				msg.args.join(' ')
			);

			return {
				text: res.userChatNotificationToken?.isSuccess
					? 'notification sent'
					: 'error sending resub notification',
				mention: true,
			};
		} catch (err) {
			logger.error('error sending resub notification:', err);
			return {
				text: 'error sending resub notification',
				mention: true,
			};
		}
	},
};
