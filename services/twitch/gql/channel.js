import request from './request.js';
import utils from '../../../utils/index.js';
import config from '../../../config.json' with { type: 'json' };

async function getMods(channelLogin, limit = 1000) {
	const modEdges = [];
	let cursor;

	do {
		const res = await request.send({
			query: `query ($login: String! $cursor: Cursor) {
	user(login: $login lookupType: ALL) {
		mods(first: 100 after: $cursor) {
			edges {
				cursor
				grantedAt
				isActive
				node {
					login
					id
					displayName
				}
			}
		}
	}
}`,
			variables: { login: channelLogin, cursor },
		});

		if (!res.data.user) break;
		const edges = res.data.user.mods?.edges ?? [];
		for (const edge of edges) modEdges.push(edge);
		cursor = edges.length ? edges[edges.length - 1].cursor : null;
	} while (cursor && modEdges.length <= limit);

	return modEdges.length <= limit ? modEdges : modEdges.slice(0, limit);
}

async function getVips(channelLogin) {
	const res = await request.send({
		query: `query($login: String!) {
	user(login: $login lookupType: ALL) {
		vips(first: 100) {
			edges {
				grantedAt
				node {
					login
					id
					displayName
				}
			}
		}
	}
}`,
		variables: { login: channelLogin },
	});

	return res.data.user?.vips?.edges ?? [];
}

async function getFounders(channelLogin) {
	const res = await request.send({
		query: `query($login: String!) {
	user(login: $login lookupType: ALL) {
		channel {
			founders {
				isSubscribed
				grantedAt: entitlementStart
				node: user {
					login
					id
					displayName
				}
			}
		}
	}
}`,
		variables: { login: channelLogin },
	});

	return res.data.user?.channel?.founders ?? [];
}

async function getArtists(channelId) {
	const res = await request.send({
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
	const res = await request.send({
		query: `query($login: String!) {
	user(login: $login lookupType: ALL) {
		channel {
			chatters {
				count
				broadcasters {
					login
				}
				moderators {
					login
				}
				vips {
					login
				}
				viewers {
					login
				}
			}
		}
	}
}`,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function getSelfModeratedChannels() {
	const moderatedChannelEdges = [];
	let cursor;
	do {
		const res = await request.send({
			query: `query($cursor: Cursor) {
	moderatedChannels(first: 100 after: $cursor) {
		edges {
			cursor
			grantedAt
			isLive
			node {
				login
				id
				displayName
				followers(first: 1) {
					totalCount
				}
				stream {
					viewersCount
				}
				roles {
					isAffiliate
					isPartner
					isStaff
				}
				self {
					isEditor
				}
			}
		}
	}
}`,
			variables: { cursor },
		});
		const edges = res.data?.moderatedChannels?.edges;
		if (!edges.length) break;

		for (const e of edges) if (e.node?.login) moderatedChannelEdges.push(e);
		cursor = edges[edges.length - 1].cursor ?? null;
	} while (cursor);

	return moderatedChannelEdges;
}

async function getSelfEditableChannels() {
	const res = await request.send({
		query: `query {
	currentUser {
		editableChannels {
			edges {
				node {
					login
					id
					displayName
				}
			}
		}
	}
}`,
	});

	return res.data;
}

async function isSelfPrivileged(channelLogin) {
	if (channelLogin === config.bot.login) return true;
	const res = await request.send({
		query: `query($login: String) {
	user(login: $login) {
		self {
			isModerator
			isVIP
		}
	}
}`,
		variables: { login: channelLogin },
	});

	if (!res.data?.user?.self) return false;
	const { isModerator, isVIP } = res.data.user.self;
	return isModerator || isVIP;
}

async function getChannelViewer(userLogin, channelLogin) {
	const res = await request.send({
		query: `query($userLogin: String! $channelLogin: String!) {
	channelViewer(userLogin: $userLogin channelLogin: $channelLogin) {
		earnedBadges {
			version
			setID
			title
		}
	}
}`,
		variables: { userLogin, channelLogin },
	});

	return res.data;
}

async function getUnlockableEmotes(channelLogin) {
	const res = await request.send({
		query: `query($login: String!) {
	user(login: $login) {
		emoticonPrefix {
			name
		}
		channel {
			communityPointsSettings {
				automaticRewards {
					cost
					defaultCost
					isEnabled
					minimumCost
					type
				}
				emoteVariants {
					id
					isUnlockable
					emote {
						id
						token
					}
				}
			}
			self {
				communityPoints {
					balance
				}
			}
		}
	}
}`,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function unlockChosenEmote(channelId, cost, emoteId) {
	const res = await request.send({
		query: `mutation ($input: UnlockChosenSubscriberEmoteInput!) {
	unlockChosenSubscriberEmote(input: $input) {
		balance
		error {
			code
		}
	}
}`,
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
	const res = await request.send({
		query: `mutation ($input: UnlockRandomSubscriberEmoteInput!) {
	unlockRandomSubscriberEmote(input: $input) {
		balance
		error {
			code
		}
		emote {
			token
			id
		}
	}
}`,
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
	const res = await request.send({
		query: `mutation($input: AcknowledgeChatWarningInput!) {
	acknowledgeChatWarning(input: $input) {
		error {
			code
		}
	}
}`,
		variables: {
			input: {
				channelID: channelId,
			},
		},
	});

	return res.data;
}

async function shareResubscription(channelLogin, includeStreak, message) {
	const res = await request.send({
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
	const res = await request.send({
		query: `mutation($input: CreateRaidInput!) {
	createRaid(input: $input) {
		error {
			code
		}
		raid {
			id
			viewerCount
			sourceChannel {
				login
			}
			targetChannel {
				login
			}
		}
	}
}`,
		variables: {
			input: {
				sourceID: sourceChannelId,
				targetID: targetChannelId,
			},
		},
	});

	return res.data;
}

async function joinRaid(raidId) {
	const res = await request.send({
		query: `mutation($input: JoinRaidInput!) {
	joinRaid(input: $input) {
		raidID
	}
}`,
		variables: {
			input: {
				raidID: raidId,
			},
		},
	});

	return res.data;
}

export default {
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
