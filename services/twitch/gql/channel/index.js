import * as queries from './queries.js';
import gql from '../index.js';
import utils from '../../../../utils/index.js';
import config from '../../../../config.json' with { type: 'json' };

async function getMods(channelLogin, limit = 1000) {
	const modEdges = [];
	const variables = { login: channelLogin, cursor: null };
	do {
		const res = await gql.request({ query: queries.GET_MODS, variables });

		if (!res.data.user) break;
		const edges = res.data.user.mods?.edges ?? [];
		if (!edges.length) break;

		for (let i = 0; i < edges.length; modEdges.push(edges[i++]));
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor && modEdges.length < limit);

	return modEdges.length <= limit ? modEdges : modEdges.slice(0, limit);
}

async function getVips(channelLogin) {
	const res = await gql.request({
		query: queries.GET_VIPS,
		variables: { login: channelLogin },
	});

	return res.data.user?.vips?.edges ?? [];
}

async function getFounders(channelLogin) {
	const res = await gql.request({
		query: queries.GET_FOUNDERS,
		variables: { login: channelLogin },
	});

	return res.data.user?.channel?.founders ?? [];
}

async function getArtists(channelId) {
	const res = await gql.request({
		operationName: 'UserRolesCacheQuery',
		variables: {
			channelID: channelId,
			includeArtists: true,
			includeEditors: false,
			includeMods: false,
			includeVIPs: false,
		},
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash:
					'dfe01a8ac494183d85cc9dbde2d808c35f7ffcfd2b3c12db4c7d2a57c2712121',
			},
		},
	});

	return res.data;
}

async function getChatters(channelLogin) {
	const res = await gql.request({
		query: queries.GET_CHATTERS,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function getSelfModeratedChannels() {
	const moderatedChannelEdges = [];
	const variables = { cursor: null };
	do {
		const res = await gql.request({
			query: queries.GET_SELF_MODERATED_CHANNELS,
			variables,
		});
		const edges = res.data?.moderatedChannels?.edges;
		if (!edges.length) break;

		for (const e of edges) if (e.node?.login) moderatedChannelEdges.push(e);
		variables.cursor = edges[edges.length - 1].cursor ?? null;
	} while (variables.cursor);

	return moderatedChannelEdges;
}

async function getSelfEditableChannels() {
	const res = await gql.request({
		query: queries.GET_SELF_EDITABLE_CHANNELS,
	});
	return res.data;
}

async function isSelfPrivileged(
	channelLogin,
	vip = true,
	moderator = true,
	editor = false
) {
	if (channelLogin === config.bot.login || (!vip && !moderator && !editor))
		return true;

	const res = await gql.request({
		query: queries.IS_SELF_PRIVILEGED,
		variables: { login: channelLogin },
	});

	if (!res.data?.user?.self) return false;
	const { isVIP, isModerator, isEditor } = res.data.user.self;

	return (vip && isVIP) || (moderator && isModerator) || (editor && isEditor);
}

async function getChannelViewer(userLogin, channelLogin) {
	const res = await gql.request({
		query: queries.GET_CHANNEL_VIEWER,
		variables: { userLogin, channelLogin },
	});

	return res.data;
}

async function getUnlockableEmotes(channelLogin) {
	const res = await gql.request({
		query: queries.GET_UNLOCKABLE_EMOTES,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function unlockChosenEmote(channelId, cost, emoteId) {
	const res = await gql.request({
		query: queries.UNLOCK_CHOSEN_EMOTE,
		variables: {
			input: {
				channelID: channelId,
				cost,
				emoteID: emoteId,
				transactionID: utils.randomString(null, 10),
			},
		},
	});

	return res.data;
}

async function unlockRandomEmote(channelId, cost) {
	const res = await gql.request({
		query: queries.UNLOCK_RANDOM_EMOTE,
		variables: {
			input: {
				channelID: channelId,
				cost,
				transactionID: utils.randomString(null, 10),
			},
		},
	});

	return res.data;
}

async function acknowledgeChatWarning(channelId) {
	const res = await gql.request({
		query: queries.ACKNOWLEDGE_CHAT_WARNING,
		variables: { input: { channelID: channelId } },
	});

	return res.data;
}

async function shareResubscription(channelLogin, includeStreak, message) {
	const res = await gql.request({
		operationName: 'Chat_ShareResub_UseResubToken',
		variables: {
			input: {
				channelLogin,
				includeStreak,
				message,
			},
		},
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash:
					'61045d4a4bb10d25080bc0a01a74232f1fa67a6a530e0f2ebf05df2f1ba3fa59',
			},
		},
	});

	return res.data;
}

async function createRaid(sourceChannelId, targetChannelId) {
	const res = await gql.request({
		query: queries.CREATE_RAID,
		variables: {
			input: { sourceID: sourceChannelId, targetID: targetChannelId },
		},
	});

	return res.data;
}

async function joinRaid(raidId) {
	const res = await gql.request({
		query: queries.JOIN_RAID,
		variables: { input: { raidID: raidId } },
	});

	return res.data;
}

export default {
	queries,

	getMods,
	getVips,
	getFounders,
	getArtists,
	getChatters,
	getSelfModeratedChannels,
	getSelfEditableChannels,
	isSelfPrivileged,
	getChannelViewer,
	getUnlockableEmotes,

	unlockChosenEmote,
	unlockRandomEmote,
	acknowledgeChatWarning,
	shareResubscription,
	createRaid,
	joinRaid,
};
