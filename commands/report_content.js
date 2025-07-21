import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

const uiEntryPoints = twitch.gql.report.UI_ENTRY_POINTS;
const reportContentTypes = twitch.gql.report.CONTENT_TYPES;

const handlers = {
	chatUser: handleChatUser,
	messageId: handleMessageId,
	broadcast: handleBroadcast,
	username: handleUser,
	user: handleUser,
	whisperThread: handleWhisper,
};

export default {
	name: 'reportcontent',
	aliases: ['report'],
	description:
		'report content (chat, message, broadcast, username, user, whisper); ' +
		'if no content type flag is provided, replying to a message reports it',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [
		['chatUser', 'messageId', 'broadcast', 'username', 'user', 'whisperThread'],
	],
	flags: [
		{
			name: 'reason',
			short: 'r',
			long: 'reason',
			type: 'string',
			required: true,
			defaultValue: '',
			description: 'reason ID',
		},
		{
			name: 'detailedReason',
			short: 'R',
			long: 'detailed-reason',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'sub-reason ID (if required)',
		},
		{
			name: 'description',
			short: 'd',
			long: 'description',
			type: 'string',
			required: true,
			defaultValue: '',
			description: 'free-form details',
		},
		{
			name: 'email',
			short: null,
			long: 'email',
			type: 'string',
			required: false,
			defaultValue: null,
			description: "email (default: current user's email)",
		},
		// CHAT_REPORT
		{
			name: 'chatUser',
			short: null,
			long: 'chat-user',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'chatter to report (with --chat-channel)',
		},
		// CHAT_REPORT
		{
			name: 'chatChannel',
			short: null,
			long: 'chat-channel',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'channel (with --chat-user)',
		},
		// CHAT_REPORT
		{
			name: 'messageId',
			short: null,
			long: 'message-id',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'report a message',
			validator: v => v.trim(),
		},
		// LIVESTREAM_REPORT
		{
			name: 'broadcast',
			short: null,
			long: 'broadcast',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'report a broadcast',
		},
		// USERNAME_REPORT
		{
			name: 'username',
			short: null,
			long: 'username',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'report a username',
		},
		// USER_REPORT
		{
			name: 'user',
			short: null,
			long: 'user',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'report a user account',
		},
		// WHISPER_REPORT
		{
			name: 'whisperThread',
			short: null,
			long: 'whisper',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'report a whisper thread with the specified user',
		},
	],
	execute: async msg => {
		let contentParams;
		try {
			contentParams = await getContentParams(msg);
		} catch (err) {
			return { text: err.message, mention: true };
		}

		const {
			contentType,
			contentId,
			contentMetadata = null,
			targetUserID,
			uiEntryPoint = twitch.gql.report.DEFAULT_UI_ENTRY_POINT,
		} = contentParams;

		const sessionId = utils.randomString(
			utils.BASE16_CHARSET,
			twitch.gql.report.SESSION_ID_LENGTH
		);
		let wizard;
		try {
			wizard = await twitch.gql.report.getReportWizard(
				[contentType],
				targetUserID,
				sessionId
			);
		} catch (err) {
			logger.error('error getting report wizard:', err);
			return { text: 'error getting report wizard', mention: true };
		}

		const { reasons, reportableContent } = wizard;

		const contentEntry = reportableContent.find(e => e.id === contentType);
		if (!contentEntry)
			return {
				text: `failed to find ${contentType} entry`,
				mention: true,
			};

		const allReasonDefs = new Map();
		for (let i = 0; i < reasons.toSAndCountryReasons.length; i++) {
			const r = reasons.toSAndCountryReasons[i];
			allReasonDefs.set(r.id, r);
		}

		const { reason, description } = msg.commandFlags;

		const applicableIds = [];
		let matched = false;
		for (let i = 0; i < contentEntry.applicableReasons.length; i++) {
			const id = contentEntry.applicableReasons[i].reportReason.id;
			if (id === reason) {
				matched = true;
				break;
			}
			applicableIds.push(id);
		}

		if (!matched) {
			const validDefs = [];
			for (let i = 0, d; i < applicableIds.length; i++)
				if ((d = allReasonDefs.get(applicableIds[i]))) validDefs.push(d);
			const lines = [];
			for (let i = 0; i < validDefs.length; i++) {
				const def = validDefs[i];
				if (i) lines.push('');
				lines.push(`${def.id}${alignSep}${def.description || 'N/A'}`);
				if (!def.detailedReasons?.length) continue;
				for (let j = 0; j < def.detailedReasons.length; j++) {
					const dr = def.detailedReasons[j];
					lines.push(`  ${dr.id}${alignSep}${dr.description || 'N/A'}`);
				}
			}
			let linkOrList;
			try {
				linkOrList = await paste.create(utils.format.align(lines));
			} catch (err) {
				logger.error('error creating paste:', err);
				linkOrList = validDefs.map(r => r.id).join(', ');
			}
			return {
				text: `invalid reason: "${reason}", valid reasons are: ${linkOrList}`,
				mention: true,
			};
		}

		const reasonDef = allReasonDefs.get(reason);
		let detailedReason = msg.commandFlags.detailedReason;

		if (
			reasonDef.detailedReasons?.length &&
			(!detailedReason ||
				!reasonDef.detailedReasons.some(r => r.id === detailedReason))
		) {
			const lines = [];
			for (let i = 0; i < reasonDef.detailedReasons.length; i++) {
				const dr = reasonDef.detailedReasons[i];
				lines.push(`${dr.id}${alignSep}${dr.description || 'N/A'}`);
			}
			let linkOrList;
			try {
				linkOrList = await paste.create(utils.format.align(lines));
			} catch (err) {
				logger.error('error creating paste:', err);
				linkOrList = reasonDef.detailedReasons.map(r => r.id).join(', ');
			}
			const prefix = detailedReason
				? `invalid detailed reason: "${detailedReason}"`
				: `a detailed reason is required for "${reason}"`;
			return {
				text: `${prefix}, valid detailed reasons are: ${linkOrList}`,
				mention: true,
			};
		}

		if (!reasonDef.detailedReasons?.length && detailedReason)
			detailedReason = null;

		let email = msg.commandFlags.email;
		if (email === null)
			try {
				email = await twitch.gql.user.getSelfEmail();
				if (!email) return { text: 'failed to get email', mention: true };
			} catch (err) {
				logger.error('error getting email:', err);
				return { text: 'error getting email', mention: true };
			}

		let res;
		try {
			res = await twitch.gql.report.reportContent(
				contentType,
				contentId,
				contentMetadata,
				reason,
				detailedReason || null,
				description,
				targetUserID,
				sessionId,
				uiEntryPoint,
				email
			);
		} catch (err) {
			logger.error('error sending report', err);
			return { text: 'error sending report', mention: true };
		}

		const errCode = res.reportUserContent.error?.code;
		if (errCode)
			return { text: `error sending report: ${errCode}`, mention: true };

		return { text: 'report submitted successfully', mention: true };
	},
};

