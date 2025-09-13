import utils from '../utils/index.js';
import metrics from './metrics/index.js';

const API_URL = 'https://api.wolframalpha.com/v1/result';
const UNIT_SYSTEMS = { METRIC: 'metric', IMPERIAL: 'imperial' };
const VALID_UNIT_SYSTEMS = new Set(Object.values(UNIT_SYSTEMS));

function wolframAlpha(input, unitSystem = UNIT_SYSTEMS.METRIC) {
	if (typeof input !== 'string' || !(input = input.trim()))
		throw new Error('input must be a non-empty string');
	if (!VALID_UNIT_SYSTEMS.has(unitSystem))
		throw new Error('invalid unit system');

	const apiKey = process.env.WOLFRAM_ALPHA_API_KEY;
	if (!apiKey)
		throw new Error("'WOLFRAM_ALPHA_API_KEY' environment variable is not set");

	const url = new URL(API_URL);
	url.searchParams.append('appid', apiKey);
	url.searchParams.append('i', input);
	url.searchParams.append('units', unitSystem);

	return utils.retry(
		async () => {
			let res;
			try {
				res = await fetch(url);
			} catch (err) {
				err.retryable = true;
				throw err;
			}
			if (res.status === 501) return 'no short answer available';
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

export default {
	UNIT_SYSTEMS,
	VALID_UNIT_SYSTEMS,

	query: wolframAlpha,
};
