import { BASIC_USER } from '../fragments.js';

export const GET_MODS = `
query($login: String!, $cursor: Cursor) {
	user(login: $login lookupType: ALL) {
		mods(first: 100 after: $cursor) {
			edges {
				cursor
				grantedAt
				isActive
				node {
					...BasicUserFragment
				}
			}
		}
	}
}
${BASIC_USER}`;

export const GET_VIPS = `
query($login: String!) {
	user(login: $login lookupType: ALL) {
		vips(first: 100) {
			edges {
				grantedAt
				node {
					...BasicUserFragment
				}
			}
		}
	}
}
${BASIC_USER}`;

export const GET_FOUNDERS = ` 
query($login: String!) {
	user(login: $login lookupType: ALL) {
		channel {
			founders {
				isSubscribed
				grantedAt: entitlementStart
				node: user {
					...BasicUserFragment
				}
			}
		}
	}
}
${BASIC_USER}`;

export const GET_ARTISTS = `
query($id: ID!) {
	usersByCommunityRole(channelID: $id role: ARTIST) {
		edges {
			grantedAt
			node {
				...BasicUserFragment
			}
		}
	}
}
${BASIC_USER}`;

export const GET_CHATTERS = `
query($login: String!) {
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
}`;

export const GET_SELF_MODERATED_CHANNELS = `
query($cursor: Cursor) {
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
}`;

export const GET_SELF_EDITABLE_CHANNELS = `
query {
	currentUser {
		editableChannels {
			edges {
				node {
					...BasicUserFragment
				}
			}
		}
	}
}
${BASIC_USER}`;

export const IS_SELF_PRIVILEGED = `
query($login: String) {
	user(login: $login) {
		self {
			isVIP
			isModerator
			isEditor
		}
	}
}`;

export const GET_CHANNEL_VIEWER = `
query($userLogin: String! $channelLogin: String!) {
	channelViewer(userLogin: $userLogin channelLogin: $channelLogin) {
		earnedBadges {
			version
			setID
			title
		}
	}
}`;

export const GET_UNLOCKABLE_EMOTES = `
query($login: String!) {
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
}`;

export const UNLOCK_CHOSEN_EMOTE = `
mutation ($input: UnlockChosenSubscriberEmoteInput!) {
	unlockChosenSubscriberEmote(input: $input) {
		balance
		error {
			code
		}
	}
}`;

export const UNLOCK_RANDOM_EMOTE = `
mutation ($input: UnlockRandomSubscriberEmoteInput!) {
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
}`;

export const ACKNOWLEDGE_CHAT_WARNING = `
mutation($input: AcknowledgeChatWarningInput!) {
	acknowledgeChatWarning(input: $input) {
		error {
			code
		}
	}
}`;

export const SHARE_RESUBSCRIPTION = `
mutation($input: UseChatNotificationTokenInput!) {
	useChatNotificationToken(input: $input) {
		isSuccess
	}
}`;

export const CREATE_RAID = `
mutation($input: CreateRaidInput!) {
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
}`;

export const JOIN_RAID = `
mutation($input: JoinRaidInput!) {
	joinRaid(input: $input) {
		raidID
	}
}`;
