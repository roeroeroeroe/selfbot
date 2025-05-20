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

export const SEND_MESSAGE = `
mutation($input: SendChatMessageInput!) {
	sendChatMessage(input: $input) {
		dropReason
		message {
			id
		}
	}
}`;
