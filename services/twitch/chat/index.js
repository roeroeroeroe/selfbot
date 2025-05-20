import { ChatClient, ConnectionPool } from '@mastondzn/dank-twitch-irc';
import ChatService from './chat_service.js';
import * as constants from './constants.js';
import initTMI from '../tmi.js';
import createIrcTransport from './irc_transport.js';
import createGqlTransport from './gql_transport.js';
import config from '../../../config.json' with { type: 'json' };
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

// base16 32char string - emulate webchat
const BOT_NONCE = utils.randomString('0123456789abcdef', 32);

let transport;
switch (config.chatServiceTransport) {
	case 'irc':
		const authed = new ChatClient({
			username: config.bot.login,
			password: process.env.TWITCH_ANDROID_TOKEN,
			connection: { type: config.ircClientTransport, secure: true },
			installDefaultMixins: false,
		});
		authed.on('error', err => logger.error('[IRC-TX] error:', err.message));
		authed.on('close', err => err && logger.fatal('[IRC-TX] closed:', err));
		if (config.authedTmiClientConnectionsPoolSize >= 2)
			authed.use(
				new ConnectionPool(authed, {
					poolSize: config.authedTmiClientConnectionsPoolSize,
				})
			);
		transport = createIrcTransport(authed, BOT_NONCE);
		break;
	case 'gql':
		transport = createGqlTransport(BOT_NONCE);
		break;
	default:
		throw new Error(
			`unknown chat service transport: ${config.chatServiceTransport}`
		);
}

const chatService = new ChatService(transport, BOT_NONCE);
const { tmi, channelManager } = initTMI(chatService);
// prettier-ignore
export default {
	...constants,
	BOT_NONCE,

	send: (
		channelId, channelLogin, userLogin, text, mention, privileged, parentId
	) => chatService.send(
		channelId, channelLogin, userLogin, text, mention, privileged, parentId
	),
	recordSend: channelId => chatService.recordSend(channelId),
	setSlowModeDuration: (channelId, ms) => chatService.setSlowModeDuration(channelId, ms),
	join: c => channelManager.join(c),
	part: c => channelManager.part(c),
	connect: () => tmi.connect(),
	ping: () => tmi.ping(),
	get connectedAt() { return tmi.connectedAt; },
	get connections() { return tmi.connections; },
	get joinedChannels() { return tmi.joinedChannels; },
};
