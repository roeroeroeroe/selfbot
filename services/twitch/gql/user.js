import request from './request.js';
import config from '../../../config.json' with { type: 'json' };
import utils from '../../../utils/index.js';

const baseUserQuery = `id
		login
		displayName
		description
		chatColor
		deletedAt
		createdAt
		updatedAt
		lastBroadcast { startedAt }
		settings { preferredLanguageTag }
		emoticonPrefix { name }
		followers(first: 1) { totalCount }
		follows(first: 1) { totalCount }
		selectedBadge { title version }
		panels(hideExtensions: false) { id type }
		roles {
			isParticipatingDJ
			isAffiliate
			isExtensionsDeveloper
			isGlobalMod
			isPartner
			isSiteAdmin
			isStaff
		}
		followedGames(first: 100 type: ALL) {
			nodes { displayName }
		}
		primaryTeam {
			name
			owner { login }
		}
		channel {
			chatters { count }
			socialMedias { name url }
		}
		stream {
			createdAt
			viewersCount
			game { displayName }
		}`;

async function resolveUser(userLogin, userId) {
	const [key, input] = userLogin
		? ['login', userLogin.toLowerCase()]
		: ['id', userId];
	const res = await request.send({
		query: `query($login: String $id: ID) {
	user(login: $login id: $id) {
		login
		id
		displayName
	}
}`,
		variables: { login: userLogin, id: userId },
	});

	return res.data.user?.[key] === input ? res.data.user : null;
}

async function getUserWithBanReason(userLogin, userId) {
	const [lookupBy, varName, varType] = !!userId
		? ['ID', 'id', 'ID!']
		: ['Login', 'login', 'String!'];
	const res = await request.send({
		query: `query User($${varName}: ${varType}) {
	user(${varName}: $${varName} lookupType: ALL) {
		${baseUserQuery}
	}
	banned: userResultBy${lookupBy}(${varName}: $${varName}) {
		... on UserDoesNotExist {
			reason
		}
	}
}`,
		variables: { login: userLogin, id: userId },
	});

	return res.data;
}

async function getMany(userLogins, userIds) {
	const isIdLookup = userIds && userIds.length;
	let inputArray = isIdLookup ? userIds : userLogins;
	if (!Array.isArray(inputArray)) inputArray = [inputArray];
	const [varName, varType, mapKey] = isIdLookup
		? ['ids', '[ID!]', 'id']
		: ['logins', '[String!]', 'login'];
	const query = `query Users($${varName}: ${varType}) {
	users(${varName}: $${varName}) {
		${baseUserQuery}
	}
}`;
	const chunks = utils.splitArray(inputArray, 105);
	const userMap = new Map();
	for (const chunk of chunks) {
		const responses = await request.send(
			utils.splitArray(chunk, request.MAX_OPERATIONS_PER_REQUEST).map(b => ({
				query,
				variables: { [varName]: b },
			}))
		);
		for (const response of responses)
			for (const user of response.data?.users)
				if (user?.[mapKey]) userMap.set(user[mapKey], user);
	}

	return userMap;
}

async function getSelfBanStatus(channelIds) {
	if (!Array.isArray(channelIds)) channelIds = [channelIds];
	const bannedMap = new Map();

	for (const batch of utils.splitArray(
		channelIds,
		request.MAX_OPERATIONS_PER_REQUEST
	)) {
		const res = await request.send(
			batch.map(channelId => {
				bannedMap.set(channelId, null);
				return {
					query: `query ($channelId: ID! $userId: ID!) {
	chatModeratorStrikeStatus(channelID: $channelId userID: $userId) {
		roomOwner {
			id
		}
		banDetails {
			id
			createdAt
		}
		timeoutDetails {
			id
			createdAt
			expiresAt
		}
		warningDetails {
			id
			createdAt
		}
	}
}`,
					variables: { channelId, userId: config.bot.id },
				};
			})
		);

		for (const response of res) {
			const strikeStatus = response.data?.chatModeratorStrikeStatus;
			if (strikeStatus?.roomOwner?.id)
				bannedMap.set(strikeStatus.roomOwner.id, !!strikeStatus.banDetails);
		}
	}

	return bannedMap;
}

async function getSelfSubscriptionBenefits() {
	const subscriptionBenefitEdges = [];
	let cursor;
	do {
		const res = await request.send({
			query: `query($cursor: Cursor) {
	currentUser {
		subscriptionBenefits(
			first: 100
			after: $cursor
			criteria: {}
		) {
			edges {
				node {
					tier
					gift {
						isGift
					}
					user {
						login
						id
						displayName
						subscriptionProducts {
							emotes {
								token
							}
						}
						channel {
							localEmoteSets {
								emotes {
									token
								}
							}
						}
					}
				}
			}
		}
	}
}`,
			variables: { cursor },
		});

		const edges = res.data?.currentUser.subscriptionBenefits?.edges ?? [];
		if (!edges.length) break;

		for (const e of edges)
			if (e.node?.user?.login) subscriptionBenefitEdges.push(e);
		cursor = edges[edges.length - 1].cursor ?? null;
	} while (cursor);

	return subscriptionBenefitEdges;
}

