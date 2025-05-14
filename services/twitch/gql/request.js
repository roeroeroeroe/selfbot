import metrics from '../../metrics.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

const REQUESTS_METRICS_COUNTER = 'gql_requests_sent';
const RETRIES_METRICS_COUNTER = 'gql_retries';
const ERRORS_METRICS_COUNTER = 'gql_graphql_errors';
metrics.counter.create(ERRORS_METRICS_COUNTER);

const GQL_URL = 'https://gql.twitch.tv/gql';
const METHOD = 'POST';
const MAX_OPERATIONS_PER_REQUEST = 35;
const HEADERS = {
	'Client-Id': process.env.TWITCH_ANDROID_CLIENT_ID,
	'Authorization': `OAuth ${process.env.TWITCH_ANDROID_TOKEN}`,
	'Content-Type': 'application/json',
};

export async function gql(body = {}) {
	const bodyString = JSON.stringify(body);
	logger.debug(`[GQL] ${METHOD} ${GQL_URL}:`, bodyString);
	return utils.retry(
		async () => {
			const res = await fetch(GQL_URL, {
				method: METHOD,
				headers: HEADERS,
				body: bodyString,
			});
			if (res.status >= 400 && res.status < 500)
				throw new Error(`GQL ${res.status}: ${await res.text()}`);
			if (!res.ok) {
				const err = new Error(`GQL ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}

			const body = await res.json();
			if (Array.isArray(body.errors) && body.errors.length) {
				metrics.counter.increment(ERRORS_METRICS_COUNTER);
				const err = new Error(`graphql errors: ${JSON.stringify(body.errors)}`);
				err.retryable = true;
				throw err;
			}

			logger.debug('[GQL] got response:', body);
			return body;
		},
		{
			requestsCounter: REQUESTS_METRICS_COUNTER,
			retriesCounter: RETRIES_METRICS_COUNTER,
			logLabel: 'GQL',
		}
	);
}

export default {
	MAX_OPERATIONS_PER_REQUEST,

	send: gql,
};
