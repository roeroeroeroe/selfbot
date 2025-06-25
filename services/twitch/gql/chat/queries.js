import { BASIC_USER } from '../fragments.js';

export const GET_SETTINGS = `
query($login: String) {
	user(login: $login) {
		chatSettings {
			followersOnlyDurationMinutes
			isEmoteOnlyModeEnabled
			isFastSubsModeEnabled
			isSubscribersOnlyModeEnabled
			slowModeDurationSeconds
		}
	}
}`;

export const GET_RECENT_MESSAGES = `
query($login: String!) {
	channel(name: $login) {
		recentChatMessages {
			sentAt
			content {
				text
			}
			sender {
				...BasicUserFragment
			}
		}
	}
}
${BASIC_USER}`;

export const SEND_MESSAGE = `
mutation($input: SendChatMessageInput!) {
	sendChatMessage(input: $input) {
		dropReason
		message {
			id
		}
	}
}`;
