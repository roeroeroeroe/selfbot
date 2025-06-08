import * as queries from './queries.js';
import gql from '../index.js';

async function getTeam(teamName) {
	const userEdges = [];
	const variables = { name: teamName, cursor: null };
	let res;
	do {
		res = await gql.request({ query: queries.GET_TEAM, variables });
		const edges = res.data?.team?.members?.edges;
		if (!edges?.length) break;
		for (let i = 0; i < edges.length; i++) {
			const e = edges[i];
			if (e.node?.login) userEdges.push(e);
		}
		variables.cursor = edges[edges.length - 1].cursor;
	} while (variables.cursor);
	if (userEdges.length && res.data.team?.members)
		res.data.team.members.edges = userEdges;

	return res.data;
}

export default {
	get: getTeam,
};
