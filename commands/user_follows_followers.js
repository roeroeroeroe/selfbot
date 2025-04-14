import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';
import gql from '../services/twitch/gql/index.js';

export default {
	name: 'follows',
	// prettier-ignore
	aliases: [
		'listfollows',
		'followers', 'listfollowers',
	],
	description: "list user's follow(er)s (alias-driven)",
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
			name: 'raw',
			aliases: ['r', 'raw'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'print usernames only',
		},
		{
			name: 'limit',
			aliases: ['l', 'limit'],
			type: 'number',
			defaultValue: 1000,
			required: false,
			description:
				'stop after getting N follow(er)s (default: 1000, min: 100, max: 50000)',
			validator: v => v >= 100 && v <= 50000,
		},
		{
			name: 'sort',
			aliases: ['s', 'sort'],
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

		const { limit, order, sort, raw } = msg.commandFlags;

		let result,
			countStr,
			edges,
			includeCategories = false;
		const messageParts = [];

		switch (msg.commandName) {
			case 'follows':
			case 'listfollows':
				result = await gql.user.getFollows(userLogin, limit, order);
				if (
					(raw && !result.followEdges.length) ||
					(!raw && !result.totalCount && !result.followedGames.length)
				)
					return { text: `${userLogin} doesn't follow anyone`, mention: true };

				countStr = `${result.totalCount} ${utils.format.plural(result.totalCount, 'channel')}`;
				edges = result.followEdges;
				includeCategories = !raw && result.followedGames.length;
				break;
			case 'followers':
			case 'listfollowers':
				result = await gql.user.getFollowers(userLogin, limit, order);
				if (!result.totalCount)
					return { text: `${userLogin} has 0 followers`, mention: true };

				countStr = `${result.totalCount} ${utils.format.plural(result.totalCount, 'follower')}`;
				edges = result.followerEdges;
				break;
		}

		messageParts.push(countStr);
		if (edges.length > limit) edges = edges.slice(0, limit);

		let header = countStr;
		if (!raw && limit !== result.totalCount)
			header += ` (${order === 'ASC' ? 'first' : 'last'} ${limit})`;
		header += ':\n';

		const list = [];
		if (!raw && edges.length) list.push(header);
		for (const line of processEdges(sort ? applySort(edges, sort) : edges, raw))
			list.push(line);

		if (includeCategories) {
			const categoriesCountStr = `${result.followedGames.length} ${utils.format.plural(result.followedGames.length, 'category', 'categories')}`;
			messageParts.push(categoriesCountStr);
			list.push(`${list.length ? '\n' : ''}${categoriesCountStr}:\n`);
			for (const c of result.followedGames) list.push(c);
		}

		try {
			// in case all edges are missing node.login
			if (list.length) {
				const link = await hastebin.create(utils.format.align(list));
				messageParts.push(link);
			}
			return { text: utils.format.join(messageParts), mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			messageParts.push('error creating paste');
			return { text: utils.format.join(messageParts), mention: true };
		}
	},
};

function processEdges(edges, raw) {
	const lines = [];
	if (raw) {
		for (const e of edges) lines.push(e.node.login);
		return lines;
	}

	for (const e of edges) {
		const parts = [utils.getEffectiveName(e.node.login, e.node.displayName)];
		const followers = e.node.followers?.totalCount;
		if (followers) {
			parts.push(`${followers} ${utils.format.plural(followers, 'follower')}`);
		}
		if (e.node.stream) {
			const viewers = e.node.stream.viewersCount || 0;
			parts.push(`live (${viewers} ${utils.format.plural(viewers, 'viewer')})`);
		}
		parts[parts.length - 1] +=
			`__ALIGN__followed at: ${utils.date.format(e.followedAt)}`;
		if (e.notificationSettings.isEnabled) parts.push('');

		lines.push(utils.format.join(parts));
	}

	return lines;
}

function applySort(edges, sort) {
	switch (sort) {
		case 'viewers':
			return edges.sort((a, b) => {
				const av = a.node.stream?.viewersCount || 0;
				const bv = b.node.stream?.viewersCount || 0;
				return av > bv ? -1 : av < bv ? 1 : 0;
			});
		case 'followers':
			return edges.sort((a, b) => {
				const af = a.node.followers?.totalCount || 0;
				const bf = b.node.followers?.totalCount || 0;
				return af > bf ? -1 : af < bf ? 1 : 0;
			});
		default:
			return edges;
	}
}
