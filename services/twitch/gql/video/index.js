import * as queries from './queries.js';
import gql from '../index.js';

async function getVideo(videoId) {
	const res = await gql.request({
		query: queries.GET_VIDEO,
		variables: { id: videoId },
	});

	return res.data;
}

export default {
	queries,

	get: getVideo,
};
