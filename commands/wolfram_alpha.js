import logger from '../services/logger.js';
import wa from '../services/wolfram_alpha.js';

export default {
	name: 'wolframalpha',
	aliases: ['wolfram', 'query'],
	description: 'query Wolfram|Alpha',
	unsafe: false,
	lock: 'NONE',
	flags: [],
	execute: async msg => {
		if (!process.env.WOLFRAM_ALPHA_API_KEY)
			return {
				text: "'WOLFRAM_ALPHA_API_KEY' environment variable is not set",
				mention: true,
			};
		if (!msg.args.length) return { text: 'no input provided', mention: true };

		try {
			const res = await wa(msg.args.join(' '));
			return { text: res, mention: true };
		} catch (err) {
			logger.error('wolfram alpha error:', err);
			return { text: err.message, mention: true };
		}
	},
};
