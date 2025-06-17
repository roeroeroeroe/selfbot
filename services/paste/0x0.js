import config from '../../config.json' with { type: 'json' };
import logger from '../logger.js';
import utils from '../../utils/index.js';
import metrics from '../metrics/index.js';
import { UAG, BLOB_OPTIONS } from './constants.js';

function create(text) {
	if (typeof text !== 'string' || !text)
		throw new Error('must be a non-empty string');
	if (config.paste.maxLength)
		text = utils.format.trim(text, config.paste.maxLength);
	logger.debug(`[0x0] creating ${config.paste.nullPtr.instance} paste:`, text);
	const form = new FormData();
	form.append('file', new Blob([text], BLOB_OPTIONS));
	if (config.paste.nullPtr.secret) form.append('secret', '');
	const fetchOptions = {
		method: 'POST',
		body: form,
		headers: { 'User-Agent': UAG },
	};
	return utils.retry(
		async () => {
			const res = await fetch(config.paste.nullPtr.instance, fetchOptions);
			if (res.status >= 400 && res.status < 500)
				throw new Error(`0x0-CREATE ${res.status}: ${res.statusText}`);
			if (!res.ok) {
				const err = new Error(`0x0-CREATE ${res.status}: ${await res.text()}`);
				err.retryable = true;
				throw err;
			}
			const url = await res.text();
			if (!utils.isValidHttpUrl(url)) {
				const err = new Error(`0x0-CREATE: not a valid http URL: ${url}`);
				err.retryable = true;
				throw err;
			}
			return url;
		},
		{
			requestsCounter: metrics.names.counters.PASTE_REQUESTS_TX,
			retriesCounter: metrics.names.counters.PASTE_RETRIES,
			logLabel: '0x0-CREATE',
		}
	);
}

export default {
	create,
};
