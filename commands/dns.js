import utils from '../utils/index.js';
import dns from '../services/dns.js';
import logger from '../services/logger.js';

export default {
	name: 'dns',
	aliases: ['dig'],
	description: 'resolve DNS resource records for a given FQDN',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'name',
			aliases: ['n', 'name'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'FQDN to query',
		},
		{
			name: 'rrtypes',
			aliases: ['r', 'rrtypes'],
			type: 'string',
			defaultValue: 'A AAAA',
			required: false,
			description: `list of DNS RR types to query (e.g., "A AAAA"), or ALL to query every supported type (options: ${dns.SUPPORTED_RR_TYPES.join(', ')})`,
			validator: v => {
				const upper = v.toUpperCase();
				if (upper === 'ALL') return true;
				for (const t of upper.split(/\s+/))
					if (!dns.SUPPORTED_RR_TYPES.includes(t)) return false;
				return true;
			},
		},
	],

	execute: async msg => {
		const fqdn = msg.commandFlags.name || msg.args[0];
		if (!fqdn) return { text: 'no domain provided', mention: true };

		const typesListUpper = msg.commandFlags.rrtypes.toUpperCase();
		const types =
			typesListUpper === 'ALL'
				? dns.SUPPORTED_RR_TYPES
				: typesListUpper.split(/\s+/);

		let records;
		try {
			records = await dns.resolve(fqdn, types);
		} catch (err) {
			if (err.code === 'ENOTFOUND')
				return { text: `NXDOMAIN: ${fqdn}`, mention: true };
			if (err.code === 'EINVAL')
				return { text: `invalid name: ${fqdn}`, mention: true };
			logger.error('dns error:', err);
			return { text: `error resolving ${fqdn}`, mention: true };
		}

		const responseParts = [fqdn];
		for (const type of types) {
			const record = records[type];
			if (!record || (Array.isArray(record) && !record.length)) {
				responseParts.push(`${type}: (no record)`);
				continue;
			}
			let formatted;
			if (type === 'TXT') formatted = record.map(t => t.join('')).join(', ');
			else if (Array.isArray(record))
				formatted = record
					.map(r => (typeof r === 'object' ? JSON.stringify(r) : r))
					.join(', ');
			else if (typeof record === 'object') formatted = JSON.stringify(record);
			else formatted = record;
			responseParts.push(`${type}: ${formatted}`);
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};
