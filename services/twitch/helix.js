import logger from '../logger.js';
import { splitArray } from '../../utils/utils.js';

const HELIX_URL = 'https://api.twitch.tv/helix';

const headers = {
	'Client-Id': '9uavest5z7knsvpbip19fxqkywxz3ec',
	'Content-Type': 'application/json',
};

export async function getUsers(logins, ids) {
	const isIdLookup = ids && ids.length;
	const key = isIdLookup ? 'id' : 'login';
	let inputArray = isIdLookup ? ids : logins;
	if (!Array.isArray(inputArray)) inputArray = [inputArray];

	const userMap = new Map();
	const batches = splitArray(inputArray, 100);
	logger.debug(
		`[HELIX] getUsers: getting ${inputArray.length} users (${batches.length} batches)`
	);
	for (let i = 0; i < batches.length; i++) {
		const res = await fetch(
			`${HELIX_URL}/users?${key}=${batches[i].join(`&${key}=`)}`,
			{ headers }
		);
		if (!res.ok) throw new Error(`request failed (${res.status})`);

		const body = await res.json();
		for (const user of body.data) userMap.set(user[key], user);
	}

	return userMap;
}
