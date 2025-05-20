import { BASIC_USER, EXTENDED_USER, FOLLOWER } from '../fragments.js';

export const RESOLVE_USER = `
query($login: String $id: ID) {
	user(login: $login id: $id) {
		...BasicUserFragment
	}
}
${BASIC_USER}`;

export const GET_USER_BY_ID_WITH_BAN_REASON = `
query User($id: ID!) {
	user(id: $id lookupType: ALL) {
		...UserFragment
	}
	banned: userResultByID(id: $id) {
		... on UserDoesNotExist {
			reason
		}
	}
}
${EXTENDED_USER}`;

export const GET_USER_BY_LOGIN_WITH_BAN_REASON = `
query User($login: String!) {
	user(login: $login lookupType: ALL) {
		...UserFragment
	}
	banned: userResultByLogin(login: $login) {
		... on UserDoesNotExist {
			reason
		}
	}
}
${EXTENDED_USER}`;

export const GET_USERS_BY_IDS = `
query Users($input: [ID!]) {
	users(ids: $input) {
		...UserFragment
	}
}
${EXTENDED_USER}`;

export const GET_USERS_BY_LOGINS = `
query Users($input: [String!]) {
	users(logins: $input) {
		...UserFragment
	}
}
${EXTENDED_USER}`;

export const SEARCH_USERS = `
query($searchQuery: String!) {
	searchUsers(userQuery: $searchQuery first: 100) {
		edges {
			node {
				...BasicUserFragment
			}
		}
	}
}
${BASIC_USER}`;

export const GET_SELF_BAN_STATUS = `
query($channelId: ID! $userId: ID!) {
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
}`;

export const GET_SELF_SUBSCRIPTION_BENEFITS = `
query($cursor: Cursor) {
	currentUser {
		subscriptionBenefits(first: 100 after: $cursor criteria: {}) {
			edges {
				node {
					tier
					gift {
						isGift
					}
					user {
						...BasicUserFragment
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
}
${BASIC_USER}`;

export const GET_SELF_FOLLOW_RELATIONSHIP = `
query($login: String $id: ID) {
	user(login: $login id: $id) {
		...BasicUserFragment
		self {
			follower {
				followedAt
			}
		}
	}
}
${BASIC_USER}`;

export const GET_FOLLOWS = `
query follows($login: String! $cursor: Cursor $order: SortOrder) {
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
					...FollowerFragment
				}
			}
		}
	}
}
${FOLLOWER}`;

export const GET_FOLLOWERS = `
query followers($login: String! $cursor: Cursor $order: SortOrder) {
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
					...FollowerFragment
				}
			}
		}
	}
}
${FOLLOWER}`;

export const GET_RELATIONSHIP = `
query($userLogin: String! $channelId: ID! $channelIdString: String!) {
	user(login: $userLogin lookupType: ALL) {
		...BasicUserFragment
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
						...BasicUserFragment
					}
				}
			}
		}
	}
}
${BASIC_USER}`;

export const FOLLOW_USER = `
mutation($input: FollowUserInput!) {
	followUser(input: $input) {
		follow {
			user {
				...BasicUserFragment
			}
		}
		error {
			code
		}
	}
}
${BASIC_USER}`;

export const UNFOLLOW_USER = `
mutation($input: UnfollowUserInput!) {
	unfollowUser(input: $input) {
		follow {
			user {
				...BasicUserFragment
			}
		}
	}
}
${BASIC_USER}`;

export const UPDATE_DISPLAY_NAME = `
mutation($input: UpdateUserInput!) {
	updateUser(input: $input) {
		error {
			code
		}
	}
}`;
