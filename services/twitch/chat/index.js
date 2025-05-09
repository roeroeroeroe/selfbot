import { ChatClient, ConnectionPool } from '@mastondzn/dank-twitch-irc';
import ChatService from './chat_service.js';
import initTMI from '../tmi.js';
import createIrcTransport from './irc_transport.js';
import createGqlTransport from './gql_transport.js';
import config from '../../../config.json' with { type: 'json' };
import utils from '../../../utils/index.js';

const REGULAR_MAX_CONNECTIONS_POOL_SIZE = 20;
const VERIFIED_MAX_CONNECTIONS_POOL_SIZE = 200;

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

export default {
	REGULAR_MAX_CONNECTIONS_POOL_SIZE,
	VERIFIED_MAX_CONNECTIONS_POOL_SIZE,
	BOT_NONCE,

	send: (...args) => chatService.send(...args),
	recordSend: channelId => chatService.recordSend(channelId),
	join: c => channelManager.join(c),
	part: c => channelManager.part(c),
	connect: () => tmi.connect(),
	ping: () => tmi.ping(),
	get connectedAt() {
		return tmi.connectedAt;
	},
	get connections() {
		return tmi.connections;
	},
	get joinedChannels() {
		return tmi.joinedChannels;
	},
};
