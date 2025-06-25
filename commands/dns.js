import utils from '../utils/index.js';
import dns from '../services/dns.js';
import logger from '../services/logger.js';

const validRRTypes = new Set(dns.SUPPORTED_RR_TYPES);

export default {
	name: 'dns',
	aliases: ['dig'],
	description: 'resolve DNS resource records for a given FQDN',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'name',
			short: 'n',
			long: 'name',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'FQDN to query',
		},
		{
			name: 'rrtypes',
			short: 'r',
			long: 'rrtypes',
			type: 'string',
			list: {
				unique: true,
				minItems: 1,
				maxItems: validRRTypes.size,
				itemValidator: v =>
					(v = v.toUpperCase()) === 'ALL' || validRRTypes.has(v),
			},
			defaultValue: 'A AAAA',
			required: false,
			description: `DNS RR types to query, ALL to query every supported type (options: ${dns.SUPPORTED_RR_TYPES.join(', ')})`,
		},
		{
			name: 'servers',
			short: 's',
			long: 'servers',
			type: 'string',
			list: { unique: true, minItems: 1 },
			defaultValue: null,
			required: false,
			description: 'custom DNS servers',
		},
	],
	execute: async msg => {
		const fqdn = msg.commandFlags.name || msg.args[0];
		if (!fqdn) return { text: 'no domain provided', mention: true };

		let types = [];
		for (let i = 0; i < msg.commandFlags.rrtypes.length; i++) {
			const upper = msg.commandFlags.rrtypes[i].toUpperCase();
			if (upper === 'ALL') {
				types = dns.SUPPORTED_RR_TYPES;
				break;
			}
			types.push(upper);
		}

		let records;
		try {
			records = await dns.resolve(fqdn, types, msg.commandFlags.servers);
		} catch (err) {
			switch (err.code) {
				case 'ENOTFOUND':
					return { text: `NXDOMAIN: ${fqdn}`, mention: true };
				case 'EINVAL':
					return { text: `invalid name: ${fqdn}`, mention: true };
				case dns.ERR_INVALID_SERVERS:
					return { text: 'invalid servers', mention: true };
				default:
					logger.error('dns error:', err);
					return { text: `error resolving ${fqdn}`, mention: true };
			}
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
