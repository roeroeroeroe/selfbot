import config from '../config.json' with { type: 'json' };
import configuration from '../services/configuration.js';
import logger from '../services/logger.js';
import db from '../services/db/index.js';
import utils from '../utils/index.js';

export default {
	name: 'prefix',
	aliases: ['setprefix'],
	description: 'change bot prefix',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'channel to change the prefix in (default: current channel)',
		},
		{
			name: 'global',
			aliases: ['g', 'global'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'change prefix in all channels and set as default',
		},
		{
			name: 'prefix',
			aliases: ['p', 'prefix'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'new prefix',
			validator: utils.isValidPrefix,
		},
	],
	execute: async msg => {
		const newPrefix = msg.commandFlags.prefix || msg.args[0];
		if (!newPrefix) return { text: 'no prefix provided', mention: true };
		if (!utils.isValidPrefix(newPrefix))
			return { text: `invalid prefix: ${newPrefix}`, mention: true };

		if (msg.commandFlags.global) {
			try {
				const channels = await db.query('SELECT id, prefix FROM channels');
				let i = 0;
				for (const channel of channels) {
					if (channel.prefix === newPrefix) continue;
					await db.channel.update(channel.id, 'prefix', newPrefix);
					i++;
				}

				if (config.defaultPrefix !== newPrefix) {
					await configuration.update('defaultPrefix', newPrefix);
					await db.query(
						`ALTER TABLE channels ALTER COLUMN prefix SET DEFAULT '${config.defaultPrefix}'`
					);
				}

				return {
					text: `changed prefix in ${i} ${utils.format.plural(i, 'channel')}`,
					mention: true,
				};
			} catch (err) {
				logger.error('error updating prefix:', err);
				return { text: 'error updating prefix', mention: true };
			}
		}
		const input = (msg.commandFlags.channel || msg.channelName).toLowerCase();
		try {
			// prettier-ignore
			const channel = (await db.query('SELECT id, prefix FROM channels WHERE login = $1', [input]))[0];
			if (!channel) return { text: `not in ${input}, aborting`, mention: true };

			if (channel.prefix === newPrefix)
				return { text: 'prefix did not change, aborting', mention: true };

			await db.channel.update(channel.id, 'prefix', newPrefix);
			return {
				text: `changed prefix from "${channel.prefix}" to "${newPrefix}" in #${input}`,
				mention: true,
			};
		} catch (err) {
			logger.error(`error updating prefix for ${input}:`, err);
			return { text: 'error updating prefix', mention: true };
		}
	},
};
