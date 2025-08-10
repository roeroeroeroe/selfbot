import * as queries from './queries.js';
import * as constants from './constants.js';
import gql from '../index.js';
import config from '../../../../config.json' with { type: 'json' };
import utils from '../../../../utils/index.js';

async function resolveUser(userLogin, userId) {
	const res = await gql.request({
		query: queries.RESOLVE_USER,
		variables: { login: userLogin, id: userId },
	});

	return res.data.user;
}

async function getUserWithBanReason(userLogin, userId) {
	const res = await gql.request({
		query: userId
			? queries.GET_USER_BY_ID_WITH_BAN_REASON
			: queries.GET_USER_BY_LOGIN_WITH_BAN_REASON,
		variables: { login: userLogin, id: userId },
	});

	return res.data;
}

async function getMany(userLogins, userIds) {
	const isIdLookup = userIds && userIds.length;
	let inputArray = isIdLookup ? userIds : userLogins;
	if (!Array.isArray(inputArray)) inputArray = [inputArray];
	let query, mapKey;
	if (isIdLookup) {
		query = queries.GET_USERS_BY_IDS;
		mapKey = 'id';
	} else {
		query = queries.GET_USERS_BY_LOGINS;
		mapKey = 'login';
	}
	const chunks = utils.splitArray(
		inputArray,
		gql.MAX_OPERATIONS_PER_REQUEST * 3
	);
	const usersMap = new Map();
	for (const chunk of chunks) {
		const responses = await gql.request(
			utils.splitArray(chunk, gql.MAX_OPERATIONS_PER_REQUEST).map(b => ({
				query,
				variables: { input: b },
			}))
		);

		for (let i = 0; i < responses.length; i++) {
			const users = responses[i].data?.users;
			if (!users?.length) continue;
			for (let j = 0, u; j < users.length; j++)
				if ((u = users[j])?.[mapKey]) usersMap.set(u[mapKey], u);
		}
	}

	return usersMap;
}

async function searchUsers(searchQuery, getAll = false) {
	const users = [];
	const initialRes = await gql.request({
		query: queries.SEARCH_USERS,
		variables: { searchQuery },
	});

	const { totalCount, edges: initialEdges } = initialRes.data.searchUsers;
	if (!initialEdges.length) return users;

	for (let i = 0; i < initialEdges.length; users.push(initialEdges[i++].node));
	if (!getAll) return users;

	const maxTotal = Math.min(totalCount, constants.SEARCH_USERS_MAX_RESULTS);
	const pageSize = gql.DEFAULT_PAGE_SIZE;
	if (maxTotal <= pageSize) return users;

	const cursors = [];
	for (let offset = pageSize; offset < maxTotal; offset += pageSize)
		cursors.push(btoa(String(offset)));

	for (const batch of utils.splitArray(
		cursors,
		gql.MAX_OPERATIONS_PER_REQUEST
	)) {
		const responses = await gql.request(
			batch.map(cursor => ({
				query: queries.SEARCH_USERS,
				variables: { searchQuery, cursor },
			}))
		);

		for (let i = 0; i < responses.length; i++) {
			const edges = responses[i].data?.searchUsers?.edges;
			if (!edges?.length) continue;
			for (let j = 0; j < edges.length; users.push(edges[j++].node));
		}
	}

	return users;
}

async function getSelfChatColor() {
	const res = await gql.request({ query: queries.GET_SELF_CHAT_COLOR });

	return res.data?.currentUser?.chatColor ?? null;
}

async function getSelfEmail() {
	const res = await gql.request({ query: queries.GET_SELF_EMAIL });

	return res.data?.currentUser?.email;
}

async function getSelfHasPrimeOrTurbo() {
	const res = await gql.request({ query: queries.GET_SELF_HAS_PRIME_OR_TURBO });

	const currentUser = res.data?.currentUser;
	if (!currentUser) return false;
	return currentUser.hasPrime || currentUser.hasTurbo;
}

async function getSelfStrikeStatus(channelId) {
	const res = await gql.request({
		query: queries.GET_SELF_STRIKE_STATUS,
		variables: { channelId, userId: config.bot.id },
	});

	return res.data;
}

