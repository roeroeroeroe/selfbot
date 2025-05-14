import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import db from '../services/db/index.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';

const OP_BATCH_SIZE = 500;

export default {
	name: 'join',
	aliases: ['part'],
	description: 'join/part channel(s) (alias-driven)',
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
			description: 'log incoming messages (join only)',
		},
		{
			name: 'prefix',
			aliases: ['p', 'prefix'],
			type: 'string',
			required: false,
			defaultValue: config.defaultPrefix,
			description: 'bot prefix (join only)',
			validator: utils.isValidPrefix,
		},
	],
	execute: async msg => {
		let action;
		switch (msg.commandName) {
			case 'join':
				action = 'join';
				break;
			case 'part':
				action = 'part';
				break;
		}

		if (!msg.args.length)
			return {
				text: `you must provide at least one channel to ${action}`,
				mention: true,
			};

		const existingChannels = await db.query('SELECT id, login FROM channels');

		const targetChannels = [];
		switch (action) {
			case 'join':
				let usersMap;
				try {
					usersMap = msg.commandFlags.id
						? await twitch.helix.user.getMany(null, msg.args)
						: await twitch.helix.user.getMany(msg.args);
				} catch (err) {
					logger.error('error getting users:', err);
					return {
						text: `error getting ${utils.format.plural(msg.args.length, 'user')}`,
						mention: true,
					};
				}
				const idsMap = new Map(existingChannels.map(c => [c.id, c.login]));
				for (const user of usersMap.values())
					if (!idsMap.has(user.id)) targetChannels.push(user);
				break;
			case 'part':
				if (msg.commandFlags.id) {
					const idsMap = new Map(existingChannels.map(c => [c.id, c.login]));
					for (const arg of msg.args) {
						const login = idsMap.get(arg);
						if (login) targetChannels.push({ id: arg, login });
					}
				} else {
					const loginsMap = new Map(existingChannels.map(c => [c.login, c.id]));
					for (const arg of msg.args) {
						const login = arg.toLowerCase();
						const id = loginsMap.get(login);
						if (id) targetChannels.push({ id, login });
					}
				}
				break;
		}

		if (!targetChannels.length)
			return { text: `no channels to ${action}, aborting`, mention: true };

		try {
			switch (action) {
				case 'join':
					for (const batch of utils.splitArray(targetChannels, OP_BATCH_SIZE))
						await Promise.all(batch.map(c => join(msg, c)));
					break;
				case 'part':
					for (const batch of utils.splitArray(targetChannels, OP_BATCH_SIZE))
						await Promise.all(batch.map(c => part(c)));
					break;
			}
		} catch (err) {
			return { text: err.message, mention: true };
		}

		return {
			text:
				targetChannels.length === 1
					? `${action}ed #${targetChannels[0].login} ${targetChannels[0].id}`
					: `${action}ed ${targetChannels.length} ${utils.format.plural(targetChannels.length, 'channel')}`,
			mention: true,
		};
	},
};

async function join(msg, c) {
	try {
		await db.channel.insert(
			c.id,
			c.login,
			c.display_name,
			msg.commandFlags.log,
			msg.commandFlags.prefix
		);
	} catch (err) {
		logger.error(`error inserting channel ${c.login}:`, err);
		throw new Error(`error saving channel ${c.login}`);
	}

	for (const sub of twitch.hermes.CHANNEL_SUBS)
		twitch.hermes.subscribe(sub, c.id);
	twitch.chat.join(c.login);
}

async function part(c) {
	try {
		await db.channel.delete(c.id);
	} catch (err) {
		logger.error(`error deleting channel ${c.login}:`, err);
		throw new Error(`error deleting channel ${c.login}`);
	}

	for (const sub of twitch.hermes.CHANNEL_SUBS)
		twitch.hermes.unsubscribe(sub, c.id);
	twitch.chat.part(c.login);
}
