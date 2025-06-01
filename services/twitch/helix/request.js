import helix from './index.js';
import utils from '../../../utils/index.js';
import logger from '../../logger.js';
import metrics from '../../metrics/index.js';

export default function send({
	endpoint,
	method = 'GET',
	query = {},
	body = null,
}) {
	const url = new URL(`${helix.API_BASE_URL}${endpoint}`);
	for (const k in query) {
		const v = query[k];
		if (Array.isArray(v))
			for (const value of v) url.searchParams.append(k, value);
		else url.searchParams.set(k, v);
	}

	const options = { method, headers: helix.HEADERS };
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
			if (res.status >= 400 && res.status < 500)
				throw new Error(`HELIX ${res.status}: ${await res.text()}`);

			if (!res.ok) {
				const err = new Error(`HELIX ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}

			const body = await res.json();
			logger.debug('[HELIX] got response:', body);
			return body;
		},
		{
			requestsCounter: metrics.names.counters.HELIX_REQUESTS_TX,
			retriesCounter: metrics.names.counters.HELIX_RETRIES,
			logLabel: 'HELIX',
		}
	);
}
