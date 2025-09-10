import ChatService from '../../chat/chat_service.js';
import * as queries from './queries.js';
import gql from '../index.js';
import logger from '../../../logger.js';
import config from '../../../../config.json' with { type: 'json' };
import utils from '../../../../utils/index.js';

async function canSend(channelId, channelLogin, privileged = false) {
	let strikeStatus;
	try {
		const res = await gql.user.getSelfStrikeStatus(channelId);
		if (!(strikeStatus = res.chatModeratorStrikeStatus))
			throw new Error('no strikeStatus in response:', res);
	} catch (err) {
		logger.error('error getting strike status:', err);
		return {
			allowed: false,
			slowMode: ChatService.DEFAULT_SLOW_MODE_MS,
			error: 'error getting strike status',
			strikeStatus: null,
		};
	}
	// warningDetails are ignored -- it's the caller's job to ack them
	const { banDetails, timeoutDetails } = strikeStatus;
	if (banDetails.createdAt)
		return {
			allowed: false,
			slowMode: ChatService.DEFAULT_SLOW_MODE_MS,
			error: `you are banned from ${channelLogin}`,
			strikeStatus,
		};
	if (timeoutDetails.expiresAt) {
		const expiresIn = utils.duration.format(
			Date.parse(timeoutDetails.expiresAt) - Date.now()
		);
		return {
			allowed: false,
			slowMode: ChatService.DEFAULT_SLOW_MODE_MS,
			error: `you are timed out from ${channelLogin} (expires in ${expiresIn})`,
			strikeStatus,
		};
	}
	if (privileged)
		return {
			allowed: true,
			slowMode: ChatService.DEFAULT_SLOW_MODE_MS,
			strikeStatus,
		};

	let settings;
	try {
		const res = await getSettings(channelLogin);
		if (!(settings = res.user.chatSettings))
			throw new Error('no chatSettings in response:', res);
	} catch (err) {
		logger.error(`error getting chat settings for ${channelLogin}:`, err);
		return {
			allowed: false,
			slowMode: ChatService.DEFAULT_SLOW_MODE_MS,
			error: 'error getting chat settings',
			strikeStatus,
		};
	}
	const {
		followersOnlyDurationMinutes,
		isSubscribersOnlyModeEnabled: subOnly,
		isFastSubsModeEnabled: noSlowForSubs,
		slowModeDurationSeconds,
	} = settings;
	const minFA =
		followersOnlyDurationMinutes === null
			? null
			: followersOnlyDurationMinutes * 60000;
	let slowMode = Math.max(
		ChatService.DEFAULT_SLOW_MODE_MS,
		(slowModeDurationSeconds || 0) * 1000 + 100
	);
	if (
		!subOnly &&
		minFA === null &&
		slowMode === ChatService.DEFAULT_SLOW_MODE_MS &&
		!noSlowForSubs
	)
		return { allowed: true, slowMode, strikeStatus };

	let rel;
	try {
		const relRes = await gql.user.getRelationship(config.bot.login, channelId);
		rel = relRes.user.relationship;
	} catch (err) {
		logger.error('error getting relationship:', err);
		return {
			allowed: false,
			slowMode,
			error: 'error getting relationship',
			strikeStatus,
		};
	}

	if (minFA !== null && !ChatService.CAN_BYPASS_FOLLOWERS_ONLY_MODE) {
		if (!rel.followedAt)
			return {
				allowed: false,
				slowMode,
				error: `you need to be a follower of ${channelLogin} to chat${minFA > 0 ? ` (minFA: ${utils.duration.format(minFA)})` : ''}`,
				strikeStatus,
			};
		if (minFA > 0) {
			const age = Date.now() - Date.parse(rel.followedAt);
			if (age < minFA)
				return {
					allowed: false,
					slowMode,
					error:
						`you need to be a follower of ${channelLogin} to chat ` +
						`(minFA: ${utils.duration.format(minFA)}, ` +
						`FA: ${utils.duration.format(age)})`,
					strikeStatus,
				};
		}
	}
	if (subOnly && !rel.subscriptionBenefit?.id) {
		return {
			allowed: false,
			slowMode,
			error: `sub-only chat is enabled for ${channelLogin}`,
			strikeStatus,
		};
	}
	if (noSlowForSubs && rel.subscriptionBenefit?.id)
		slowMode = ChatService.DEFAULT_SLOW_MODE_MS;

	return { allowed: true, slowMode, strikeStatus };
}

async function getSettings(channelLogin) {
	const res = await gql.request({
		query: queries.GET_SETTINGS,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function getRecentMessages(channelLogin) {
	const res = await gql.request({
		query: queries.GET_RECENT_MESSAGES,
		variables: { login: channelLogin },
	});

	return res.data;
}

async function getMessage(messageId) {
	const res = await gql.request({
		query: queries.GET_MESSAGE,
		variables: { id: messageId },
	});

	return res.data?.message;
}

async function sendMessage(channelId, message, nonce, parentId) {
	const res = await gql.request({
		query: queries.SEND_MESSAGE,
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
	queries,

	canSend,
	getSettings,
	getRecentMessages,
	getMessage,

	send: sendMessage,
};
