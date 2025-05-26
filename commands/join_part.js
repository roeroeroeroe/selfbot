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
	lock: 'NONE',
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
		{
			name: 'force',
			aliases: ['f', 'force'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'always try to join/part',
		},
	],
	execute: async msg => {
		let action, op;
		switch (msg.commandName) {
			case 'join':
				action = 'join';
				op = join;
				break;
			case 'part':
				action = 'part';
				op = part;
				break;
		}

		if (!msg.args.length)
			return {
				text: `you must provide at least one channel to ${action}`,
				mention: true,
			};

		let targetChannels;
		try {
			targetChannels = await getTargets(msg, action);
		} catch (err) {
			logger.error('error getting users:', err);
			return {
				text: `error getting ${utils.format.plural(msg.args.length, 'user')}`,
				mention: true,
			};
		}

		if (!targetChannels.length)
			return { text: `no channels to ${action}, aborting`, mention: true };

		let runner;
		if (msg.commandFlags.force)
			runner = batch => Promise.allSettled(batch.map(c => op(msg, c)));
		else
			runner = batch =>
				Promise.all(
					batch.map(c =>
						op(msg, c).catch(err => {
							logger.error(`error ${action}ing channel ${c.login}:`, err);
							throw new Error(`error ${action}ing channel ${c.login}`);
						})
					)
				);

		try {
			for (const batch of utils.splitArray(targetChannels, OP_BATCH_SIZE))
				await runner(batch);
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

async function getTargets(msg, action) {
	const existingChannels = await db.query('SELECT id, login FROM channels');
	const targetChannels = [];
	if (action === 'join') {
		const usersMap = msg.commandFlags.id
			? await twitch.helix.user.getMany(null, msg.args)
			: await twitch.helix.user.getMany(msg.args);
		if (msg.commandFlags.force)
			for (const user of usersMap.values()) targetChannels.push(user);
		else {
			const existingIds = new Set(existingChannels.map(c => c.id));
			for (const user of usersMap.values())
				if (!existingIds.has(user.id)) targetChannels.push(user);
		}
		return targetChannels;
	}

	if (msg.commandFlags.force) {
		const usersMap = msg.commandFlags.id
			? await twitch.helix.user.getMany(null, msg.args)
			: await twitch.helix.user.getMany(msg.args);
		for (const user of usersMap.values())
			targetChannels.push({ id: user.id, login: user.login });
	} else if (msg.commandFlags.id) {
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
	return targetChannels;
}

async function join(msg, c) {
	await db.channel.insert(
		c.id,
		c.login,
		c.display_name,
		msg.commandFlags.log,
		msg.commandFlags.prefix
	);

	for (const sub of twitch.hermes.CHANNEL_SUBS)
		twitch.hermes.subscribe(sub, c.id);
	twitch.chat.join(c.login);
}

async function part(_, c) {
	await db.channel.delete(c.id);

	for (const sub of twitch.hermes.CHANNEL_SUBS)
		twitch.hermes.unsubscribe(sub, c.id);
	twitch.chat.part(c.login);
}
