import logger from '../../logger.js';

const GQL_URL = 'https://gql.twitch.tv/gql';
const METHOD = 'POST';
const MAX_OPERATIONS_PER_REQUEST = 35;
const HEADERS = {
	'Client-Id': process.env.TWITCH_ANDROID_CLIENT_ID,
	'Authorization': `OAuth ${process.env.TWITCH_ANDROID_TOKEN}`,
	'Content-Type': 'application/json',
};

async function gql(body = {}) {
	const bodyString = JSON.stringify(body);
	logger.debug(
		`[GQL] sending request: ${METHOD} ${GQL_URL}, body: ${bodyString}`
	);
	const res = await fetch(GQL_URL, {
		method: METHOD,
		headers: HEADERS,
		body: bodyString,
	});
	if (!res.ok) throw new Error(`GQL request failed: ${await res.text()}`);

	const responseBody = await res.json();
	logger.debug(`[GQL] got response:`, responseBody);
	return responseBody;
}

export default {
	MAX_OPERATIONS_PER_REQUEST,

	send: gql,
};
