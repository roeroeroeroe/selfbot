import db from '../services/db/index.js';

export default {
	name: 'sql',
	aliases: [],
	description: "query bot's database",
	unsafe: true,
	flags: [],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no query provided', mention: true };
		const queryString = msg.args.join(' ');
		try {
			const rows = await db.query(queryString);
			return {
				text: rows.length ? JSON.stringify(rows) : 'query returned no rows',
				mention: true,
			};
		} catch (err) {
			return { text: `query failed: ${err.message}`, mention: true };
		}
	},
};
