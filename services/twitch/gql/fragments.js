import { DEFAULT_PAGE_SIZE } from './constants.js';

export const BASIC_USER = `
fragment BasicUserFragment on User {
	login
	id
	displayName
}`;

export const EXTENDED_USER = `
fragment UserFragment on User {
	login
	id
	displayName
	description
	chatColor
	deletedAt
	createdAt
	updatedAt
	lastBroadcast {
		startedAt
	}
	settings {
		preferredLanguageTag
	}
	emoticonPrefix {
		name
	}
	payoutInvite {
		category
	}
	selectedBadge {
		title
	}
	followers(first: 1) {
		totalCount
	}
	follows(first: 1) {
		totalCount
	}
	panels(hideExtensions: false) {
		id
		type
	}
	roles {
		isParticipatingDJ
		isAffiliate
		isExtensionsDeveloper
		isGlobalMod
		isPartner
		isMonetized
		isSiteAdmin
		isStaff
	}
	followedGames(first: ${DEFAULT_PAGE_SIZE} type: ALL) {
		nodes {
			displayName
		}
	}
	primaryTeam {
		name
		owner {
			login
		}
	}
	channel {
		chatters {
			count
		}
		socialMedias {
			url
		}
	}
	stream {
		createdAt
		viewersCount
		game {
			displayName
		}
	}
}`;

export const FOLLOWER = `
fragment FollowerFragment on User {
	login
	id
	displayName
	settings {
		preferredLanguageTag
	}
	followers(first: 1) {
		totalCount
	}
	stream {
		viewersCount
	}
}`;

export const PREDICTION_EVENT_ACTOR = `
fragment PredictionEventActorFragment on PredictionEventActor {
	... on ExtensionClient {
		name
	}
	... on User {
		login
		id
		displayName
	}
}`;

export const PREDICTION_OUTCOME = `
fragment PredictionOutcomeFragment on PredictionOutcome {
	id
	title
	color
	totalPoints
	totalUsers
	topPredictors {
		id
		points
		pointsWon
		predictedAt
		updatedAt
		user {
			login
			id
			displayName
		}
	}
}`;
