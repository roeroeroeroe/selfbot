import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import { changeDisplayName } from '../services/twitch/gql.js';

export default {
	name: 'displayname',
	aliases: ['nc', 'cn'],
	description: "change bot's display name",
	unsafe: false,
	flags: [
		{
			name: 'displayName',
			aliases: ['n', 'new-name'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'new display name',
		},
	],
	execute: async msg => {
		const input = msg.commandFlags.displayName || msg.args[0];
		if (!input)
			return {
				text: 'you must specify new name',
				mention: true,
			};
		if (input.toLowerCase() !== config.bot.login)
			return {
				text: 'new display name does not match login',
				mention: true,
			};
		try {
			const res = await changeDisplayName(input);
			if (res.updateUser.error?.code)
				return {
					text: `error updating display name: ${res.updateUser.error.code}`,
					mention: true,
				};
			return {
				text: `changed display name to ${input}`,
				mention: true,
			};
		} catch (err) {
			logger.error('error updating display name:', err);
			return {
				text: 'error updating dispay name',
				mention: true,
			};
		}
	},
};
