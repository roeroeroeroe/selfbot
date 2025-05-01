import request from './request.js';
import utils from '../../../utils/index.js';

const MAX_USERS_PER_REQUEST = 100;

async function getMany(userLogins, userIds) {
	let key, inputArray;
	if (userLogins?.length) {
		key = 'login';
		inputArray = userLogins;
	} else {
		key = 'id';
		inputArray = userIds;
	}
	if (!Array.isArray(inputArray)) inputArray = [inputArray];

	const userMap = new Map();
	for (const batch of utils.splitArray(inputArray, MAX_USERS_PER_REQUEST)) {
		const res = await request.send({
			endpoint: '/users',
			query: { [key]: batch },
		});

		for (const user of res.data) userMap.set(user[key], user);
	}

	return userMap;
}

export default {
	getMany,
};
