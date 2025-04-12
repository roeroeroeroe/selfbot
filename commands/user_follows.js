import logger from '../services/logger.js';
import { getFollows } from '../services/twitch/gql.js';
import { getEffectiveName } from '../utils/utils.js';
import { createPaste } from '../services/hastebin.js';
import {
	formatDate,
	joinResponseParts,
	toPlural,
	alignLines,
} from '../utils/formatters.js';

export default {
	name: 'follows',
	aliases: ['followslist', 'listfollows'],
	description: "get list of user's follows",
	unsafe: false,
	flags: [
		{
			name: 'user',
			aliases: ['u', 'user'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'target user (default: sender)',
		},
		{
			name: 'limit',
			aliases: ['l', 'limit'],
			type: 'number',
			defaultValue: 1000,
			required: false,
			description:
				'stop after getting N follows (default: 1000, min: 100, max: 50000)',
			validator: v => v >= 100 && v <= 50000,
		},
		{
			name: 'sort',
			aliases: ['s', 'sort-by'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'sort list by [viewers|followers] (default: none)',
			validator: v => v === 'viewers' || v === 'followers',
		},
		{
			name: 'order',
			aliases: ['o', 'order'],
			type: 'string',
			defaultValue: 'ASC',
			required: false,
			description: 'order [ASC|DESC] (default: ASC)',
			validator: v => v === 'ASC' || v === 'DESC',
		},
	],
	execute: async msg => {
		const userLogin = (
			msg.commandFlags.user ||
			msg.args[0] ||
			msg.senderUsername
		).toLowerCase();
		let result;
		try {
			result = await getFollows(
				userLogin,
				msg.commandFlags.limit,
				msg.commandFlags.order
			);
		} catch (err) {
			logger.error('error getting follows:', err);
			return { text: 'error getting follows', mention: true };
		}

		if (!result.totalCount && !result.followedGames.length)
			return { text: `${userLogin} doesn't follow anyone`, mention: true };

		const list = [];
		const messageParts = [];
		if (result.followEdges.length) {
			const formattedFollowedChannelsCount = `${result.totalCount} ${toPlural(result.totalCount, 'channel')}`;
			messageParts.push(formattedFollowedChannelsCount);
			list.push(`${formattedFollowedChannelsCount}:\n`);

			if (msg.commandFlags.sort)
				if (msg.commandFlags.sort === 'viewers')
					result.followEdges.sort((a, b) => {
						const av = a.node.stream?.viewersCount || 0;
						const bv = b.node.stream?.viewersCount || 0;
						return av > bv ? -1 : av < bv ? 1 : 0;
					});
				else
					result.followEdges.sort((a, b) => {
						const af = a.node.followers?.totalCount || 0;
						const bf = b.node.followers?.totalCount || 0;
						return af > bf ? -1 : af < bf ? 1 : 0;
					});

			for (const e of result.followEdges) {
				const parts = [getEffectiveName(e.node.login, e.node.displayName)];

				const followers = e.node.followers?.totalCount;
				if (followers) {
					parts.push(`${followers} ${toPlural(followers, 'follower')}`);
				}
				if (e.node.stream) {
					const viewers = e.node.stream.viewersCount || 0;
					parts.push(`live (${viewers} ${toPlural(viewers, 'viewer')})`);
				}

				parts[parts.length - 1] +=
					`__ALIGN__followed at: ${formatDate(e.followedAt)}`;

				if (e.notificationSettings.isEnabled) {
					parts.push('');
				}

				list.push(joinResponseParts(parts));
			}
		}

		if (result.followedGames.length) {
			const formattedFollowedGamesCount = `${result.followedGames.length} ${toPlural(result.followedGames.length, 'category', 'categories')}`;
			messageParts.push(formattedFollowedGamesCount);
			list.push(`${list.length ? '\n' : ''}${formattedFollowedGamesCount}:\n`);
			for (const g of result.followedGames) list.push(g);
		}

		try {
			const link = await createPaste(alignLines(list), true);
			messageParts.push(link);
			return { text: joinResponseParts(messageParts), mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			messageParts.push('error creating paste');
			return { text: joinResponseParts(messageParts), mention: true };
		}
	},
};
