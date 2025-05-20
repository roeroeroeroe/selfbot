import { BASIC_USER } from '../fragments.js';

export const GET_VIDEO = `
query($id: ID!) {
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
						...BasicUserFragment
					}
				}
			}
		}
	}
}
${BASIC_USER}`;