async function resolveUser(login, label) {
	try {
		const user = await twitch.gql.user.resolve(login);
		return user ? { user } : { error: `${label} does not exist` };
	} catch (err) {
		logger.error(`error resolving ${login}:`, err);
		return { error: `error resolving ${label}` };
	}
}

function getContentParams(msg) {
	const { commandFlags, replyParentUserID, replyParentMessageID, channelID } =
		msg;

	let handler;
	for (const k in handlers)
		if (commandFlags[k]) {
			handler = handlers[k];
			break;
		}
	if (handler) return handler(commandFlags);

	if (replyParentUserID)
		return {
			contentType: reportContentTypes.CHAT_REPORT,
			contentId: replyParentMessageID,
			contentMetadata: { channelID },
			targetUserID: replyParentUserID,
		};

	throw new Error('no report content type selected');
}

async function handleChatUser({ chatUser, chatChannel }) {
	if (!chatChannel) throw new Error('chat channel is required for chat report');
	const { user: targetUser, error: uError } = await resolveUser(
		chatUser,
		'user'
	);
	if (uError) throw new Error(uError);
	const { user: targetChannel, error: cError } = await resolveUser(
		chatChannel,
		'channel'
	);
	if (cError) throw new Error(cError);

	return {
		contentType: reportContentTypes.CHAT_REPORT,
		contentId: '',
		contentMetadata: { channelID: targetChannel.id },
		targetUserID: targetUser.id,
		uiEntryPoint: uiEntryPoints.CHAT_VIEWER_CARD,
	};
}

async function handleMessageId({ messageId }) {
	let message;
	try {
		message = await twitch.gql.chat.getMessage(messageId);
	} catch (err) {
		logger.error('error getting message:', err);
		throw new Error('error getting message');
	}
	if (!message) throw new Error('message not found');
	if (!message.sender?.id) throw new Error('message sender no longer exists');
	if (!message.channel?.id)
		throw new Error('malformed message: got no channel id');

	return {
		contentType: reportContentTypes.CHAT_REPORT,
		contentId: messageId,
		contentMetadata: { channelID: message.channel.id },
		targetUserID: message.sender.id,
	};
}

async function handleBroadcast({ broadcast }) {
	let res;
	try {
		res = await twitch.gql.stream.get(broadcast);
	} catch (err) {
		logger.error(`error resolving user ${broadcast}:`, err);
		throw new Error('error resolving user');
	}
	if (!res.user) throw new Error('user does not exist');
	if (!res.user.stream?.id) throw new Error('user is not live');

	return {
		contentType: reportContentTypes.LIVESTREAM_REPORT,
		contentId: res.user.stream.id,
		targetUserID: res.user.id,
	};
}

async function handleUser({ username, user }) {
	const login = username || user;
	const { user: target, error } = await resolveUser(login, 'user');
	if (error) throw new Error(error);

	return {
		contentType: username
			? reportContentTypes.USERNAME_REPORT
			: reportContentTypes.USER_REPORT,
		contentId: target.id,
		targetUserID: target.id,
	};
}

async function handleWhisper({ whisperThread }) {
	const { user: target, error } = await resolveUser(whisperThread, 'user');
	if (error) throw new Error(error);

	let thread;
	try {
		thread = await twitch.gql.whisper.findThread(target.login);
	} catch (err) {
		logger.error('error getting whisper threads:', err);
		throw new Error('error getting whisper thread');
	}
	if (!thread) throw new Error('failed to find whisper thread');

	return {
		contentType: reportContentTypes.WHISPER_REPORT,
		contentId: thread.id,
		targetUserID: target.id,
		uiEntryPoint: uiEntryPoints.WHISPERS_THREAD,
	};
}
