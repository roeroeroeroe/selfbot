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
			for (let i = 0; i < v.length; url.searchParams.append(k, v[i++]));
		else url.searchParams.set(k, v);
	}

	const options = { method, headers: helix.HEADERS };
	if (body) options.body = JSON.stringify(body);

	logger.debug(`[HELIX] ${method} ${url}`);
	return utils.retry(
		async () => {
			let res;
			try {
				res = await fetch(url, options);
			} catch (err) {
				err.retryable = true;
				throw err;
			}
			if (res.status >= 400 && res.status < 500)
				throw new Error(`HELIX ${res.status}: ${await res.text()}`);

			if (!res.ok) {
				const err = new Error(`HELIX ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}

			return res.json();
		},
		{
			requestsCounter: metrics.names.counters.HELIX_REQUESTS_TX,
			retriesCounter: metrics.names.counters.HELIX_RETRIES,
			logLabel: 'HELIX',
		}
	);
}
