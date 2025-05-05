import request from './request.js';
import utils from '../../../utils/index.js';

const MAX_USERS_PER_REQUEST = 100;
const CONCURRENT_REQUESTS = 10;

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

	const groupSize = Math.min(
		MAX_USERS_PER_REQUEST * CONCURRENT_REQUESTS,
		inputArray.length
	);
	const userMap = new Map();
	for (const group of utils.splitArray(inputArray, groupSize))
		await Promise.all(
			utils.splitArray(group, MAX_USERS_PER_REQUEST).map(async b => {
				const res = await request.send({
					endpoint: '/users',
					query: { [key]: b },
				});

				for (const user of res.data) userMap.set(user[key], user);
			})
		);

	return userMap;
}

export default {
	getMany,
};
