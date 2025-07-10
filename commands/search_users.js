import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';

export default {
	name: 'searchusers',
	aliases: ['searchuser', 'usersearch'],
	description: 'search users',
	unsafe: false,
	lock: 'NONE',
	flags: [],
	execute: async msg => {
		const searchQuery = msg.args[0];
		if (!searchQuery)
			return { text: 'search query is required', mention: true };

		let users;
		try {
			users = await twitch.gql.user.search(searchQuery, true);
			if (!users.length) return { text: 'no users found', mention: true };
		} catch (err) {
			logger.error('error searching users:', err);
			return { text: 'error searching users', mention: true };
		}

		const responseParts = [
			`${users.length} ${utils.format.plural(users.length, 'user')}`,
		];

		const lines = [];
		for (let i = 0; i < users.length; i++) {
			const user = users[i];
			lines.push(utils.pickName(user.login, user.displayName));
		}
		try {
			const link = await paste.create(lines.join('\n'));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};
