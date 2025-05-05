import config from '../config.json' with { type: 'json' };
import logger from './logger.js';
import utils from '../utils/index.js';

const REQUESTS_METRICS_COUNTER = 'hastebin_requests_sent';
const RETRIES_METRICS_COUNTER = 'hastebin_retries';

function constructRawUrl(url) {
	const parts = url.split('/');
	return `${parts.slice(0, parts.length - 1).join('/')}/raw/${parts[parts.length - 1]}`;
}

async function get(url) {
	logger.debug(`[HASTEBIN] getting paste: ${url}`);
	return utils.retry(
		async () => {
			let res = await fetch(url);
			if (res.status >= 400 && res.status < 500) {
				const err = new Error(
					`HASTEBIN GET ${res.status}: ${await res.text()}`
				);
				err.retryable = false;
				throw err;
			}
			if (!res.ok)
				throw new Error(`HASTEBIN GET ${res.status}: ${await res.text()}`);
			if (res.headers.get('content-type')?.includes('text/html')) {
				if (url.includes('/raw/')) {
					const err = new Error('invalid paste: expected plaintext, got html');
					err.retryable = false;
					throw err;
				}
				url = constructRawUrl(url);
				logger.debug('[HASTEBIN] got html, retrying raw url:', url);
				res = await fetch(url);
				if (!res.ok) throw new Error(`HASTEBIN GET ${res.status}`);
				if (res.headers.get('content-type')?.includes('text/html')) {
					const err = new Error('invalid paste: expected plaintext, got html');
					err.retryable = false;
					throw err;
				}
			}
			return await res.text();
		},
		{
			requestsCounter: REQUESTS_METRICS_COUNTER,
			retriesCounter: RETRIES_METRICS_COUNTER,
			logLabel: 'HASTEBIN-GET',
			canRetry: err => err.retryable !== false,
		}
	);
}

async function create(content, raw = true, instance = config.hastebinInstance) {
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
			if (res.status >= 400 && res.status < 500) {
				const err = new Error(
					`HASTEBIN CREATE ${res.status}: ${await res.text()}`
				);
				err.retryable = false;
				throw err;
			}
			if (!res.ok)
				throw new Error(`HASTEBIN CREATE ${res.status}: ${await res.text()}`);
			const body = await res.json();
			if (!body.key)
				throw new Error(
					`HASTEBIN CREATE: no key in body: ${JSON.stringify(body)}`
				);
			return raw ? `${instance}/raw/${body.key}` : `${instance}/${body.key}`;
		},
		{
			requestsCounter: REQUESTS_METRICS_COUNTER,
			retriesCounter: RETRIES_METRICS_COUNTER,
			logLabel: 'HASTEBIN-CREATE',
			canRetry: err => err.retryable !== false,
		}
	);
}

export default {
	get,
	create,
};
