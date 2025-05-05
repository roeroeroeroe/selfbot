import { ChatClient } from '@mastondzn/dank-twitch-irc';
import ChannelManager from './chat/channel_manager.js';
import ChatService from './chat/chat_service.js';
import config from '../../config.json' with { type: 'json' };
import db from '../db.js';
import logger from '../logger.js';
import metrics from '../metrics.js';
import handle from '../message_handler.js';

const MESSAGES_RX_METRICS_COUNTER = 'tmi_messages_received';
metrics.counter.create(MESSAGES_RX_METRICS_COUNTER);

export default function init(chatService) {
	logger.debug('[TMI] initializing...');
	const tmi = new ChatClient({
		connection: { type: config.ircClientTransport, secure: true },
		installDefaultMixins: false,
	});
	const channelManager = new ChannelManager(tmi);

	tmi.on('connecting', () => logger.debug('[TMI] connecting...'));
	tmi.on('ready', () => {
		tmi.connectedAt = Date.now();
		logger.info('[TMI] connected');
		channelManager.init();
	});
	tmi.on('error', err => logger.error('[TMI] error:', err.message));
	tmi.on('close', err => err && logger.fatal('[TMI] closed:', err));
	tmi.on('NOTICE', msg => logger.debug('[TMI] NOTICE:', msg));
	tmi.on('USERNOTICE', msg => logger.debug('[TMI] USERNOTICE:', msg));
	tmi.on('JOIN', msg => logger.debug('[TMI] JOIN:', msg.rawSource));

	tmi.on('ROOMSTATE', ({ channelID, slowModeDuration }) => {
		const duration = Math.max(
			ChatService.DEFAULT_SLOW_MODE_MS,
			(slowModeDuration ?? 0) * 1000 + 100
		);
		const state = chatService.sendStates.get(channelID) || {
			slowModeDuration: duration,
			lastSend: 0,
			lastDuplicateKey: null,
		};
		state.slowModeDuration = duration;
		chatService.sendStates.set(channelID, state);
	});

	tmi.on('PRIVMSG', async msg => {
		if (msg.sourceChannelID && msg.sourceChannelID !== msg.channelID) return;
		msg.receivedAt = performance.now();
		logger.debug('[TMI] PRIVMSG:', msg.rawSource);
		metrics.counter.increment(MESSAGES_RX_METRICS_COUNTER);

		try {
			msg.query = await db.channel.get(msg.channelID);
			if (!msg.query)
				return logger.warning('[TMI] unknown channel:', msg.channelName);
		} catch (err) {
			logger.error(`error getting channel ${msg.channelName}:`, err);
			return;
		}

		if (msg.query.log)
			db.message
				.queueInsert(
					msg.channelID,
					msg.senderUserID,
					msg.messageText,
					msg.serverTimestamp.toISOString()
				)
				.catch(err => logger.error('failed to queue message insert:', err));

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
			if (msg.ircTags['client-nonce'] !== chatService.botNonce) {
				chatService.bumpGlobalLimit();
				chatService.recordSend(msg.channelID);
			}
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

	tmi.connect();
	return { tmi, channelManager };
}
