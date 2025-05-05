import request from './request.js';

async function sendMessage(channelId, message, nonce, parentId) {
	const res = await request.send({
		query: `mutation($input: SendChatMessageInput!) {
	sendChatMessage(input: $input) {
		dropReason
		message {
			id
		}
	}
}`,
		variables: {
			input: {
				message,
				nonce,
				channelID: channelId,
				replyParentMessageID: parentId,
			},
		},
	});

	return res.data;
}

export default {
	send: sendMessage,
};
