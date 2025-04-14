import logger from '../../logger.js';

const HELIX_BASE_URL = 'https://api.twitch.tv/helix';
const HEADERS = {
	'Client-Id': '9uavest5z7knsvpbip19fxqkywxz3ec',
	'Content-Type': 'application/json',
};

async function helix({ endpoint, method = 'GET', query = {}, body = null }) {
	const url = new URL(`${HELIX_BASE_URL}${endpoint}`);
	for (const k in query) {
		const v = query[k];
		if (Array.isArray(v))
			for (const value of v) url.searchParams.append(k, value);
		else url.searchParams.set(k, v);
	}

	const options = {
		method,
		headers: HEADERS,
	};
	let bodyString;
	if (body) {
		bodyString = JSON.stringify(body);
		options.body = bodyString;
	}

	logger.debug(
		`[HELIX] sending request: ${method} ${url}${bodyString ? `, body: ${bodyString}` : ''}`
	);
	const res = await fetch(url, options);
	if (!res.ok)
		throw new Error(`request failed (${res.status}): ${await res.text()}`);

	const responseBody = await res.json();
	logger.debug(`[HELIX] got response:`, responseBody);
	return responseBody;
}

export default {
	send: helix,
};
