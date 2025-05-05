import config from '../../../config.json' with { type: 'json' };
import utils from '../../../utils/index.js';
import logger from '../../logger.js';

const REQUESTS_METRICS_COUNTER = 'helix_requests_sent';
const RETRIES_METRICS_COUNTER = 'helix_retries';

const HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const HEADERS = {
	'Client-Id': '9uavest5z7knsvpbip19fxqkywxz3ec',
	'Content-Type': 'application/json',
};

async function helix({ endpoint, method = 'GET', query = {}, body = null }) {
	const url = new URL(`${HELIX_BASE_URL}${endpoint}`);
	for (const k in query) {
		const v = query[k];
		if (Array.isArray(v))
			for (const value of v) url.searchParams.append(k, value);
		else url.searchParams.set(k, v);
	}

	const options = { method, headers: HEADERS };
	let bodyString;
	if (body) {
		bodyString = JSON.stringify(body);
		options.body = bodyString;
	}

	logger.debug(
		`[HELIX] ${method} ${url}${bodyString ? `, body: ${bodyString}` : ''}`
	);
	return utils.retry(
		async () => {
			const res = await fetch(url, options);
			if (res.status >= 400 && res.status < 500) {
				const err = new Error(`HELIX ${res.status}: ${await res.text()}`);
				err.retryable = false;
				throw err;
			}
			if (!res.ok) throw new Error(`HELIX ${res.status}: ${await res.text()}`);

			const body = await res.json();
			logger.debug('[HELIX] got response:', body);
			return body;
		},
		{
			requestsCounter: REQUESTS_METRICS_COUNTER,
			retriesCounter: RETRIES_METRICS_COUNTER,
			logLabel: 'HELIX',
			canRetry: err => err.retryable !== false,
		}
	);
}

export default {
	send: helix,
};
