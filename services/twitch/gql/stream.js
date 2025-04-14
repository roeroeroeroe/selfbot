import request from './request.js';

async function getStream(channelLogin) {
	const res = await request.send({
		query: `query($login: String!) {
			user(login: $login lookupType: ALL) {
				login
				id
				displayName
				lastBroadcast {
					startedAt
				}
				videos(first: 1 types: ARCHIVE sort: TIME) {
					edges {
						node {
							id
						}
					}
				}
				broadcastSettings {
					game {
						displayName
					}
					isMature
					title
				}
				stream {
					codec
					id
					createdAt
					viewersCount
					averageFPS
					bitrate
					language
					clipCount
					width
					height
					previewImageURL(width: 1920 height: 1080)
					freeformTags {
						name
					}
					game {
						displayName
					}
				}
			}
		}`,
		variables: { login: channelLogin },
	});

	return res.data;
}

export default {
	get: getStream,
};
