import config from '../../config.json' with { type: 'json' };
import nullPtr from './0x0.js';
import hastebin from './hastebin.js';
import utils from '../../utils/index.js';
import logger from '../logger.js';
import metrics from '../metrics/index.js';
import { GET_PASTE_FETCH_OPTIONS } from './constants.js';

function getPaste(url) {
	logger.debug(`[PASTE] getting paste: ${url}`);
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`invalid URL: ${url}`);
	}
	const { origin, pathname } = parsed;
	const key = pathname.split('/').filter(Boolean).pop() || null;
	const isNullPtr = config.paste.nullPtr.instance
		? url.startsWith(config.paste.nullPtr.instance)
		: false;
	return utils.retry(
		async () => {
			if (isNullPtr) {
				const res = await fetch(url, GET_PASTE_FETCH_OPTIONS);
				if (res.status >= 400 && res.status < 500)
					throw new Error(`PASTE-GET ${res.status}: ${res.statusText}`);
				if (!res.ok) {
					const err = new Error(`PASTE-GET ${res.status}: ${await res.text()}`);
					err.retryable = true;
					throw err;
				}
				return res.text();
			}

			const res = await fetch(url, GET_PASTE_FETCH_OPTIONS);
			if (res.status >= 400 && res.status < 500)
				throw new Error(`PASTE-GET ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(`PASTE-GET ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}
			if (!res.headers.get('content-type')?.includes('text/html'))
				return res.text();

			if (!key)
				throw new Error('could not get plaintext from any known endpoint');

			const apiUrl = `${origin}/documents/${key}`;
			try {
				logger.debug(`[PASTE] trying api: ${apiUrl}`);
				const apiRes = await fetch(apiUrl, {
					headers: GET_PASTE_FETCH_OPTIONS.headers,
				});
				if (apiRes.ok) {
					const body = await apiRes.json();
					if (typeof body.data === 'string') return body.data;
				}
			} catch {}

			const rawUrl = `${origin}/raw/${key}`;
			try {
				logger.debug(`[PASTE] trying raw: ${rawUrl}`);
				const rawRes = await fetch(rawUrl, GET_PASTE_FETCH_OPTIONS);
				if (
					rawRes.ok &&
					!rawRes.headers.get('content-type')?.includes('text/html')
				)
					return rawRes.text();
			} catch {}
			throw new Error('could not get plaintext from any known endpoint');
		},
		{
			requestsCounter: metrics.names.counters.PASTE_REQUESTS_TX,
			retriesCounter: metrics.names.counters.PASTE_RETRIES,
			logLabel: 'PASTE-GET',
		}
	);
}

let paste;
switch (config.paste.service) {
	case 'nullPtr':
		paste = nullPtr;
		break;
	case 'hastebin':
		paste = hastebin;
		break;
	default:
		throw new Error(`unknown paste service: ${config.paste.service}`);
}

export default {
	...paste,
	get: getPaste,
};
