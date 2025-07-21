import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const NOTIFICATIONS_SYMBOL = '🔔';

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

export default {
	name: 'follows',
	// prettier-ignore
	aliases: [
		'listfollows',
		'followers', 'listfollowers',
	],
	description: "list user's follow(er)s (alias-driven)",
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'user',
			short: 'u',
			long: 'user',
			type: 'username',
			defaultValue: null,
			required: false,
			description: 'target user (default: sender)',
		},
		{
			name: 'raw',
			short: 'r',
			long: 'raw',
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'print usernames only',
		},
		{
			name: 'limit',
			short: 'l',
			long: 'limit',
			type: 'int',
			defaultValue: twitch.gql.DEFAULT_PAGINATION_LIMIT,
			required: false,
			description:
				'stop after getting N follow(er)s ' +
				`(default: ${twitch.gql.DEFAULT_PAGINATION_LIMIT}, ` +
				`min: ${twitch.gql.DEFAULT_PAGE_SIZE}, ` +
				`max: ${twitch.gql.MAX_PAGINATION_LIMIT})`,
			validator: v =>
				v >= twitch.gql.DEFAULT_PAGE_SIZE &&
				v <= twitch.gql.MAX_PAGINATION_LIMIT,
		},
		{
			name: 'sort',
			short: 's',
			long: 'sort',
			type: 'string',
			defaultValue: null,
			required: false,
			description: 'sort list by [viewers|followers] (default: none)',
			validator: v => v === 'viewers' || v === 'followers',
		},
		{
			name: 'order',
			short: 'o',
			long: 'order',
			type: 'string',
			defaultValue: 'ASC',
			required: false,
			description: 'order [ASC|DESC] (default: ASC)',
			validator: v => v === 'ASC' || v === 'DESC',
		},
	],
	execute: async msg => {
		let action;
		switch (msg.commandName) {
			case 'follows':
			case 'listfollows':
				action = 'follows';
				break;
			case 'followers':
			case 'listfollowers':
				action = 'followers';
		}

		const { limit, order, sort, raw } = msg.commandFlags;
		const userLogin = utils.resolveLoginInput(
			msg.commandFlags.user,
			msg.args[0],
			{ fallback: msg.senderUsername }
		);

		let result,
			countStr,
			edges,
			includeCategories = false;
		const responseParts = [];

		switch (action) {
			case 'follows':
				result = await twitch.gql.user.getFollows(userLogin, limit, order);
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
				result = await twitch.gql.user.getFollowers(userLogin, limit, order);
				if (!result.totalCount)
					return { text: `${userLogin} has 0 followers`, mention: true };
				countStr = `${result.totalCount} ${utils.format.plural(result.totalCount, 'follower')}`;
				edges = result.followerEdges;
		}

		responseParts.push(countStr);
		if (edges.length > limit) edges.length = limit;

		let header = countStr;
		if (limit < result.totalCount)
			header += ` (${order === 'ASC' ? 'first' : 'last'} ${limit})`;
		header += ':\n';

		const list = [];
		if (!raw && edges.length) list.push(header);
		for (const line of processEdges(applySort(edges, sort), raw))
			list.push(line);

		if (includeCategories) {
			const categoriesCount = result.followedGames.length;
			const categoriesCountStr =
				`${categoriesCount} ` +
				utils.format.plural(categoriesCount, 'category', 'categories');
			responseParts.push(categoriesCountStr);
			list.push(`${list.length ? '\n' : ''}${categoriesCountStr}:\n`);
			for (const c of result.followedGames) list.push(c);
		}

		// in case all edges are missing node.login
		if (list.length)
			try {
				const link = await paste.create(utils.format.align(list));
				responseParts.push(link);
			} catch (err) {
				logger.error('error creating paste:', err);
				responseParts.push('error creating paste');
			}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

function processEdges(edges, raw) {
	const lines = [];
	if (raw) {
		for (const e of edges) lines.push(e.node.login);
		return lines;
	}

	for (const e of edges) {
		const parts = [utils.pickName(e.node.login, e.node.displayName)];
		const followers = e.node.followers?.totalCount;
		if (followers)
			parts.push(`${followers} ${utils.format.plural(followers, 'follower')}`);
		if (e.node.stream) {
			const viewers = e.node.stream.viewersCount || 0;
			parts.push(`live (${viewers} ${utils.format.plural(viewers, 'viewer')})`);
		}
		parts[parts.length - 1] +=
			`${alignSep}followed at: ${utils.date.format(e.followedAt)}`;
		if (e.notificationSettings.isEnabled) parts.push(NOTIFICATIONS_SYMBOL);

		lines.push(utils.format.join(parts));
	}

	return lines;
}

function applySort(edges, sort) {
	switch (sort) {
		case 'viewers':
			return edges.sort(
				(a, b) =>
					(b.node.stream?.viewersCount || 0) -
					(a.node.stream?.viewersCount || 0)
			);
		case 'followers':
			return edges.sort(
				(a, b) =>
					(b.node.followers?.totalCount || 0) -
					(a.node.followers?.totalCount || 0)
			);
		default:
			return edges;
	}
}
