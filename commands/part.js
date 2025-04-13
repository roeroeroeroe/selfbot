import logger from '../services/logger.js';
import hermes from '../services/twitch/hermes/client.js';
import db from '../services/db.js';
import utils from '../utils/index.js';
import { getUsers } from '../services/twitch/helix.js';

export default {
	name: 'part',
	aliases: [],
	description: 'part channel(s)',
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
	],
	execute: async msg => {
		if (!msg.args.length)
			return { text: 'you must provide at least one channel', mention: true };

		const existingChannels = await db.query('SELECT id FROM channels');
		const existingIds = new Set();
		for (const c of existingChannels) existingIds.add(c.id);

		const users = msg.commandFlags.id
			? await getUsers(null, msg.args)
			: await getUsers(msg.args);

		const channelsToPart = [];
		for (const user of users.values())
			if (existingIds.has(user.id)) channelsToPart.push(user);

		if (!channelsToPart.length)
			return { text: 'no known channels, aborting', mention: true };

		for (const c of channelsToPart)
			try {
				await db.channel.delete(c.id);
				for (const sub of hermes.CHANNEL_SUBS) hermes.unsubscribe(sub, c.id);
				msg.client.part(c.login);
			} catch (err) {
				logger.error(`error deleting channel ${c.login}:`, err);
				return { text: `error deleting channel #${c.login}`, mention: true };
			}

		return {
			text:
				channelsToPart.length === 1
					? `parted #${channelsToPart[0].login} ${channelsToPart[0].id}`
					: `parted ${channelsToPart.length} ${utils.format.plural(channelsToPart.length, 'channel')}`,
			mention: true,
		};
	},
};
