import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'roles',
	aliases: [],
	description: "get channel's community roles",
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: '',
			description: 'lookup channel (default: current channel)',
		},
		{
			name: 'timeout',
			aliases: ['t', 'timeout'],
			type: 'duration',
			required: false,
			defaultValue: 10000,
			description:
				'timeout for individual role (default: 10s, min: 1s, max: 1m)',
			validator: v => v >= 1000 && v <= 60000,
		},
		{
			name: 'maxMods',
			aliases: ['m', 'max-mods'],
			type: 'number',
			required: false,
			defaultValue: 1000,
			description:
				'stop after getting N mods (default: 1000, min: 100, max: 50000)',
			validator: v => v >= 100 && v <= 50000,
		},
	],
	execute: async msg => {
		const channel = {};
		const input = msg.commandFlags.channel || msg.args[0];
		if (input) {
			try {
				const user = await twitch.gql.user.resolve(input);
				if (!user)
					return { text: `channel ${input} does not exist`, mention: true };
				channel.id = user.id;
				channel.login = user.login;
			} catch (err) {
				logger.error(`error resolving user ${input}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else {
			channel.id = msg.channelID;
			channel.login = msg.channelName;
		}

		// prettier-ignore
		const results = await Promise.allSettled([
			utils.withTimeout(twitch.gql.channel.getMods(channel.login, msg.commandFlags.maxMods), msg.commandFlags.timeout),
			utils.withTimeout(twitch.gql.channel.getVips(channel.login), msg.commandFlags.timeout),
			utils.withTimeout(twitch.gql.channel.getFounders(channel.login), msg.commandFlags.timeout),
			utils.withTimeout(twitch.gql.channel.getArtists(channel.id), msg.commandFlags.timeout),
		]);
		const [modsData, vipsData, foundersData, artistsData] = results.map(res =>
			res.status === 'fulfilled' ? res.value : undefined
		);

		const list = [];
		const responseParts = [];

		if (modsData?.length) {
			const { lines: modsList, activeCount } = processRoles(modsData, {
				prefixActive: true,
				activeKey: 'isActive',
			});
			if (modsList.length) {
				const modsInfo = `${modsList.length} ${utils.format.plural(modsList.length, 'mod')} (${activeCount} currently in chat)`;
				list.push(`${modsInfo}:\n`);
				responseParts.push(modsInfo);
				for (const line of modsList) list.push(line);
			}
		}

		if (vipsData?.length) {
			const { lines: vipsList } = processRoles(vipsData);
			if (vipsList.length) {
				const vipsInfo = `${vipsList.length} ${utils.format.plural(vipsList.length, 'vip')}`;
				list.push(`${list.length ? '\n' : ''}${vipsInfo}:\n`);
				responseParts.push(vipsInfo);
				for (const line of vipsList) list.push(line);
			}
		}

		if (foundersData?.length) {
			const { lines: foundersList, activeCount: subscribedCount } =
				processRoles(foundersData, {
					prefixActive: true,
					activeKey: 'isSubscribed',
				});
			if (foundersList.length) {
				const foundersInfo = `${foundersList.length} ${utils.format.plural(foundersList.length, 'founder')} (${subscribedCount} currently subscribed)`;
				list.push(`${list.length ? '\n' : ''}${foundersInfo}:\n`);
				responseParts.push(foundersInfo);
				for (const line of foundersList) list.push(line);
			}
		}

		if (artistsData?.artists?.edges.length) {
			const { lines: artistsList } = processRoles(artistsData.artists.edges);
			if (artistsList.length) {
				const artistsInfo = `${artistsList.length} ${utils.format.plural(artistsList.length, 'artist')}`;
				list.push(`${list.length ? '\n' : ''}${artistsInfo}:\n`);
				responseParts.push(artistsInfo);
				for (const line of artistsList) list.push(line);
			}
		}

		if (!list.length)
			return {
				text: `there are 0 users with community roles in #${channel.login}`,
				mention: true,
			};

		try {
			const link = await hastebin.create(utils.format.align(list));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

function processRoles(
	data,
	{ prefixActive = false, timeKey = 'grantedAt', activeKey = 'isActive' } = {}
) {
	let activeCount = 0;
	const lines = [];
	for (const edge of data) {
		if (!edge.node?.login) continue;
		let prefix = '';
		if (prefixActive && edge[activeKey]) {
			activeCount++;
			prefix = '* ';
		}
		lines.push(
			`${prefix}${utils.getEffectiveName(edge.node.login, edge.node.displayName)}__ALIGN__granted at: ${utils.date.format(edge[timeKey])}`
		);
	}

	return { lines, activeCount };
}
