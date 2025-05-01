import utils from '../../../utils/index.js';
import logger from '../../logger.js';
import metrics from '../../metrics.js';

const REQUESTS_METRICS_COUNTER = 'gql_requests_sent';
const RETRIES_METRICS_COUNTER = 'gql_retries';
const ERRORS_METRICS_COUNTER = 'gql_graphql_errors';
metrics.counter.create(REQUESTS_METRICS_COUNTER);
metrics.counter.create(RETRIES_METRICS_COUNTER);
metrics.counter.create(ERRORS_METRICS_COUNTER);

const GQL_URL = 'https://gql.twitch.tv/gql';
const METHOD = 'POST';
const MAX_OPERATIONS_PER_REQUEST = 35;
const HEADERS = {
	'Client-Id': process.env.TWITCH_ANDROID_CLIENT_ID,
	'Authorization': `OAuth ${process.env.TWITCH_ANDROID_TOKEN}`,
	'Content-Type': 'application/json',
};

async function gql(body = {}, { maxRetries = 3, baseDelay = 200 } = {}) {
	const bodyString = JSON.stringify(body);
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (attempt > 0) {
			const backoff =
				baseDelay * 2 ** (attempt - 1) * (1 + Math.random() * 0.5);
			logger.debug(
				`[GQL] retry ${attempt}, backing off ${Math.round(backoff)}ms`
			);
			await utils.sleep(backoff);
			metrics.counter.increment(RETRIES_METRICS_COUNTER);
		}

		logger.debug(
			`[GQL] attempt ${attempt + 1}: ${METHOD} ${GQL_URL}, body:`,
			bodyString
		);
		metrics.counter.increment(REQUESTS_METRICS_COUNTER);
		let res;
		try {
			res = await fetch(GQL_URL, {
				method: METHOD,
				headers: HEADERS,
				body: bodyString,
			});
		} catch (err) {
			logger.warning(`[GQL] network error on attempt ${attempt + 1}:`, err);
			if (attempt === maxRetries) throw err;
			continue;
		}
		if (!res.ok) {
			const err = new Error(`GQL ${res.status}: ${await res.text()}`);
			if (res.status >= 400 && res.status < 500) throw err;

			logger.warning(`[GQL] server error on attempt ${attempt + 1}:`, err);
			if (attempt === maxRetries) throw err;
		}

		const body = await res.json();
		if (Array.isArray(body.errors) && body.errors.length) {
			metrics.counter.increment(ERRORS_METRICS_COUNTER);
			const gqlErr = new Error(
				`graphql errors: ${JSON.stringify(body.errors)}`
			);
			logger.warning(
				`[GQL] graphql errors on attempt ${attempt + 1}:`,
				body.errors
			);
			if (attempt === maxRetries) throw gqlErr;
			continue;
		}

		logger.debug(`[GQL] got response:`, body);
		return body;
	}
}

export default {
	MAX_OPERATIONS_PER_REQUEST,

	send: gql,
};
