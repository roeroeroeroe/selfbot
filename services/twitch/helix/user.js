import helix from './index.js';
import utils from '../../../utils/index.js';
import { MAX_USERS_PER_REQUEST, CONCURRENT_REQUESTS } from './constants.js';

const usersGroupSize = MAX_USERS_PER_REQUEST * CONCURRENT_REQUESTS;

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
	for (const group of utils.splitArray(inputArray, usersGroupSize))
		await Promise.all(
			utils.splitArray(group, helix.MAX_USERS_PER_REQUEST).map(async b => {
				const res = await helix.request({
					endpoint: '/users',
					query: { [key]: b },
				});

				for (let i = 0; i < res.data.length; i++) {
					const user = res.data[i];
					userMap.set(user[key], user);
				}
			})
		);

	return userMap;
}

export default {
	getMany,
};
