import {
	BASIC_USER,
	PREDICTION_EVENT_ACTOR,
	PREDICTION_OUTCOME,
} from '../fragments.js';

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

export const GET_CUSTOM_REWARDS = `
query($login: String!) {
	user(login: $login) {
		...BasicUserFragment
		self {
			isModerator
			subscriptionBenefit {
				id
			}
		}
		channel {
			self {
				communityPoints {
					balance
					canRedeemRewardsForFree
				}
			}
			communityPointsSettings {
				isAvailable
				isEnabled
				name
				customRewards {
					id
					cost
					title
					prompt
					isEnabled
					isInStock
					isPaused
					isSubOnly
					isUserInputRequired
					cooldownExpiresAt
					redemptionsRedeemedCurrentStream
					shouldRedemptionsSkipRequestQueue
					globalCooldownSetting {
						isEnabled
						globalCooldownSeconds
					}
					maxPerStreamSetting {
						isEnabled
						maxPerStream
					}
					maxPerUserPerStreamSetting {
						isEnabled
						maxPerUserPerStream
					}
				}
			}
		}
	}
}
${BASIC_USER}`;

export const GET_SELF_CHANNEL_POINTS_BALANCE = `
query($login: String!) {
	channel(name: $login) {
		self {
			communityPoints {
				balance
			}
		}
	}
}`;

export const GET_PREDICTION_EVENT = `
query($id: ID!) {
	predictionEvent(id: $id) {
		channel {
			owner {
				...BasicUserFragment
			}
		}
		title
		status
		predictionWindowSeconds
		createdAt
		lockedAt
		endedAt
		self {
			restriction
			prediction {
				id
				result
				points
				pointsWon
				predictedAt
				updatedAt
				outcome {
					...PredictionOutcomeFragment
				}
			}
		}
		createdBy {
			...PredictionEventActorFragment
		}
		lockedBy {
			...PredictionEventActorFragment
		}
		endedBy {
			...PredictionEventActorFragment
		}
		outcomes {
			...PredictionOutcomeFragment
		}
		winningOutcome {
			...PredictionOutcomeFragment
		}
	}
}
${BASIC_USER}
${PREDICTION_OUTCOME}
${PREDICTION_EVENT_ACTOR}`;

export const UNLOCK_CHOSEN_EMOTE = `
mutation($input: UnlockChosenSubscriberEmoteInput!) {
	unlockChosenSubscriberEmote(input: $input) {
		balance
		error {
			code
		}
	}
}`;

export const UNLOCK_RANDOM_EMOTE = `
mutation($input: UnlockRandomSubscriberEmoteInput!) {
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

export const REDEEM_CUSTOM_REWARD = `
mutation($input: RedeemCommunityPointsCustomRewardInput!) {
	redeemCommunityPointsCustomReward(input: $input) {
		error {
			code
		}
		redemption {
			id
		}
	}
}`;

export const REFUND_CUSTOM_REWARD_REDEMPTION = `
mutation($input: UpdateCommunityPointsCustomRewardRedemptionStatusInput!) {
	updateCommunityPointsCustomRewardRedemptionStatus(input: $input) {
		error {
			code
		}
	}
}`;

export const PLACE_PREDICTION_BET = `
mutation($input: MakePredictionInput!) {
	makePrediction(input: $input) {
		error {
			code
			maxPointsPerEvent
			userPointsSpent
		}
		prediction {
			points
		}
	}
}`;
