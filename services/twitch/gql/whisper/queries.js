import { DEFAULT_PAGE_SIZE } from '../constants.js';
import { BASIC_USER } from '../fragments.js';

export const GET_WHISPER_THREADS = `
query($cursor: Cursor) {
	currentUser {
		whisperThreads(first: ${DEFAULT_PAGE_SIZE} after: $cursor) {
			edges {
				cursor
				node {
					id
					participants {
						...BasicUserFragment
					}
				}
			}
		}
	}
}
${BASIC_USER}`;

export const GET_WHISPER_THREAD_MESSAGES = `
query($id: ID $cursor: Cursor) {
	whisperThread(id: $id) {
		messages(first: ${DEFAULT_PAGE_SIZE} after: $cursor) {
			edges {
				cursor
				node {
					id
					nonce
					sentAt
					from {
						...BasicUserFragment
					}
					content {
						content
					}
				}
			}
		}
	}
}
${BASIC_USER}`;
