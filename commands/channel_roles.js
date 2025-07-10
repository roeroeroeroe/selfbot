import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const ACTIVE_PREFIX = '* ';

export default {
	name: 'roles',
	aliases: [],
	description: "get channel's community roles",
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'target channel (default: current channel)',
		},
		{
			name: 'timeout',
			short: 't',
			long: 'timeout',
			type: 'duration',
			required: false,
			defaultValue: 10000,
			description:
				'timeout for individual role (default: 10s, min: 1s, max: 1m)',
			validator: v => v >= 1000 && v <= 60000,
		},
		{
			name: 'maxMods',
			short: 'm',
			long: 'max-mods',
			type: 'int',
			required: false,
			defaultValue: twitch.gql.DEFAULT_PAGINATION_LIMIT,
			description:
				'stop after getting N mods ' +
				`(default: ${twitch.gql.DEFAULT_PAGINATION_LIMIT}, ` +
				`min: ${twitch.gql.DEFAULT_PAGE_SIZE}, ` +
				`max: ${twitch.gql.MAX_PAGINATION_LIMIT})`,
			validator: v =>
				v >= twitch.gql.DEFAULT_PAGE_SIZE &&
				v <= twitch.gql.MAX_PAGINATION_LIMIT,
		},
	],
	// prettier-ignore
	execute: async msg => {
		const channel = {};
		const channelInput = utils.resolveLoginInput(
			msg.commandFlags.channel, msg.args[0]
		);
		if (channelInput) {
			try {
				const user = await twitch.gql.user.resolve(channelInput);
				if (!user)
					return { text: `channel ${channelInput} does not exist`, mention: true };
				channel.id = user.id;
				channel.login = user.login;
			} catch (err) {
				logger.error(`error resolving user ${channelInput}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else {
			channel.id = msg.channelID;
			channel.login = msg.channelName;
		}

		const { maxMods, timeout } = msg.commandFlags;
		const results = await Promise.allSettled([
			utils.withTimeout(twitch.gql.channel.getMods(channel.login, maxMods), timeout),
			utils.withTimeout(twitch.gql.channel.getVips(channel.login), timeout),
			utils.withTimeout(twitch.gql.channel.getFounders(channel.login), timeout),
			utils.withTimeout(twitch.gql.channel.getArtists(channel.id), timeout),
		]);
		const [modEdges, vipEdges, founderEdges, artistEdges] = results.map(res =>
			res.status === 'fulfilled' ? res.value : undefined
		);

		const list = [], responseParts = [];

		if (modEdges?.length) {
			if (modEdges.length > maxMods)
				modEdges.length = maxMods;
			processEdges(modEdges, 'mod', 'grantedAt', list, responseParts,
			             'isActive', 'currently in chat');
		}
		if (vipEdges?.length)
			processEdges(vipEdges, 'vip', 'grantedAt', list, responseParts);
		if (founderEdges?.length)
			processEdges(founderEdges, 'founder', 'grantedAt', list,
			             responseParts, 'isSubscribed', 'currently subscribed');
		if (artistEdges?.length)
			processEdges(artistEdges, 'artist', 'grantedAt', list,
			             responseParts);

		if (!list.length)
			return {
				text: `there are 0 users with community roles in #${channel.login}`,
				mention: true,
			};

		try {
			const link = await paste.create(utils.format.align(list));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

function processEdges(
	edges,
	roleName,
	timeKey,
	list,
	responseParts,
	activeKey,
	activeSuffix
) {
	let activeCount = 0;
	const lines = [];
	for (let i = 0; i < edges.length; i++) {
		const e = edges[i];
		if (!e.node?.login) continue;
		let prefix = '';
		if (activeKey && e[activeKey]) {
			activeCount++;
			prefix = ACTIVE_PREFIX;
		}
		lines.push(
			`${prefix}${utils.pickName(e.node.login, e.node.displayName)}` +
				`__ALIGN__granted at: ${utils.date.format(e[timeKey])}`
		);
	}
	if (!lines.length) return;

	let roleInfo = `${lines.length} ${utils.format.plural(lines.length, roleName)}`;
	if (activeCount) roleInfo += ` (${activeCount} ${activeSuffix})`;

	responseParts.push(roleInfo);
	list.push(`${list.length ? '\n' : ''}${roleInfo}:\n`);
	for (let i = 0; i < lines.length; list.push(lines[i++]));
}
