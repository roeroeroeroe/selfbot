import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';

export default {
	name: 'follow',
	aliases: ['unfollow'],
	description: '(un)follow a channel (alias-driven)',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'channel to (un)follow (default: current channel)',
		},
		{
			name: 'enableNotifications',
			aliases: ['n', 'notifications'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'enable notifications (follow only)',
		},
	],
	execute: async msg => {
		let action;
		switch (msg.commandName) {
			case 'follow':
				action = 'follow';
				break;
			case 'unfollow':
				action = 'unfollow';
				break;
		}

		const input = msg.commandFlags.channel || msg.args[0] || msg.channelName;
		let user, followedAt, followAge;
		try {
			const res = await twitch.gql.user.getSelfFollowRelationship(input);
			if (!res?.user)
				return { text: `channel ${input} does not exist`, mention: true };
			user = res.user;
			user.name = utils.getEffectiveName(user.login, user.displayName);
			if (user.self?.follower?.followedAt) {
				followedAt = user.self.follower.followedAt;
				followAge = utils.duration.format(Date.now() - Date.parse(followedAt));
			}
		} catch (err) {
			logger.error(
				`error getting follow relationship with user ${input}:`,
				err
			);
			return {
				text: `error getting follow relationship with ${input}`,
				mention: true,
			};
		}

		switch (action) {
			case 'follow':
				if (followedAt)
					return {
						text: `already following ${user.name} (followed ${followAge} ago), aborting`,
						mention: true,
					};
				try {
					const res = await twitch.gql.user.follow(
						user.id,
						msg.commandFlags.enableNotifications
					);
					if (res.followUser.error?.code)
						return {
							text: `error following ${user.name}: ${res.followUser.error.code}`,
							mention: true,
						};
					return { text: `followed ${user.name} ${user.id}`, mention: true };
				} catch (err) {
					logger.error('error following user:', err);
					return { text: `error following ${user.name}`, mention: true };
				}
			case 'unfollow':
				if (!followedAt)
					return {
						text: `not following ${user.name}, aborting`,
						mention: true,
					};
				try {
					await twitch.gql.user.unfollow(user.id);
					return {
						text: `unfollowed ${user.name} ${user.id} (follow age: ${followAge})`,
						mention: true,
					};
				} catch (err) {
					logger.error('error unfollowing user:', err);
					return { text: `error unfollowing ${user.name}`, mention: true };
				}
		}
	},
};
