import request from './request.js';
import utils from '../../../utils/index.js';

const MAX_USERS_PER_REQUEST = 100;

async function getMany(userLogins, userIds) {
	const isIdLookup = userIds && userIds.length;
	const key = isIdLookup ? 'id' : 'login';
	let inputArray = isIdLookup ? userIds : userLogins;
	if (!Array.isArray(inputArray)) inputArray = [inputArray];

	const userMap = new Map();
	const batches = utils.splitArray(inputArray, MAX_USERS_PER_REQUEST);

	for (let i = 0; i < batches.length; i++) {
		const res = await request.send({
			endpoint: '/users',
			query: { [key]: batches[i] },
		});

		for (const user of res.data) userMap.set(user[key], user);
	}

	return userMap;
}

export default {
	getMany,
};