async function getSelfFollowRelationship(channelLogin, channelId) {
	const res = await request.send({
		query: `query($login: String $id: ID) {
	user(login: $login id: $id) {
		login
		id
		displayName
		self {
			follower {
				followedAt
			}
		}
	}
}`,
		variables: { login: channelLogin, id: channelId },
	});

	return res.data;
}

async function getFollows(userLogin, limit = 1000, order = 'ASC') {
	const followEdges = [],
		followedGames = [];
	let cursor, totalCount, res;

	do {
		res = await request.send({
			query: `query follows(
	$login: String!
	$cursor: Cursor
	$order: SortOrder
) {
	user(login: $login) {
		followedGames(first: 100 type: ALL) {
			nodes {
				displayName
			}
		}
		follows(first: 100 after: $cursor order: $order) {
			totalCount
			edges {
				cursor
				followedAt
				notificationSettings {
					isEnabled
				}
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
				}
			}
		}
	}
}`,
			variables: { login: userLogin, cursor, order },
		});

		if (!res.data.user) break;
		const edges = res.data.user.follows?.edges ?? [];
		if (!edges.length) break;
		for (const e of edges) if (e.node?.login) followEdges.push(e);
		cursor = edges.length ? edges[edges.length - 1].cursor : null;
	} while (cursor && followEdges.length <= limit);

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
	let cursor, totalCount, res;

	do {
		res = await request.send({
			query: `query followers(
	$login: String!
	$cursor: Cursor
	$order: SortOrder
) {
	user(login: $login) {
		followers(first: 100 after: $cursor order: $order) {
			totalCount
			edges {
				cursor
				followedAt
				notificationSettings {
					isEnabled
				}
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
				}
			}
		}
	}
}`,
			variables: { login: userLogin, cursor, order },
		});

		if (!res.data.user) break;
		const edges = res.data.user.followers?.edges ?? [];
		if (!edges.length) break;
		for (const e of edges) if (e.node?.login) followerEdges.push(e);
		cursor = edges.length ? edges[edges.length - 1].cursor : null;
	} while (cursor && followerEdges.length <= limit);

	const user = res.data.user;
	if (user?.followers)
		totalCount = user.followers.totalCount || followerEdges.length;

	return { followerEdges, totalCount };
}

async function getRelationship(userLogin, channelId) {
	const res = await request.send({
		query: `query(
	$userLogin: String!
	$channelId: ID!
	$channelIdString: String!
) {
	user(login: $userLogin lookupType: ALL) {
		login
		id
		displayName
		isModerator(channelID: $channelIdString)
		relationship(targetUserID: $channelId) {
			followedAt
			subscriptionTenure(tenureMethod: CUMULATIVE) {
				end
				months
			}
			subscriptionBenefit {
				id
				endsAt
				renewsAt
				platform
				purchasedWithPrime
				tier
				thirdPartySKU
				gift {
					isGift
					gifter {
						login
						id
						displayName
					}
				}
			}
		}
	}
}`,
		variables: {
			userLogin,
			channelId,
			channelIdString: channelId,
		},
	});

	return res.data;
}

async function getBanStatus(userId, channelId) {
	const res = await request.send({
		json: {
			query: `query($userId: ID! $channelId: ID!) {
	chatRoomBanStatus(userID: $userId channelID: $channelId) {
		createdAt
		expiresInMs
		isPermanent
		reason
		moderator {
			login
			id
			displayName
		}
		roomOwner {
			login
			id
			displayName
		}
	}
}`,
			variables: { userId, channelId },
		},
	});

	return res.data?.chatRoomBanStatus;
}

async function followUser(userId, enableNotifications = false) {
	const res = await request.send({
		query: `mutation($input: FollowUserInput!) {
	followUser(input: $input) {
		follow {
			user {
				login
				id
				displayName
			}
		}
		error {
			code
		}
	}
}`,
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
	const res = await request.send({
		query: `mutation($input: UnfollowUserInput!) {
	unfollowUser(input: $input) {
		follow {
			user {
				login
				id
				displayName
			}
		}
	}
}`,
		variables: {
			input: {
				targetID: userId,
			},
		},
	});

	return res.data;
}

async function updateDisplayName(newDisplayName) {
	const res = await request.send({
		query: `mutation($input: UpdateUserInput!) {
	updateUser(input: $input) {
		error {
			code
		}
	}
}`,
		variables: {
			input: {
				displayName: newDisplayName,
				userID: config.bot.id,
			},
		},
	});

	return res.data;
}

export default {
	resolve: resolveUser,
	getUserWithBanReason,
	getMany,
	getSelfBanStatus,
	getSelfSubscriptionBenefits,
	getSelfFollowRelationship,
	getFollows,
	getFollowers,
	getRelationship,
	getBanStatus,

	follow: followUser,
	unfollow: unfollowUser,
	updateDisplayName,
};
