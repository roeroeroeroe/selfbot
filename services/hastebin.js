import config from '../config.json' with { type: 'json' };
import logger from './logger.js';

function constructRawUrl(url) {
	const parts = url.split('/');
	return `${parts.slice(0, parts.length - 1).join('/')}/raw/${parts[parts.length - 1]}`;
}

async function create(
	content,
	raw = false,
	instance = config.hastebinInstance
) {
	logger.debug(
		`[HASTEBIN] creating${raw ? ' raw' : ''} ${instance} paste:`,
		content
	);
	const res = await fetch(`${instance}/documents`, {
		method: 'POST',
		body: content,
	});
	if (!res.ok) throw new Error(`request failed (${res.status})`);

	const body = await res.json();
	if (!body.key) throw new Error(`no key in body: ${JSON.stringify(body)}`);

	return raw ? `${instance}/raw/${body.key}` : `${instance}/${body.key}`;
}

async function get(url) {
	logger.debug(`[HASTEBIN] getting paste: ${url}`);
	let res = await fetch(url);
	if (!res.ok) throw new Error(`request failed (${res.status})`);

	if (res.headers.get('content-type')?.includes('text/html')) {
		if (url.includes('/raw/'))
			throw new Error('invalid paste: expected plaintext, got html');
		url = constructRawUrl(url);
		logger.debug('[HASTEBIN] got html, retrying raw url:', url);
		res = await fetch(url);
		if (!res.ok) throw new Error(`request failed (${res.status})`);
		if (res.headers.get('content-type')?.includes('text/html'))
			throw new Error('invalid paste: expected plaintext, got html');
	}

	return res.text();
}

export default {
	create,
	get,
};
