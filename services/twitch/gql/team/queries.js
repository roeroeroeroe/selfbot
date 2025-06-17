import { BASIC_USER } from '../fragments.js';

export const GET_TEAM = `
query($name: String! $cursor: Cursor) {
	team(name: $name) {
		backgroundImageURL
		bannerURL
		logoURL
		description
		displayName
		owner {
			...BasicUserFragment
		}
		members(first: 100 after: $cursor) {
			totalCount
			edges {
				cursor
				node {
					...BasicUserFragment
					followers(first: 1) {
						totalCount
					}
					stream {
						viewersCount
					}
				}
			}
		}
	}
}
${BASIC_USER}`;
