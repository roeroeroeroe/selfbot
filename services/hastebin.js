import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import utils from '../utils/index.js';
import metrics from './metrics/index.js';

function constructRawUrl(url) {
	const parts = url.split('/');
	return `${parts.slice(0, parts.length - 1).join('/')}/raw/${parts[parts.length - 1]}`;
}

function get(url) {
	logger.debug(`[HASTEBIN] getting paste: ${url}`);
	return utils.retry(
		async () => {
			let res = await fetch(url);
			if (res.status >= 400 && res.status < 500)
				throw new Error(`HASTEBIN GET ${res.status}: ${res.statusText}`);
			if (!res.ok)
				throw new Error(`HASTEBIN GET ${res.status}: ${await res.text()}`);
			if (res.headers.get('content-type')?.includes('text/html')) {
				if (url.includes('/raw/'))
					throw new Error('invalid paste: expected plaintext, got html');
				url = constructRawUrl(url);
				logger.debug('[HASTEBIN] got html, retrying raw url:', url);
				res = await fetch(url);
				if (!res.ok)
					throw new Error(`HASTEBIN GET ${res.status}: ${await res.text()}`);
				if (res.headers.get('content-type')?.includes('text/html'))
					throw new Error('invalid paste: expected plaintext, got html');
			}
			return res.text();
		},
		{
			requestsCounter: metrics.names.counters.HASTEBIN_REQUESTS_TX,
			retriesCounter: metrics.names.counters.HASTEBIN_RETRIES,
			logLabel: 'HASTEBIN-GET',
		}
	);
}

function create(
	content,
	raw = true,
	instance = config.hastebin.instance,
	maxLength = config.hastebin.maxPasteLength
) {
	if (typeof content !== 'string' || !content)
		throw new Error('content must be a non-empty string');
	if (maxLength) content = utils.format.trim(content, maxLength);
	logger.debug(
		`[HASTEBIN] creating${raw ? ' raw' : ''} ${instance} paste:`,
		content
	);
	return utils.retry(
		async () => {
			const res = await fetch(`${instance}/documents`, {
				method: 'POST',
				body: content,
			});
			if (res.status >= 400 && res.status < 500)
				throw new Error(`HASTEBIN CREATE ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(
					`HASTEBIN CREATE ${res.status}: ${await res.text()}`
				);
				err.retryable = true;
				throw err;
			}
			const body = await res.json();
			if (!body.key) {
				const err = new Error(
					`HASTEBIN CREATE: no key in body: ${JSON.stringify(body)}`
				);
				err.retryable = true;
				throw err;
			}
			return raw ? `${instance}/raw/${body.key}` : `${instance}/${body.key}`;
		},
		{
			requestsCounter: metrics.names.counters.HASTEBIN_REQUESTS_TX,
			retriesCounter: metrics.names.counters.HASTEBIN_RETRIES,
			logLabel: 'HASTEBIN-CREATE',
		}
	);
}

export default {
	get,
	create,
};
