import config from '../../config.json' with { type: 'json' };
import { splitArray } from '../../utils/utils.js';
import logger from '../logger.js';

const MAX_OPERATIONS_PER_REQUEST = 35;

const headers = {
	'Client-Id': process.env.TWITCH_ANDROID_CLIENT_ID,
	'Authorization': `OAuth ${process.env.TWITCH_ANDROID_TOKEN}`,
	'Content-Type': 'application/json',
};

export async function gql(body = {}) {
	const bodyString = JSON.stringify(body);
	logger.debug(`[GQL] sending request with body: ${bodyString}`);
	const res = await fetch('https://gql.twitch.tv/gql', {
		method: 'POST',
		headers,
		body: bodyString,
	});

	if (!res.ok) {
		const errorBody = await res.json();
		throw new Error(`GQL request failed: ${JSON.stringify(errorBody)}`);
	}

	const responseBody = await res.json();
	logger.debug(`[GQL] got response:`, responseBody);
	return responseBody;
}

export async function getChannelBanStatus(channelIds, userId = config.bot.id) {
	if (!Array.isArray(channelIds)) channelIds = [channelIds];
	const bannedMap = new Map();

	for (const batch of splitArray(channelIds, MAX_OPERATIONS_PER_REQUEST)) {
		const res = await gql(
			batch.map(channelId => {
				bannedMap.set(channelId, null);
				return {
					query: `query ($channelId: ID! $userId: ID!) {
						chatModeratorStrikeStatus(channelID: $channelId userID: $userId) {
							roomOwner { id }
							banDetails { id createdAt }
							timeoutDetails { id createdAt expiresAt }
							warningDetails { id createdAt }
						}
					}`,
					variables: { channelId, userId },
				};
			})
		);

		for (const response of res) {
			const strikeStatus = response.data?.chatModeratorStrikeStatus;
			if (!strikeStatus?.roomOwner) continue;
			bannedMap.set(strikeStatus.roomOwner.id, !!strikeStatus.banDetails);
		}
	}

	return bannedMap;
}

export async function resolveUser(login, id) {
	const [key, input] = login ? ['login', login] : ['id', id];
	const res = await gql({
		query: `query($login: String $id: ID) {
			user(login: $login id: $id) {
				login
				id
				displayName
			}
		}`,
		variables: { login, id },
	});

	return res.data.user?.[key] === input ? res.data.user : null;
}

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

export async function getUser(login, id) {
	const [lookupBy, varName, varType] = !!id
		? ['ID', 'id', 'ID!']
		: ['Login', 'login', 'String!'];
	const res = await gql({
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
		variables: { login, id },
	});

	return res.data;
}

export async function getUsers(logins, ids) {
	const isIdLookup = ids && ids.length;
	let inputArray = isIdLookup ? ids : logins;
	if (!Array.isArray(inputArray)) inputArray = [inputArray];
	const [varName, varType, mapKey] = isIdLookup
		? ['ids', '[ID!]', 'id']
		: ['logins', '[String!]', 'login'];
	const query = `query Users($${varName}: ${varType}) {
		users(${varName}: $${varName}) {
			${baseUserQuery}
		}
	}`;
	const chunks = splitArray(inputArray, 105);
	const userMap = new Map();
	for (const chunk of chunks) {
		const responses = await gql(
			splitArray(chunk, MAX_OPERATIONS_PER_REQUEST).map(b => ({
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

export async function selfFollowRelationship(login, id) {
	const res = await gql({
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
		variables: { login, id },
	});

	return res.data;
}

export async function followUser(id, enableNotifications = false) {
	const res = await gql({
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
				targetID: id,
			},
		},
	});

	return res.data;
}

export async function unfollowUser(id) {
	const res = await gql({
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
				targetID: id,
			},
		},
	});

	return res.data;
}

export async function getMods(login, limit = 1000) {
	const modEdges = [];
	let cursor;

	do {
		const res = await gql({
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
			variables: { login, cursor },
		});

		if (!res.data.user) break;
		const edges = res.data.user.mods?.edges ?? [];
		for (const edge of edges) modEdges.push(edge);
		cursor = edges.length ? edges[edges.length - 1].cursor : null;
	} while (cursor && modEdges.length <= limit);

	return modEdges.length <= limit ? modEdges : modEdges.slice(0, limit);
}

export async function getVips(login) {
	const res = await gql({
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
		variables: { login },
	});

	return res.data.user?.vips?.edges ?? [];
}

export async function getFounders(login) {
	const res = await gql({
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
		variables: { login },
	});

	return res.data.user?.channel?.founders ?? [];
}

export async function getArtists(id) {
	const res = await gql({
		operationName: 'UserRolesCacheQuery',
		variables: {
			channelID: id,
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

export async function getChatters(login) {
	const res = await gql({
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
		variables: { login },
	});

	return res.data;
}

export async function changeDisplayName(newDisplayName) {
	const res = await gql({
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

export async function getModeratedChannels() {
	const moderatedChannelEdges = [];
	let cursor;
	do {
		const res = await gql({
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

export async function shareResubscription(login, includeStreak, message) {
	const res = await gql({
		operationName: 'Chat_ShareResub_UseResubToken',
		variables: {
			input: {
				channelLogin: login,
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

export async function getFollows(login, limit = 1000, order = 'ASC') {
	const followEdges = [],
		followedGames = [];
	let cursor, totalCount, res;

	do {
		res = await gql({
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
			variables: { login, cursor, order },
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

export async function getFollowers(login, limit = 1000, order = 'ASC') {
	const followerEdges = [];
	let cursor, totalCount, res;

	do {
		res = await gql({
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
			variables: { login, cursor, order },
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

export async function getStream(login) {
	const res = await gql({
		query: `query($login: String!) {
			user(login: $login lookupType: ALL) {
				login
				id
				displayName
				lastBroadcast {
					startedAt
				}
				videos(first: 1 types: ARCHIVE sort: TIME) {
					edges {
						node {
							id
						}
					}
				}
				broadcastSettings {
					game {
						displayName
					}
					isMature
					title
				}
				stream {
					codec
					id
					createdAt
					viewersCount
					averageFPS
					bitrate
					language
					clipCount
					width
					height
					previewImageURL(width: 1920 height: 1080)
					freeformTags {
						name
					}
					game {
						displayName
					}
				}
			}
		}`,
		variables: { login },
	});

	return res.data;
}

export async function getVideo(id) {
	const res = await gql({
		query: `query($id: ID!) {
			video(id: $id) {
				createdAt
				viewCount
				lengthSeconds
				title
				topClips(first: 1) {
					edges {
						node {
							title
							url
							videoOffsetSeconds
							viewCount
							isFeatured
							curator {
								login
								id
								displayName
							}
						}
					}
				}
			}
		}`,
		variables: { id },
	});

	return res.data;
}

export async function subscriptionBenefits() {
	const subscriptionBenefitEdges = [];
	let cursor;
	do {
		const res = await gql({
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

export async function getRelationship(userLogin, channelId) {
	const res = await gql({
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

export async function channelViewer(userLogin, channelLogin) {
	const res = await gql({
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

export async function joinRaid(id) {
	const res = await gql({
		query: `mutation($input: JoinRaidInput!) {
			joinRaid(input: $input) {
				raidID
			}
		}`,
		variables: {
			input: {
				raidID: id,
			},
		},
	});

	return res.data;
}

export async function chatRoomBanStatus(userId, channelId) {
	const res = await gql({
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

export async function acknowledgeChatWarning(channelId) {
	const res = await gql({
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
