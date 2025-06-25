import * as queries from './queries.js';
import gql from '../index.js';
import config from '../../../../config.json' with { type: 'json' };
import utils from '../../../../utils/index.js';

async function resolveUser(userLogin, userId) {
	let key, input;
	if (userLogin) {
		if (!utils.regex.patterns.username.test(userLogin)) return null;
		key = 'login';
		input = userLogin.toLowerCase();
	} else {
		if (!utils.regex.patterns.id.test(userId)) return null;
		key = 'id';
		input = userId;
	}
	const res = await gql.request({
		query: queries.RESOLVE_USER,
		variables: { login: userLogin, id: userId },
	});

	return res.data.user?.[key] === input ? res.data.user : null;
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

async function searchUsers(searchQuery) {
	const res = await gql.request({
		query: queries.SEARCH_USERS,
		variables: { searchQuery },
	});

	return res.data;
}

async function getSelfBanStatus(channelId) {
	const res = await gql.request({
		query: queries.GET_SELF_BAN_STATUS,
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
		variables.cursor = edges[edges.length - 1].cursor ?? null;
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

async function getFollows(userLogin, limit = 1000, order = 'ASC') {
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

	return { followEdges, followedGames, totalCount };
}

async function getFollowers(userLogin, limit = 1000, order = 'ASC') {
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

export default {
	queries,

	resolve: resolveUser,
	getUserWithBanReason,
	getMany,
	search: searchUsers,
	getSelfBanStatus,
	getSelfSubscriptionBenefits,
	getSelfFollowRelationship,
	getFollows,
	getFollowers,
	getRelationship,

	follow: followUser,
	unfollow: unfollowUser,
	updateDisplayName,
};
