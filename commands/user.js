import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const MAX_DESCRIPTION_LENGTH = 75;
const MAX_TEAM_NAME_LENGTH = 25;

export default {
	name: 'user',
	aliases: ['u', 'whois'],
	description: 'get user(s) info',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'idLookup',
			aliases: ['i', 'by-id'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'treat input as IDs',
		},
	],
	execute: async msg => {
		const summaries = [];
		const ageFn = utils.duration.createAge(Date.now());
		try {
			if (msg.args.length > 1) {
				const usersMap = msg.commandFlags.idLookup
					? await twitch.gql.user.getMany(null, msg.args)
					: await twitch.gql.user.getMany(msg.args);

				const idPrefix = msg.commandFlags.idLookup ? 'with id ' : '';
				for (const arg of msg.args) {
					const user = usersMap.get(arg);
					summaries.push(
						user
							? constructUserSummary(user, null, ageFn)
							: `user ${idPrefix}${arg} does not exist`
					);
				}
			} else {
				const input = msg.args[0] || msg.senderUsername;
				const result = msg.commandFlags.idLookup
					? await twitch.gql.user.getUserWithBanReason(null, input)
					: await twitch.gql.user.getUserWithBanReason(input);
				if (result?.user)
					summaries.push(
						constructUserSummary(result.user, result.banned, ageFn)
					);
				else if (!msg.commandFlags.idLookup) {
					const res = await twitch.gql.user.search(input);
					const suggestion = res.searchUsers.edges[0]?.node.login;
					summaries.push(
						suggestion
							? `user does not exist, did you mean ${suggestion}?`
							: 'user does not exist'
					);
				} else summaries.push('user does not exist');
			}
		} catch (err) {
			logger.error('error getting users:', err);
			return {
				text: `error getting ${utils.format.plural(msg.args.length || 1, 'user')}`,
				mention: true,
			};
		}

		if (utils.canFitAll(summaries, 497 - msg.senderUsername.length, 2))
			return { text: utils.format.join(summaries, '; '), mention: true };

		try {
			const link = await hastebin.create(utils.format.join(summaries, '\n'));
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	},
};

function constructUserSummary(user, banned, ageFn) {
	const parts = [];
	parts.push(`@${utils.pickName(user.login, user.displayName)}`);
	parts.push(`id: ${user.id}`);
	if (banned?.reason) {
		let suspendedSummary = `suspended (${banned.reason}`;
		if (banned.reason === 'DEACTIVATED' && user.deletedAt)
			suspendedSummary += ` ${ageFn(user.deletedAt)} ago`;
		parts.push(suspendedSummary + ')');
	}
	if (user.description)
		parts.push(
			`description: ${utils.format.trim(user.description, MAX_DESCRIPTION_LENGTH)}`
		);
	if (user.channel.socialMedias?.length)
		parts.push(`socials: ${user.channel.socialMedias.length}`);
	if (user.panels?.length) {
		const panelsCount = { DEFAULT: 0, EXTENSION: 0 };
		for (const panel of user.panels) panelsCount[panel.type]++;
		if (panelsCount.DEFAULT)
			parts.push(
				panelsCount.EXTENSION
					? `panels: ${panelsCount.DEFAULT}, extensions: ${panelsCount.EXTENSION}`
					: `panels: ${panelsCount.DEFAULT}`
			);
		else if (panelsCount.EXTENSION)
			parts.push(`extenstion panels: ${panelsCount.EXTENSION}`);
	}
	if (user.channel.chatters.count)
		parts.push(`chatters: ${user.channel.chatters.count}`);
	if (user.followers.totalCount)
		parts.push(`followers: ${user.followers.totalCount}`);
	const followedCategories = user.followedGames.nodes.length;
	if (user.follows.totalCount) {
		const channels = user.follows.totalCount;
		let followsSummary = `follows: ${channels}`;
		if (followedCategories)
			followsSummary += ` ${utils.format.plural(channels, 'channel')}, ${followedCategories} ${utils.format.plural(followedCategories, 'category', 'categories')}`;
		parts.push(followsSummary);
	} else if (followedCategories)
		parts.push(
			`follows: ${followedCategories} ${utils.format.plural(followedCategories, 'category', 'categories')}`
		);
	const roles = getRoles(user.roles);
	if (roles.length) parts.push(`roles: ${roles.join(', ')}`);
	if (user.emoticonPrefix?.name)
		parts.push(`prefix: ${user.emoticonPrefix.name}`);
	if (user.selectedBadge?.title)
		parts.push(`badge: ${user.selectedBadge.title}`);
	if (user.chatColor) {
		const color = utils.color.get(user.chatColor);
		if (color) {
			const { hex, shorthandHex, rgb, Lab, name: colorName } = color;
			const L = utils.safeToFixed(Lab.L, 2),
				a = utils.safeToFixed(Lab.a, 2),
				b = utils.safeToFixed(Lab.b, 2);
			parts.push(
				`color: #${shorthandHex || hex} ${colorName} ` +
					`rgb(${rgb.r}, ${rgb.g}, ${rgb.b}) Lab(${L}, ${a}, ${b})`
			);
		} else parts.push(`color: ${user.chatColor}`);
	} else parts.push('default color (never set)');
	const language = user.settings.preferredLanguageTag;
	if (language && language !== 'EN')
		parts.push(`ui language: ${user.settings.preferredLanguageTag}`);
	if (user.primaryTeam) {
		let teamSummary = `team: ${utils.format.trim(user.primaryTeam.name, MAX_TEAM_NAME_LENGTH)}`;
		if (user.primaryTeam.owner?.login === user.login) teamSummary += ' (owner)';
		parts.push(teamSummary);
	}
	if (!user.stream && user.lastBroadcast?.startedAt)
		parts.push(`last live: ${ageFn(user.lastBroadcast.startedAt)} ago`);
	parts.push(`created: ${ageFn(user.createdAt)} ago`);
	if (user.updatedAt) parts.push(`updated: ${ageFn(user.updatedAt)} ago`);
	if (user.stream?.createdAt) {
		let streamSummary = `live, uptime: ${ageFn(user.stream.createdAt)}`;
		if (user.stream.game?.displayName)
			streamSummary += `, category: ${user.stream.game.displayName}`;
		if (user.stream.viewersCount)
			streamSummary += `, viewers: ${user.stream.viewersCount}`;
		parts.push(streamSummary);
	}

	return utils.format.join(parts);
}

function getRoles(roles) {
	const roleList = [];

	if (roles.isStaff) roleList.push('staff');
	else if (roles.isStaff === false) roleList.push('ex-staff');
	if (roles.isSiteAdmin) roleList.push('site admin');
	if (roles.isGlobalMod) roleList.push('global mod');
	if (roles.isExtensionsDeveloper) roleList.push('extensions developer');
	if (roles.isParticipatingDJ) roleList.push('dj');
	if (roles.isPartner) roleList.push('partner');
	if (roles.isAffiliate) roleList.push('affiliate');

	return roleList;
}
