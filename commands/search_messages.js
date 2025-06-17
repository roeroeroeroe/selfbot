import logger from '../services/logger.js';
import db from '../services/db/index.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

export default {
	name: 'searchmessages',
	// prettier-ignore
	aliases: [
		'msgfind', 'findmsg', 'findmessages',
		'msgsearch', 'searchmsg',
	],
	description: 'search chat messages using trigram-based similarity matching',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'restrict search to the specified channel',
		},
		{
			name: 'user',
			aliases: ['u', 'user'],
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'restrict search to the specified user',
		},
		{
			name: 'notUsers',
			aliases: ['U', 'not-user'],
			type: 'username',
			list: { unique: true, minItems: 1 },
			defaultValue: null,
			required: false,
			description: 'users to exclude from the search',
		},
		{
			name: 'notChannels',
			aliases: ['C', 'not-channel'],
			type: 'username',
			list: { unique: true, minItems: 1 },
			defaultValue: null,
			required: false,
			description: 'channels to exclude from the search',
		},
		{
			name: 'threshold',
			aliases: ['t', 'threshold'],
			type: 'float',
			required: false,
			defaultValue: 0.3,
			description: 'minimum similarity score (default: 0.3, min: 0.3, max: 1)',
			validator: v => v >= 0.3 && v <= 1,
		},
		{
			name: 'lastMs',
			aliases: [null, 'last'],
			type: 'duration',
			required: false,
			defaultValue: 0,
			description: 'restrict search to messages from the last <duration>',
		},
		{
			name: 'limit',
			aliases: ['l', 'limit'],
			type: 'int',
			required: false,
			defaultValue: 100,
			description:
				'maximum messages returned (default: 100, min: 1, max: 5000)',
			validator: v => v >= 1 && v <= 5000,
		},
		{
			name: 'showScore',
			aliases: ['s', 'show-score'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'include similarity scores',
		},
	],
	execute: async msg => {
		const searchTerm = msg.args.join(' ');
		if (!searchTerm) return { text: 'search term is required', mention: true };

		let channelId, channelLogin;
		if (msg.commandFlags.channel)
			try {
				const channel = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!channel) return { text: 'channel does not exist', mention: true };
				channelId = channel.id;
				channelLogin = channel.login;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}

		let userId, userLogin;
		if (msg.commandFlags.user)
			try {
				const user = await twitch.gql.user.resolve(msg.commandFlags.user);
				if (!user) return { text: 'user does not exist', mention: true };
				userId = user.id;
				userLogin = user.login;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.user}:`, err);
				return { text: 'error resolving user', mention: true };
			}

		const { notChannels, notUsers, lastMs, limit, threshold, showScore } =
			msg.commandFlags;

		let excludeChannelIds, excludeUserIds;
		try {
			excludeChannelIds = await resolveExclude(
				notChannels,
				channelLogin,
				'channel'
			);
			excludeUserIds = await resolveExclude(notUsers, userLogin, 'user');
		} catch (err) {
			return { text: err.message, mention: true };
		}

		let rows;
		try {
			rows = await db.message.search(
				channelId,
				userId,
				excludeChannelIds,
				excludeUserIds,
				lastMs,
				searchTerm,
				limit,
				threshold
			);
		} catch (err) {
			logger.error('error searching messages:', err);
			return { text: 'error searching messages', mention: true };
		}

		if (!rows.length)
			return { text: 'no matching messages found', mention: true };

		const userIds = new Set();
		for (let i = 0; i < rows.length; i++) {
			userIds.add(rows[i].user_id);
			userIds.add(rows[i].channel_id);
		}

		let usersMap;
		try {
			usersMap = await twitch.helix.user.getMany(null, Array.from(userIds));
		} catch (err) {
			logger.error('error getting users:', err);
			return { text: 'error getting users', mention: true };
		}

		const lines = formatRows(rows, showScore, usersMap),
			responseParts = [
				`found ${rows.length} ${utils.format.plural(rows.length, 'message')}`,
			];
		try {
			const link = await paste.create(lines.join('\n'));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

async function resolveExclude(usernames, contextLogin, label) {
	if (!usernames.length) return [];
	let usersMap;
	try {
		usersMap = await twitch.helix.user.getMany(usernames);
	} catch (err) {
		logger.error('error getting users:', err);
		throw new Error(`error getting ${label}s`);
	}
	const ids = [];
	for (let i = 0; i < usernames.length; i++) {
		const n = usernames[i];
		if (n === contextLogin) continue;
		const u = usersMap.get(n);
		if (u) {
			ids.push(u.id);
			continue;
		}
		if (label !== 'channel') throw new Error(`${label} ${n} does not exist`);
		let channel;
		try {
			channel = await db.channel.getByLogin(n);
		} catch (err) {
			logger.error(`error getting channel ${n}:`, err);
			throw new Error(`error getting channel ${n}`);
		}
		if (!channel) throw new Error(`channel ${n} does not exist`);
		ids.push(channel.id);
	}
	return ids;
}

function formatRows(rows, showScore, usersMap) {
	const out = new Array(rows.length);
	if (showScore) {
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i];
			out[i] =
				`(${r.similarity.toFixed(3)}) ${utils.date.format(r.timestamp)}` +
				` #${usersMap.get(r.channel_id)?.login || `(id) ${r.channel_id}`}` +
				` ${usersMap.get(r.user_id)?.login || `(id) ${r.user_id}`}: ${r.text}`;
		}
		return out;
	}
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		out[i] =
			utils.date.format(r.timestamp) +
			` #${usersMap.get(r.channel_id)?.login || `(id) ${r.channel_id}`}` +
			` ${usersMap.get(r.user_id)?.login || `(id) ${r.user_id}`}: ${r.text}`;
	}
	return out;
}
