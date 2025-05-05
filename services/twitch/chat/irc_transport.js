import logger from '../../logger.js';

export default function createIrcTransport(chatClient, botNonce) {
	chatClient.connect();
	return {
		async send(_, channelLogin, message, nonce = botNonce, parentId) {
			const ircCommand = parentId
				? `@reply-parent-msg-id=${parentId};client-nonce=${nonce} PRIVMSG #${channelLogin} :${message}`
				: `@client-nonce=${nonce} PRIVMSG #${channelLogin} :${message}`;
			logger.debug('[IRC-TX]', ircCommand);
			await chatClient.sendRaw(ircCommand);
		},
	};
}
