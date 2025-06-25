import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

const MAX_TEAM_DESCRIPTION_LENGTH = 50;
const MAX_TEAM_DISPLAY_NAME_LENGTH = 50;

export default {
	name: 'team',
	aliases: [],
	description: 'get team info',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'teamName',
			short: 'n',
			long: 'name',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'target team',
		},
	],
	execute: async msg => {
		const teamName = msg.commandFlags.teamName || msg.args[0];
		if (!teamName) return { text: 'no team name provided', mention: true };

		let res;
		try {
			res = await twitch.gql.team.get(teamName);
		} catch (err) {
			logger.error('error getting team:', err);
			return { text: 'error getting team', mention: true };
		}
		const team = res.team;
		if (!team) return { text: 'team does not exist', mention: true };

		const responseParts = [
			utils.format.trim(team.displayName, MAX_TEAM_DISPLAY_NAME_LENGTH),
		];
		if (team.owner?.login)
			responseParts.push(
				`owner: ${utils.pickName(team.owner.login, team.owner.displayName)}`
			);
		const userEdges = team.members?.edges ?? [];
		const totalMembers = team.members?.totalCount || userEdges.length;
		responseParts.push(
			`${totalMembers} ${utils.format.plural(totalMembers, 'member')}`
		);
		if (team.description)
			responseParts.push(
				'description: ' +
					utils.format.trim(
						team.description.replace(/\s+/g, ' '),
						MAX_TEAM_DESCRIPTION_LENGTH
					)
			);
		if (!userEdges.length)
			return { text: utils.format.join(responseParts), mention: true };

		const list = [];
		let totalFollowers = 0,
			totalViewers = 0,
			liveMembers = 0;
		if (team.description) list.push(team.description + '\n');
		for (let i = 0; i < userEdges.length; i++) {
			const u = userEdges[i].node,
				parts = [utils.pickName(u.login, u.displayName)],
				followers = u.followers?.totalCount;
			if (followers) {
				parts.push(
					`${followers} ${utils.format.plural(followers, 'follower')}`
				);
				totalFollowers += followers;
			}
			if (u.stream) {
				const viewers = u.stream.viewersCount || 0;
				parts.push(
					`live (${viewers} ${utils.format.plural(viewers, 'viewer')})`
				);
				totalViewers += viewers;
				liveMembers++;
			}
			list.push(utils.format.join(parts));
		}
		if (totalFollowers)
			responseParts.push(`total followers: ${totalFollowers}`);
		if (liveMembers)
			responseParts.push(
				`live: ${liveMembers} (total viewers: ${totalViewers})`
			);
		try {
			responseParts.push(await paste.create(list.join('\n')));
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}
		return { text: utils.format.join(responseParts), mention: true };
	},
};
