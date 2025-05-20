import * as queries from './queries.js';
import gql from '../index.js';

async function getStream(channelLogin) {
	const res = await gql.request({
		query: queries.GET_STREAM,
		variables: { login: channelLogin },
	});

	return res.data;
}

export default {
	queries,

	get: getStream,
};
