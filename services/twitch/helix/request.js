import utils from '../../../utils/index.js';
import logger from '../../logger.js';
import metrics from '../../metrics.js';

const REQUESTS_METRICS_COUNTER = 'helix_requests_sent';
const RETRIES_METRICS_COUNTER = 'helix_retries';
metrics.counter.create(REQUESTS_METRICS_COUNTER);
metrics.counter.create(RETRIES_METRICS_COUNTER);

const HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const HEADERS = {
	'Client-Id': '9uavest5z7knsvpbip19fxqkywxz3ec',
	'Content-Type': 'application/json',
};

async function helix(
	{ endpoint, method = 'GET', query = {}, body = null },
	{ maxRetries = 3, baseDelay = 200 } = {}
) {
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

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (attempt > 0) {
			const backoff =
				baseDelay * 2 ** (attempt - 1) * (1 + Math.random() * 0.5);
			logger.debug(
				`[HELIX] retry ${attempt}, backing off ${Math.round(backoff)}ms`
			);
			await utils.sleep(backoff);
			metrics.counter.increment(RETRIES_METRICS_COUNTER);
		}

		logger.debug(
			`[HELIX] attempt ${attempt + 1}: ${method} ${url}${bodyString ? `, body: ${bodyString}` : ''}`
		);
		metrics.counter.increment(REQUESTS_METRICS_COUNTER);
		let res;
		try {
			res = await fetch(url, options);
		} catch (err) {
			logger.warning(`[HELIX] network error on attempt ${attempt + 1}:`, err);
			if (attempt === maxRetries) throw err;
			continue;
		}
		if (!res.ok) {
			const err = new Error(`HELIX ${res.status}: ${await res.text()}`);
			if (res.status >= 400 && res.status < 500) throw err;

			logger.warning(`[HELIX] server error on attempt ${attempt + 1}:`, err);
			if (attempt === maxRetries) throw err;
		}

		const body = await res.json();
		logger.debug(`[HELIX] got response:`, body);
		return body;
	}
}

export default {
	send: helix,
};
