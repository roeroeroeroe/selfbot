import logger from '../services/logger.js';
import utils from '../utils/index.js';
import {
	selfFollowRelationship,
	unfollowUser,
} from '../services/twitch/gql.js';

export default {
	name: 'unfollow',
	aliases: [],
	description: 'unfollow channel',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'channel to unfollow',
		},
	],
	execute: async msg => {
		const channelName =
			msg.commandFlags.channel || msg.args[0] || msg.channelName;

		let user;
		try {
			const res = await selfFollowRelationship(channelName);
			if (!res?.user)
				return {
					text: `channel ${channelName} does not exist`,
					mention: true,
				};
			if (!res.user.self.follower?.followedAt)
				return {
					text: `not following ${utils.getEffectiveName(res.user.login, res.user.displayName)}, aborting`,
					mention: true,
				};
			user = res.user;
		} catch (err) {
			logger.error(
				`error getting follow relationship with user ${channelName}:`,
				err
			);
			return {
				text: `error resolving channel ${channelName}`,
				mention: true,
			};
		}

		try {
			await unfollowUser(user.id);

			const followAge = utils.duration.format(
				Date.now() - Date.parse(user.self.follower.followedAt)
			);
			return {
				text: `unfollowed ${utils.getEffectiveName(user.login, user.displayName)} ${user.id} (follow age: ${followAge})`,
				mention: true,
			};
		} catch (err) {
			logger.error('error unfollowing user:', err);
			return {
				text: 'error unfollowing user',
				mention: true,
			};
		}
	},
};
