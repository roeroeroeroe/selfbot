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
	exclusiveFlagGroups: [['channel', 'global']],
	flags: [
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'channel to change the prefix in (default: current channel)',
		},
		{
			name: 'global',
			short: 'g',
			long: 'global',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'change prefix in all channels and set as default',
		},
		{
			name: 'prefix',
			short: 'p',
			long: 'prefix',
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

				if (config.commands.defaultPrefix !== newPrefix) {
					await configuration.update('defaultPrefix', newPrefix);
					await db.query(
						`ALTER TABLE channels ALTER COLUMN prefix SET DEFAULT '${config.commands.defaultPrefix}'`
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
		const channelInput = msg.commandFlags.channel || msg.channelName;
		try {
			const channel = await db.channel.getByLogin(channelInput);
			if (!channel)
				return { text: `not in ${channelInput}, aborting`, mention: true };

			if (channel.prefix === newPrefix)
				return { text: 'prefix did not change, aborting', mention: true };

			await db.channel.update(channel.id, 'prefix', newPrefix);
			return {
				text: `changed prefix from "${channel.prefix}" to "${newPrefix}" in #${channelInput}`,
				mention: true,
			};
		} catch (err) {
			logger.error(`error updating prefix for ${channelInput}:`, err);
			return { text: 'error updating prefix', mention: true };
		}
	},
};
