import config from '../../config.json' with { type: 'json' };
import nullPtr from './0x0.js';
import hastebin from './hastebin.js';
import utils from '../../utils/index.js';
import logger from '../logger.js';
import metrics from '../metrics/index.js';
import { GET_PASTE_FETCH_OPTIONS } from './constants.js';

function getPaste(url) {
	logger.debug(`[PASTE] getting paste: ${url}`);
	return utils.retry(
		async () => {
			let res = await fetch(url, GET_PASTE_FETCH_OPTIONS);
			if (res.status >= 400 && res.status < 500)
				throw new Error(`PASTE-GET ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(`PASTE-GET ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}
			if (res.headers.get('content-type')?.includes('text/html')) {
				if (url.includes('/raw/'))
					throw new Error('invalid paste: expected plaintext, got html');
				const parts = url.split('/');
				url = `${parts.slice(0, parts.length - 1).join('/')}/raw/${parts[parts.length - 1]}`;
				logger.debug('[PASTE] got html, retrying raw url:', url);
				res = await fetch(url, GET_PASTE_FETCH_OPTIONS);
				if (!res.ok) {
					const err = new Error(`PASTE-GET ${res.status}: ${await res.text()}`);
					err.retryable = true;
					throw err;
				}
				if (res.headers.get('content-type')?.includes('text/html'))
					throw new Error('invalid paste: expected plaintext, got html');
			}
			return res.text();
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
