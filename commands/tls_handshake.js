import net from 'net';
import tls from 'tls';
import dns from '../services/dns.js';
import logger from '../services/logger.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

const addressRecordTypes = ['A', 'AAAA'];
const alpnProtocols = ['h2', 'http/1.1'];

export default {
	name: 'tlshandshake',
	aliases: ['tls'],
	description: 'perform a TLS handshake and print connection parameters',
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
			description: 'FQDN to connect to',
		},
		{
			name: 'port',
			short: 'p',
			long: 'port',
			type: 'int',
			defaultValue: 443,
			required: false,
			description: 'port to connect to (default: 443)',
			validator: v => v >= 1 && v <= 65535,
		},
		{
			name: 'sni',
			short: 's',
			long: 'sni',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'custom SNI extension',
		},
		{
			name: 'timeout',
			short: 't',
			long: 'timeout',
			type: 'duration',
			required: false,
			defaultValue: 5000,
			description:
				'connection and handshake timeout (default: 5s, min: 1s, max: 30s)',
			validator: v => v >= 1000 && v <= 30000,
		},
		{
			name: 'dnsServers',
			short: null,
			long: 'dns-servers',
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

		const { port, sni, timeout, dnsServers } = msg.commandFlags;

		let records;
		try {
			records = await dns.resolve(fqdn, addressRecordTypes, dnsServers);
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

		let ip;
		for (let i = 0, e; i < addressRecordTypes.length; i++)
			if ((e = records[addressRecordTypes[i]]?.[0]) && net.isIP(e)) {
				ip = e;
				break;
			}

		if (!ip)
			return { text: `no A/AAAA record found for ${fqdn}`, mention: true };

		let state;
		try {
			state = await getTLSConnectionState(ip, port, sni || fqdn, timeout);
		} catch (err) {
			logger.error('tls error:', err);
			return { text: `TLS error: ${err.message}`, mention: true };
		}

		const responseParts = [`${state.ip}:${state.port}`, state.version];
		if (state.alpnProtocol) responseParts.push(`ALPN: ${state.alpnProtocol}`);
		responseParts.push(`cipher: ${state.cipherSuite.name}`);

		try {
			const link = await paste.create(buildCertificatePage(state.certificate));
			responseParts.push(`certificate: ${link}`);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

async function getTLSConnectionState(ip, port, sni, timeoutMs) {
	const socket = tls.connect({
		host: ip,
		port,
		servername: sni,
		ALPNProtocols: alpnProtocols,
	});
	socket.setTimeout(timeoutMs);
	socket.once('timeout', () =>
		socket.destroy(new Error(`handshake timed out after ${timeoutMs}ms`))
	);

	try {
		await new Promise((res, rej) => {
			socket.once('secureConnect', res);
			socket.once('error', rej);
		});

		const cert = socket.getPeerCertificate();
		if (!cert?.subject) throw new Error('no valid peer certificate received');

		return {
			ip,
			port,
			version: socket.getProtocol(),
			alpnProtocol: socket.alpnProtocol,
			cipherSuite: socket.getCipher(),
			certificate: {
				subjectCN: cert.subject.CN,
				subjectAltNames: cert.subjectaltname?.split(', ') ?? [],
				issuer: cert.issuer,
				notBefore: new Date(cert.valid_from),
				notAfter: new Date(cert.valid_to),
			},
		};
	} finally {
		socket.destroy();
	}
}

function buildCertificatePage(cert) {
	const lines = [`subject CN:__ALIGN__${cert.subjectCN}`];

	if (cert.subjectAltNames.length) {
		lines.push(`SANs:__ALIGN__${cert.subjectAltNames[0]}`);
		for (let i = 1; i < cert.subjectAltNames.length; i++)
			lines.push(`__ALIGN__${cert.subjectAltNames[i]}`);
	}

	lines.push(
		`issuer O:__ALIGN__${cert.issuer.O}`,
		`valid from:__ALIGN__${utils.date.format(cert.notBefore)}`,
		`valid to:__ALIGN__${utils.date.format(cert.notAfter)}`
	);

	return utils.format.align(lines);
}
