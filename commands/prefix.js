import config from '../config.json' with { type: 'json' };
import configuration from '../services/configuration.js';
import logger from '../services/logger.js';
import db from '../services/db.js';
import utils from '../utils/index.js';

export default {
	name: 'prefix',
	aliases: ['setprefix'],
	description: 'change bot prefix',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'channel to change the prefix in (default: current channel)',
		},
		{
			name: 'global',
			aliases: ['g', 'global'],
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'change prefix in all channels and set as default prefix',
		},
		{
			name: 'prefix',
			aliases: ['p', 'prefix'],
			type: 'string',
			defaultValue: '',
			required: true,
			description: 'new prefix',
			validator: v => v.length && !v.startsWith('.') && !v.startsWith('/'),
		},
	],
	execute: async msg => {
		if (msg.commandFlags.global) {
			try {
				const channels = await db.query('SELECT id, prefix FROM channels');
				let i = 0;
				for (const channel of channels) {
					if (channel.prefix === msg.commandFlags.prefix) continue;
					await db.channel.update(
						channel.id,
						'prefix',
						msg.commandFlags.prefix
					);
					i++;
				}

				if (config.defaultPrefix !== msg.commandFlags.prefix) {
					await configuration.update('defaultPrefix', msg.commandFlags.prefix);
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
				return {
					text: 'error updating prefix',
					mention: true,
				};
			}
		}
		const input = (msg.commandFlags.channel || msg.channelName).toLowerCase();
		try {
			const channel = (
				await db.query('SELECT id, prefix FROM channels WHERE login = $1', [
					input,
				])
			)[0];
			if (!channel)
				return {
					text: `not in ${input}, aborting`,
					mention: true,
				};
			if (channel.prefix === msg.commandFlags.prefix)
				return {
					text: 'prefix did not change, aborting',
					mention: true,
				};
			await db.channel.update(channel.id, 'prefix', msg.commandFlags.prefix);
			return {
				text: `changed prefix from "${channel.prefix}" to "${msg.commandFlags.prefix}" in #${input}`,
				mention: true,
			};
		} catch (err) {
			logger.error(`error updating prefix for ${input}:`, err);
			return {
				text: 'error updating prefix',
				mention: true,
			};
		}
	},
};
