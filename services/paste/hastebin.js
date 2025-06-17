import config from '../../config.json' with { type: 'json' };
import logger from '../logger.js';
import utils from '../../utils/index.js';
import metrics from '../metrics/index.js';

function create(text) {
	if (typeof text !== 'string' || !text)
		throw new Error('must be a non-empty string');
	if (config.paste.maxLength)
		text = utils.format.trim(text, config.paste.maxLength);
	const { instance, raw } = config.paste.hastebin;
	logger.debug(`[HASTEBIN] creating ${instance} paste:`, text);
	return utils.retry(
		async () => {
			const res = await fetch(`${instance}/documents`, {
				method: 'POST',
				body: text,
			});
			if (res.status >= 400 && res.status < 500)
				throw new Error(`HASTEBIN-CREATE ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(
					`HASTEBIN-CREATE ${res.status}: ${await res.text()}`
				);
				err.retryable = true;
				throw err;
			}
			const body = await res.json();
			if (!body.key) {
				const err = new Error(
					`HASTEBIN-CREATE: no key in body: ${JSON.stringify(body)}`
				);
				err.retryable = true;
				throw err;
			}
			return raw
				? `${instance}/raw/${body.key}`
				: `${instance}/${body.key}.txt`;
		},
		{
			requestsCounter: metrics.names.counters.PASTE_REQUESTS_TX,
			retriesCounter: metrics.names.counters.PASTE_RETRIES,
			logLabel: 'HASTEBIN-CREATE',
		}
	);
}

export default {
	create,
};
