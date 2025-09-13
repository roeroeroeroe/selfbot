import logger from '../services/logger.js';
import wa from '../services/wolfram_alpha.js';

export default {
	name: 'wolframalpha',
	aliases: ['wolfram', 'query'],
	description: 'query Wolfram|Alpha',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'unitSystem',
			short: 'u',
			long: 'units',
			type: 'string',
			required: false,
			defaultValue: wa.UNIT_SYSTEMS.METRIC,
			description:
				'system of units of measurement ' +
				`(default: ${wa.UNIT_SYSTEMS.METRIC}, options: ${[...wa.VALID_UNIT_SYSTEMS].join(', ')})`,
			validator: v => wa.VALID_UNIT_SYSTEMS.has(v.toLowerCase()),
		},
	],
	execute: async msg => {
		if (!process.env.WOLFRAM_ALPHA_API_KEY)
			return {
				text: "'WOLFRAM_ALPHA_API_KEY' environment variable is not set",
				mention: true,
			};
		const input = msg.args.join(' ');
		if (!input) return { text: 'no input provided', mention: true };

		const unitSystem = msg.commandFlags.unitSystem.toLowerCase();

		try {
			const res = await wa.query(input, unitSystem);
			return { text: res, mention: true };
		} catch (err) {
			logger.error('wolfram alpha error:', err);
			return { text: err.message, mention: true };
		}
	},
};
