import * as queries from './queries.js';
import gql from '../index.js';

async function getWhisperThreads(limit = gql.DEFAULT_PAGINATION_LIMIT) {
	if (limit > gql.MAX_PAGINATION_LIMIT) limit = gql.MAX_PAGINATION_LIMIT;
	const whisperThreads = [];
	const variables = { cursor: null };

	do {
		const res = await gql.request({
			query: queries.GET_WHISPER_THREADS,
			variables,
		});
		const edges = res.data.currentUser?.whisperThreads?.edges;
		if (!edges?.length) break;

		for (let i = 0; i < edges.length; whisperThreads.push(edges[i++].node));
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor && whisperThreads.length < limit);

	return whisperThreads;
}

// we avoid relying on the thread ID format (e.g., "botId_userId") in case it
// changes in the future
async function findWhisperThread(
	userLogin,
	limit = gql.DEFAULT_PAGINATION_LIMIT
) {
	if (limit > gql.MAX_PAGINATION_LIMIT) limit = gql.MAX_PAGINATION_LIMIT;
	const variables = { cursor: null };

	let thread = null,
		c = 0;
	paging: do {
		const res = await gql.request({
			query: queries.GET_WHISPER_THREADS,
			variables,
		});
		const edges = res.data.currentUser?.whisperThreads?.edges;
		if (!edges?.length) break;

		for (let i = 0; i < edges.length; i++) {
			const t = edges[i].node;
			if (t.participants.some(u => u.login === userLogin)) {
				thread = t;
				break paging;
			}
		}
		variables.cursor = edges[edges.length - 1].cursor;
		c += edges.length;
	} while (variables.cursor && c < limit);

	return thread;
}

async function getWhisperThreadMessages(
	threadId,
	limit = gql.DEFAULT_PAGINATION_LIMIT
) {
	if (limit > gql.MAX_PAGINATION_LIMIT) limit = gql.MAX_PAGINATION_LIMIT;
	const whisperMessages = [];
	const variables = { id: threadId, cursor: null };

	do {
		const res = await gql.request({
			query: queries.GET_WHISPER_THREAD_MESSAGES,
			variables,
		});
		const edges = res.data.whisperThread?.messages?.edges;
		if (!edges?.length) break;

		for (let i = 0; i < edges.length; whisperMessages.push(edges[i++].node));
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor && whisperMessages.length < limit);

	return whisperMessages;
}

export default {
	getThreads: getWhisperThreads,
	findThread: findWhisperThread,
	getThreadMessages: getWhisperThreadMessages,
};
