import { randomUUID } from 'crypto';
import {
	ChatClient,
	ConnectionPool,
	ReconnectError,
} from '@mastondzn/dank-twitch-irc';
import config from '../../../config.json' with { type: 'json' };
import ChatService from './chat_service.js';
import * as constants from './constants.js';
import initTMI from '../tmi.js';
import createIrcSender from './irc_sender.js';
import createGqlSender from './gql_sender.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

let BOT_NONCE;
switch (config.twitch.sender.clientNoncePlatform) {
	case 'web':
		BOT_NONCE = utils.randomString(utils.BASE16_CHARSET, 32);
		break;
	case 'android':
		BOT_NONCE = randomUUID();
		break;
	case 'ios':
		BOT_NONCE = randomUUID().toUpperCase();
		break;
	default:
		throw new Error(
			'unknown client nonce platform: ' +
				config.twitch.sender.clientNoncePlatform
		);
}

let backend;
switch (config.twitch.sender.backend) {
	case 'irc':
		const authed = new ChatClient({
			username: config.bot.login,
			password: process.env.TWITCH_IRC_TOKEN,
			connection: { type: config.twitch.irc.socket, secure: true },
			installDefaultMixins: false,
		});
		authed.on('error', err => {
			if (err instanceof ReconnectError)
				logger.debug('[IRC-TX] server requested reconnect');
			else logger.error('irc-tx error:', err.message);
		});
		authed.on('close', err => err && logger.fatal('irc-tx closed:', err));
		if (config.twitch.irc.connectionsPoolSize >= 2)
			authed.use(
				new ConnectionPool(authed, {
					poolSize: config.twitch.irc.connectionsPoolSize,
				})
			);
		backend = createIrcSender(authed, BOT_NONCE);
		break;
	case 'gql':
		backend = createGqlSender(BOT_NONCE);
		break;
	default:
		throw new Error(
			`unknown chat service backend: ${config.twitch.sender.backend}`
		);
}

const chatService = new ChatService(backend, BOT_NONCE);
const { tmi, channelManager, cleanup: cleanupTMI } = initTMI(chatService);
function cleanup() {
	channelManager.cleanup();
	chatService.cleanup();
	cleanupTMI();
	backend.cleanup();
}
// prettier-ignore
export default {
	...constants,
	BOT_NONCE,

	send: (channelId, channelLogin, userLogin, text, mention, privileged,
	       parentId, action) =>
		chatService.send(channelId, channelLogin, userLogin, text, mention,
		                 privileged, parentId, action),
	recordSend: channelId => chatService.recordSend(channelId),
	setSlowModeDuration: (channelId, ms) => chatService.setSlowModeDuration(channelId, ms),
	join: c => channelManager.join(c),
	part: c => channelManager.part(c),
	connect: () => tmi.connect(),
	ping: () => tmi.ping(),
	cleanup,
	get connections() { return tmi.connections; },
	get joinedChannels() { return tmi.joinedChannels; },
};
