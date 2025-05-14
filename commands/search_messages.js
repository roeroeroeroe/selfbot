import logger from '../services/logger.js';
import db from '../services/db/index.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import hastebin from '../services/hastebin.js';

export default {
	name: 'searchmessages',
	// prettier-ignore
	aliases: [
		'msgfind', 'findmsg', 'findmessages',
		'msgsearch', 'searchmsg',
	],
	description: 'search chat messages using trigram-based similarity matching',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: '',
			description: 'restrict search to the specified channel',
		},
		{
			name: 'user',
			aliases: ['u', 'user'],
			type: 'username',
			required: false,
			defaultValue: '',
			description: 'restrict search to the specified user',
		},
		{
			name: 'threshold',
			aliases: ['t', 'threshold'],
			type: 'number',
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
			description: 'restrict search to the last N milliseconds',
		},
		{
			name: 'limit',
			aliases: ['l', 'limit'],
			type: 'number',
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

		let channelId;
		if (msg.commandFlags.channel)
			try {
				const channel = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!channel) return { text: 'channel does not exist', mention: true };
				channelId = channel.id;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}

		let userId;
		if (msg.commandFlags.user) {
			try {
				const user = await twitch.gql.user.resolve(msg.commandFlags.user);
				if (!user) return { text: 'user does not exist', mention: true };
				userId = user.id;
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.user}:`, err);
				return { text: 'error resolving user', mention: true };
			}
		}

		let rows;
		try {
			rows = await db.message.search(
				channelId,
				userId,
				msg.commandFlags.lastMs,
				searchTerm,
				msg.commandFlags.limit,
				msg.commandFlags.threshold
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

		const lines = [];
		if (msg.commandFlags.showScore)
			for (const r of rows)
				lines.push(
					`(${r.similarity.toFixed(3)}) ${utils.date.format(r.timestamp)}` +
						` #${usersMap.get(r.channel_id)?.login || `(id) ${r.channel_id}`}` +
						` ${usersMap.get(r.user_id)?.login || `(id) ${r.user_id}`}: ${r.text}`
				);
		else
			for (const r of rows)
				lines.push(
					utils.date.format(r.timestamp) +
						` #${usersMap.get(r.channel_id)?.login || `(id) ${r.channel_id}`}` +
						` ${usersMap.get(r.user_id)?.login || `(id) ${r.user_id}`}: ${r.text}`
				);

		const responseParts = [
			`found ${rows.length} ${utils.format.plural(rows.length, 'message')}`,
		];

		try {
			const link = await hastebin.create(lines.join('\n'));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};
