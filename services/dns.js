import dns from 'dns/promises';
import logger from './logger.js';

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

async function resolve(fqdn, recordTypes = SUPPORTED_RR_TYPES) {
	for (const type of recordTypes)
		if (!resolversByType[type]) throw new Error(`invalid RR type: ${type}`);

	const promises = recordTypes.map(type =>
		(async () => {
			try {
				return [type, await dns[resolversByType[type]](fqdn)];
			} catch (err) {
				if (err.code === 'ENOTFOUND' || err.code === 'EINVAL') throw err;
				if (err.code !== 'ENODATA')
					logger.error(`error resolving ${fqdn} (${type}):`, err);
				return [type, null];
			}
		})()
	);

	const results = await Promise.all(promises);
	return Object.fromEntries(results);
}

export default {
	SUPPORTED_RR_TYPES,

	resolve,
};
