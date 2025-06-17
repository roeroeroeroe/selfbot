import dns from 'dns/promises';
import logger from './logger.js';

const ERR_INVALID_SERVERS = 'INVALID_SERVERS';

const resolversByType = {
	A: 'resolve4',
	AAAA: 'resolve6',
	CNAME: 'resolveCname',
	MX: 'resolveMx',
	NS: 'resolveNs',
	SOA: 'resolveSoa',
	SRV: 'resolveSrv',
	TXT: 'resolveTxt',
};
const SUPPORTED_RR_TYPES = Object.keys(resolversByType);

async function resolve(fqdn, recordTypes = SUPPORTED_RR_TYPES, servers) {
	for (let i = 0, t; i < recordTypes.length; i++)
		if (!resolversByType[(t = recordTypes[i])])
			throw new Error(`invalid RR type: ${t}`);

	let resolver = dns;
	if (Array.isArray(servers) && servers.length) {
		resolver = new dns.Resolver();
		try {
			resolver.setServers(servers);
		} catch (err) {
			logger.error('error setting dns servers:', err);
			const invalidServersError = new Error('invalid servers');
			invalidServersError.code = ERR_INVALID_SERVERS;
			throw invalidServersError;
		}
	}
	const promises = recordTypes.map(type =>
		(async () => {
			try {
				return [type, await resolver[resolversByType[type]](fqdn)];
			} catch (err) {
				switch (err.code) {
					case 'ENOTFOUND':
					case 'EINVAL':
						throw err;
					case 'ENODATA':
						break;
					default:
						logger.error(`error resolving ${fqdn} (${type}):`, err);
				}
				return [type, null];
			}
		})()
	);

	return Object.fromEntries(await Promise.all(promises));
}

export default {
	ERR_INVALID_SERVERS,
	SUPPORTED_RR_TYPES,
	resolve,
};
