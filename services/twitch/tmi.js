import { ChatClient, ReconnectError } from '@mastondzn/dank-twitch-irc';
import ChannelManager from './chat/channel_manager.js';
import config from '../../config.json' with { type: 'json' };
import db from '../db/index.js';
import logger from '../logger.js';
import metrics from '../metrics/index.js';
import handle from '../message_handler.js';

export default function init(chatService) {
	logger.debug('[TMI] initializing...');
	const tmi = new ChatClient({
		connection: { type: config.ircClientTransport, secure: true },
		installDefaultMixins: false,
	});
	const channelManager = new ChannelManager(tmi);

	tmi.on('connecting', () => logger.debug('[TMI] connecting...'));
	tmi.on('ready', () => {
		logger.info('[TMI] connected');
		channelManager.init();
	});
	tmi.on('error', err => {
		if (err instanceof ReconnectError)
			logger.debug('[TMI] server requested reconnect');
		else logger.error('[TMI] error:', err.message);
	});
	tmi.on('close', err => err && logger.fatal('[TMI] closed:', err));
	tmi.on('NOTICE', msg => logger.debug('[TMI] NOTICE:', msg));
	tmi.on('USERNOTICE', msg => logger.debug('[TMI] USERNOTICE:', msg));
	tmi.on('JOIN', msg => logger.debug('[TMI] JOIN:', msg.rawSource));
	tmi.on('PART', msg => logger.debug('[TMI] PART:', msg.rawSource));
	tmi.on('ROOMSTATE', ({ channelID, slowModeDuration }) =>
		chatService.setSlowModeDuration(
			channelID,
			(slowModeDuration ?? 0) * 1000 + 100
		)
	);
	tmi.on('PRIVMSG', async msg => {
		if (msg.sourceChannelID && msg.sourceChannelID !== msg.channelID) return;
		msg.receivedAt = performance.now();
		logger.debug('[TMI] PRIVMSG:', msg.rawSource);
		metrics.counter.increment(metrics.names.counters.TMI_MESSAGES_RX);

		try {
			msg.query = await db.channel.get(msg.channelID);
			if (!msg.query)
				return logger.warning('[TMI] unknown channel:', msg.channelName);
		} catch (err) {
			return logger.error(`error getting channel ${msg.channelName}:`, err);
		}

		if (msg.query.log)
			db.message.queueInsert(
				msg.channelID,
				msg.senderUserID,
				msg.messageText,
				msg.serverTimestamp.toISOString()
			);

		// prettier-ignore
		if (msg.query.login !== msg.channelName) {
			logger.info(`[TMI] name change: ${msg.query.login} -> ${msg.channelName}`);
			try {
				await db.channel.update(msg.channelID, 'login', msg.channelName, msg.query);
			} catch (err) {
				logger.error('error updating channel:', err);
			}
		}

		// prettier-ignore
		if (msg.senderUserID === config.bot.id) {
			msg.self = msg.ircTags['client-nonce'] === chatService.botNonce;
			if (!msg.self) chatService.recordSend(msg.channelID);
			const isPrivileged = msg.isMod || msg.badges.hasVIP || msg.badges.hasBroadcaster;
			if (msg.query.privileged !== isPrivileged)
				try {
					await db.channel.update(msg.channelID, 'privileged', isPrivileged, msg.query);
				} catch (err) {
					logger.error('error updating channel:', err);
				}
		}

		msg.send = (text, reply = false, mention = false) =>
			chatService.send(
				msg.channelID,
				msg.channelName,
				msg.senderUsername,
				text,
				mention,
				msg.query.privileged,
				reply ? msg.messageID : ''
			);

		handle(msg);
	});

	return { tmi, channelManager };
}
