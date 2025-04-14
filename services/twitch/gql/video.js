import request from './request.js';

async function getVideo(videoId) {
	const res = await request.send({
		query: `query($id: ID!) {
			video(id: $id) {
				createdAt
				viewCount
				lengthSeconds
				title
				topClips(first: 1) {
					edges {
						node {
							title
							url
							videoOffsetSeconds
							viewCount
							isFeatured
							curator {
								login
								id
								displayName
							}
						}
					}
				}
			}
		}`,
		variables: { id: videoId },
	});

	return res.data;
}

export default {
	get: getVideo,
};
