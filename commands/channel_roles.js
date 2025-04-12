import logger from '../services/logger.js';
import { createPaste } from '../services/hastebin.js';
import { getEffectiveName, withTimeout } from '../utils/utils.js';
import {
	joinResponseParts,
	alignLines,
	toPlural,
	formatDate,
} from '../utils/formatters.js';
import {
	resolveUser,
	getMods,
	getVips,
	getFounders,
	getArtists,
} from '../services/twitch/gql.js';

export default {
	name: 'roles',
	aliases: [],
	description: "get channel's community roles",
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
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
				const user = await resolveUser(input);
				if (!user)
					return {
						text: `channel ${input} does not exist`,
						mention: true,
					};
				channel.id = user.id;
				channel.login = user.login;
			} catch (err) {
				logger.error(`error resolving user ${input}:`, err);
				return { text: `error resolving channel ${input}`, mention: true };
			}
		} else {
			channel.id = msg.channelID;
			channel.login = msg.channelName;
		}

		let modsData, vipsData, foundersData, artistsData;
		const results = await Promise.allSettled([
			withTimeout(
				getMods(channel.login, msg.commandFlags.maxMods),
				msg.commandFlags.timeout
			),
			withTimeout(getVips(channel.login), msg.commandFlags.timeout),
			withTimeout(getFounders(channel.login), msg.commandFlags.timeout),
			withTimeout(getArtists(channel.id), msg.commandFlags.timeout),
		]);
		[modsData, vipsData, foundersData, artistsData] = results.map(res =>
			res.status === 'fulfilled' ? res.value : undefined
		);

		const list = [];
		const messageParts = [];

		if (modsData?.length > 0) {
			const { lines: modsList, activeCount } = processRoles(modsData, {
				prefixActive: true,
				activeKey: 'isActive',
			});
			if (modsList.length) {
				const modsInfo = `${modsList.length} ${toPlural(modsList.length, 'mod')} (${activeCount} currently in chat)`;
				list.push(`${modsInfo}:\n`);
				messageParts.push(modsInfo);
				for (const line of modsList) list.push(line);
			}
		}

		if (vipsData?.length > 0) {
			const { lines: vipsList } = processRoles(vipsData);
			if (vipsList.length) {
				const vipsInfo = `${vipsList.length} ${toPlural(vipsList.length, 'vip')}`;
				list.push(`${list.length ? '\n' : ''}${vipsInfo}:\n`);
				messageParts.push(vipsInfo);
				for (const line of vipsList) list.push(line);
			}
		}

		if (foundersData?.length > 0) {
			const { lines: foundersList, activeCount: subscribedCount } =
				processRoles(foundersData, {
					prefixActive: true,
					activeKey: 'isSubscribed',
				});
			if (foundersList.length) {
				const foundersInfo = `${foundersList.length} ${toPlural(foundersList.length, 'founder')} (${subscribedCount} currently subscribed)`;
				list.push(`${list.length ? '\n' : ''}${foundersInfo}:\n`);
				messageParts.push(foundersInfo);
				for (const line of foundersList) list.push(line);
			}
		}

		if (artistsData?.artists?.edges.length > 0) {
			const { lines: artistsList } = processRoles(artistsData.artists.edges);
			if (artistsList.length) {
				const artistsInfo = `${artistsList.length} ${toPlural(artistsList.length, 'artist')}`;
				list.push(`${list.length ? '\n' : ''}${artistsInfo}:\n`);
				messageParts.push(artistsInfo);
				for (const line of artistsList) list.push(line);
			}
		}

		if (!list.length)
			return {
				text: `there are 0 users with community roles in #${channel.login}`,
				mention: true,
			};

		try {
			const link = await createPaste(alignLines(list), true);
			messageParts.push(link);
			return { text: joinResponseParts(messageParts), mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			messageParts.push('error creating paste');
			return { text: joinResponseParts(messageParts), mention: true };
		}
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
			`${prefix}${getEffectiveName(edge.node.login, edge.node.displayName)}__ALIGN__granted at: ${formatDate(edge[timeKey])}`
		);
	}

	return { lines, activeCount };
}
