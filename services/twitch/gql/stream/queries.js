import { BASIC_USER } from '../fragments.js';

export const GET_STREAM = `
query($login: String!) {
	user(login: $login lookupType: ALL) {
		...BasicUserFragment
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
}
${BASIC_USER}`;
