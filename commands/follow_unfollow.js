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
			short: 'c',
			long: 'channel',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'channel to (un)follow (default: current channel)',
		},
		{
			name: 'enableNotifications',
			short: 'n',
			long: 'notifications',
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
		}

		const channelInput = utils.resolveLoginInput(
			msg.commandFlags.channel,
			msg.args[0],
			{ fallback: msg.channelName }
		);
		let channel, followedAt, followAge;
		try {
			const res = await twitch.gql.user.getSelfFollowRelationship(channelInput);
			if (!res?.user)
				return {
					text: `channel ${channelInput} does not exist`,
					mention: true,
				};
			channel = res.user;
			channel.name = utils.pickName(channel.login, channel.displayName);
			if (channel.self?.follower?.followedAt) {
				followedAt = channel.self.follower.followedAt;
				followAge = utils.duration.format(Date.now() - Date.parse(followedAt));
			}
		} catch (err) {
			logger.error(
				`error getting follow relationship with user ${channelInput}:`,
				err
			);
			return {
				text: `error getting follow relationship with ${channelInput}`,
				mention: true,
			};
		}

		switch (action) {
			case 'follow':
				if (followedAt)
					return {
						text: `already following ${channel.name} (followed ${followAge} ago), aborting`,
						mention: true,
					};
				try {
					const res = await twitch.gql.user.follow(
						channel.id,
						msg.commandFlags.enableNotifications
					);
					if (res.followUser.error?.code)
						return {
							text: `error following ${channel.name}: ${res.followUser.error.code}`,
							mention: true,
						};
					return { text: `followed ${channel.name} ${channel.id}`, mention: true };
				} catch (err) {
					logger.error('error following user:', err);
					return { text: `error following ${channel.name}`, mention: true };
				}
			case 'unfollow':
				if (!followedAt)
					return {
						text: `not following ${channel.name}, aborting`,
						mention: true,
					};
				try {
					await twitch.gql.user.unfollow(channel.id);
					return {
						text: `unfollowed ${channel.name} ${channel.id} (follow age: ${followAge})`,
						mention: true,
					};
				} catch (err) {
					logger.error('error unfollowing user:', err);
					return { text: `error unfollowing ${channel.name}`, mention: true };
				}
		}
	},
};
