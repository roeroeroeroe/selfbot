import gql from './index.js';
import metrics from '../../metrics/index.js';
import logger from '../../logger.js';
import utils from '../../../utils/index.js';

export default function send(body = {}) {
	const bodyString = JSON.stringify(body);
	logger.debug(`[GQL] ${gql.METHOD} ${gql.API_URL}:`, bodyString);
	return utils.retry(
		async () => {
			const res = await fetch(gql.API_URL, {
				method: gql.METHOD,
				headers: gql.HEADERS,
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
				metrics.counter.increment(metrics.names.counters.GQL_ERRORS);
				const err = new Error(`graphql errors: ${JSON.stringify(body.errors)}`);
				err.retryable = true;
				throw err;
			}

			logger.debug('[GQL] got response:', body);
			return body;
		},
		{
			requestsCounter: metrics.names.counters.GQL_REQUESTS_TX,
			retriesCounter: metrics.names.counters.GQL_RETRIES,
			logLabel: 'GQL',
		}
	);
}