async function getSelfSubscriptionBenefits() {
	const subscriptionBenefitEdges = [];
	const variables = { cursor: null };
	do {
		const res = await gql.request({
			query: queries.GET_SELF_SUBSCRIPTION_BENEFITS,
			variables,
		});

		const edges = res.data?.currentUser.subscriptionBenefits?.edges ?? [];
		if (!edges.length) break;

		for (const e of edges)
			if (e.node?.user?.login) subscriptionBenefitEdges.push(e);
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor);

	return subscriptionBenefitEdges;
}

async function getSelfFollowRelationship(channelLogin, channelId) {
	const res = await gql.request({
		query: queries.GET_SELF_FOLLOW_RELATIONSHIP,
		variables: { login: channelLogin, id: channelId },
	});

	return res.data;
}

async function getFollows(
	userLogin,
	limit = gql.DEFAULT_PAGINATION_LIMIT,
	order = 'ASC'
) {
	if (limit > gql.MAX_PAGINATION_LIMIT) limit = gql.MAX_PAGINATION_LIMIT;
	const followEdges = [],
		followedGames = [];
	let totalCount, res;
	const variables = { login: userLogin, cursor: null, order };

	do {
		res = await gql.request({ query: queries.GET_FOLLOWS, variables });

		if (!res.data.user) break;
		const edges = res.data.user.follows?.edges ?? [];
		if (!edges.length) break;

		for (const e of edges) if (e.node?.login) followEdges.push(e);
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor && followEdges.length < limit);

	const user = res.data.user;
	if (user) {
		if (user.follows)
			totalCount = user.follows.totalCount || followEdges.length;
		if (user.followedGames?.nodes.length)
			for (const n of user.followedGames.nodes)
				followedGames.push(n.displayName);
	}

	return {
		followEdges,
		followedGames,
		totalCount: totalCount ?? followEdges.length,
	};
}

async function getFollowers(
	userLogin,
	limit = gql.DEFAULT_PAGINATION_LIMIT,
	order = 'ASC'
) {
	if (limit > gql.MAX_PAGINATION_LIMIT) limit = gql.MAX_PAGINATION_LIMIT;
	const followerEdges = [];
	let totalCount, res;
	const variables = { login: userLogin, cursor: null, order };

	do {
		res = await gql.request({ query: queries.GET_FOLLOWERS, variables });

		if (!res.data.user) break;
		const edges = res.data.user.followers?.edges ?? [];
		if (!edges.length) break;

		for (const e of edges) if (e.node?.login) followerEdges.push(e);
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor && followerEdges.length < limit);

	const user = res.data.user;
	if (user?.followers)
		totalCount = user.followers.totalCount || followerEdges.length;

	return { followerEdges, totalCount };
}

async function getRelationship(userLogin, channelId) {
	const res = await gql.request({
		query: queries.GET_RELATIONSHIP,
		variables: {
			userLogin,
			channelId,
			channelIdString: channelId,
		},
	});

	return res.data;
}

async function followUser(userId, enableNotifications = false) {
	const res = await gql.request({
		query: queries.FOLLOW_USER,
		variables: {
			input: {
				disableNotifications: !enableNotifications,
				targetID: userId,
			},
		},
	});

	return res.data;
}

async function unfollowUser(userId) {
	const res = await gql.request({
		query: queries.UNFOLLOW_USER,
		variables: { input: { targetID: userId } },
	});

	return res.data;
}

async function updateDisplayName(newDisplayName) {
	const res = await gql.request({
		query: queries.UPDATE_DISPLAY_NAME,
		variables: {
			input: { displayName: newDisplayName, userID: config.bot.id },
		},
	});

	return res.data;
}

async function updateChatColor(newColor) {
	const res = await gql.request({
		query: queries.UPDATE_CHAT_COLOR,
		variables: { input: { color: newColor } },
	});

	return res.data;
}

export default {
	...constants,
	queries,

	resolve: resolveUser,
	getUserWithBanReason,
	getMany,
	search: searchUsers,
	getSelfChatColor,
	getSelfEmail,
	getSelfHasPrimeOrTurbo,
	getSelfStrikeStatus,
	getSelfSubscriptionBenefits,
	getSelfFollowRelationship,
	getFollows,
	getFollowers,
	getRelationship,

	follow: followUser,
	unfollow: unfollowUser,
	updateDisplayName,
	updateChatColor,
};
