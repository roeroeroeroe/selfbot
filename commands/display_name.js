import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'displayname',
	aliases: ['nc', 'cn'],
	description: "change bot's display name",
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'displayName',
			short: 'n',
			long: 'new-name',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'new display name',
		},
	],
	execute: async msg => {
		const displayName = msg.commandFlags.displayName || msg.args[0];
		if (!displayName)
			return { text: 'you must specify new display name', mention: true };
		if (displayName.toLowerCase() !== config.bot.login)
			return { text: 'new display name does not match login', mention: true };

		try {
			const res = await twitch.gql.user.updateDisplayName(displayName);
			const err = res.updateUser.error?.code;
			return {
				text: err
					? `error updating display name: ${err}`
					: `changed display name to ${displayName}`,
				mention: true,
			};
		} catch (err) {
			logger.error('error updating display name:', err);
			return { text: 'error updating dispay name', mention: true };
		}
	},
};
