import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'notifyresub',
	aliases: ['nr', 'resub'],
	description: 'send resub notification',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			required: true,
			defaultValue: null,
			description: 'channel to send the notification in',
		},
		{
			name: 'includeStreak',
			short: 'i',
			long: 'include-streak',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'include months streak in the notification',
		},
	],
	execute: async msg => {
		let channelLogin;
		try {
			const user = await twitch.gql.user.resolve(msg.commandFlags.channel);
			if (!user)
				return {
					text: `channel ${msg.commandFlags.channel} does not exist`,
					mention: true,
				};
			channelLogin = user.login;
		} catch (err) {
			logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
			return { text: 'error resolving channel', mention: true };
		}

		try {
			const res = await twitch.gql.channel.shareResubscription(
				channelLogin,
				msg.commandFlags.includeStreak,
				msg.args.join(' ')
			);

			return {
				text: res.useChatNotificationToken?.isSuccess
					? 'notification sent'
					: 'error sending resub notification',
				mention: true,
			};
		} catch (err) {
			logger.error('error sending resub notification:', err);
			return { text: 'error sending resub notification', mention: true };
		}
	},
};
