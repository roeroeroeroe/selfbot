import utils from '../utils/index.js';
import metrics from './metrics/index.js';

const API_URL = 'https://api.wolframalpha.com/v1/result';

export default function wolframAlpha(input) {
	if (typeof input !== 'string' || !(input = input.trim()))
		throw new Error('input must be a non-empty string');

	const apiKey = process.env.WOLFRAM_ALPHA_API_KEY;
	if (!apiKey)
		throw new Error("'WOLFRAM_ALPHA_API_KEY' environment variable is not set");

	const url = new URL(API_URL);
	url.searchParams.append('appid', apiKey);
	url.searchParams.append('i', input);

	return utils.retry(
		async () => {
			const res = await fetch(url);
			if (res.status === 501) throw new Error('no short answer available');
			if (res.status >= 400 && res.status < 500)
				throw new Error(`WOLFRAM ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(`WOLFRAM ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}
			return res.text();
		},
		{
			requestsCounter: metrics.names.counters.WOLFRAM_REQUESTS_TX,
			retriesCounter: metrics.names.counters.WOLFRAM_RETRIES,
			logLabel: 'WOLFRAM',
		}
	);
}
