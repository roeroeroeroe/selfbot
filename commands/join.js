import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import db from '../services/db.js';
import hermes from '../services/twitch/hermes/client.js';
import utils from '../utils/index.js';
import helix from '../services/twitch/helix/index.js';

export default {
	name: 'join',
	aliases: [],
	description: 'join channel(s)',
	unsafe: false,
	flags: [
		{
			name: 'id',
			aliases: ['i', 'id'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'treat input as IDs',
		},
		{
			name: 'log',
			aliases: ['l', 'log'],
			type: 'boolean',
			required: false,
			defaultValue: config.logMessagesByDefault,
			description: 'log incoming messages',
		},
		{
			name: 'prefix',
			aliases: ['p', 'prefix'],
			type: 'string',
			required: false,
			defaultValue: config.defaultPrefix,
			description: 'bot prefix',
			validator: v => v.length && !v.startsWith('.') && !v.startsWith('/'),
		},
	],
	execute: async msg => {
		if (!msg.args.length)
			return { text: 'you must provide at least one channel', mention: true };

		let users;
		try {
			users = msg.commandFlags.id
				? await helix.user.getMany(null, msg.args)
				: await helix.user.getMany(msg.args);
		} catch (err) {
			logger.error('error getting users:', err);
			return {
				text: `error getting ${utils.format.plural(msg.args.length, 'user')}`,
				mention: true,
			};
		}

		const existingChannels = await db.query('SELECT id FROM channels');
		const existingIds = new Set();
		for (const c of existingChannels) existingIds.add(c.id);

		const channelsToJoin = [];
		for (const user of users.values())
			if (!existingIds.has(user.id)) channelsToJoin.push(user);

		if (!channelsToJoin.length)
			return { text: 'no new channels, aborting', mention: true };

		const batches = utils.splitArray(channelsToJoin, 500);
		for (const batch of batches)
			try {
				await Promise.all(
					batch.map(channel =>
						db.channel
							.insert(
								channel.id,
								channel.login,
								channel.display_name,
								msg.commandFlags.log,
								msg.commandFlags.prefix
							)
							.catch(err => {
								logger.error(`error inserting channel ${channel.login}:`, err);
								throw new Error(`error saving channel ${channel.login}`);
							})
					)
				);
			} catch (err) {
				return { text: err.message, mention: true };
			}

		for (const c of channelsToJoin) {
			for (const sub of hermes.CHANNEL_SUBS) hermes.subscribe(sub, c.id);
			msg.client.join(c.login);
		}

		return {
			text:
				channelsToJoin.length === 1
					? `joined #${channelsToJoin[0].login} ${channelsToJoin[0].id}`
					: `joined ${channelsToJoin.length} ${utils.format.plural(channelsToJoin.length, 'channel')}`,
			mention: true,
		};
	},
};
