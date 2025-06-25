import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const MAX_USERS = 5000;
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
			short: 'i',
			long: 'by-id',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description:
				'treat input as IDs; "-i 1" parses "1" ' +
				'as flag value (true), not ID -- ' +
				'use "-i true 1" or "... 1 -i" to avoid',
		},
	],
	execute: async msg => {
		const summaries = [];
		const input = [];
		const unique = new Set();
		if (msg.commandFlags.idLookup) {
			for (let i = 0; i < msg.args.length; i++) {
				const id = msg.args[i];
				if (unique.has(id)) continue;
				if (!utils.regex.patterns.id.test(id)) continue;
				unique.add(id);
				input.push(id);
				if (unique.size >= MAX_USERS) break;
			}
			if (!input.length) input.push(msg.senderUserID);
		} else {
			for (let i = 0; i < msg.args.length; i++) {
				const u = msg.args[i];
				if (unique.has(u)) continue;
				if (!utils.regex.patterns.username.test(u)) continue;
				unique.add(u);
				input.push(u);
				if (unique.size >= MAX_USERS) break;
			}
			if (!input.length) input.push(msg.senderUsername);
		}
		const ageFn = utils.duration.createAge(Date.now());
		try {
			if (input.length > 1) {
				const usersMap = msg.commandFlags.idLookup
					? await twitch.gql.user.getMany(null, input)
					: await twitch.gql.user.getMany(input);

				const idPrefix = msg.commandFlags.idLookup ? 'with id ' : '';
				for (let i = 0; i < input.length; i++) {
					const user = usersMap.get(input[i]);
					summaries.push(
						user
							? constructUserSummary(user, null, ageFn)
							: `user ${idPrefix}${input[i]} does not exist`
					);
				}
			} else {
				const result = msg.commandFlags.idLookup
					? await twitch.gql.user.getUserWithBanReason(null, input[0])
					: await twitch.gql.user.getUserWithBanReason(input[0]);
				if (result?.user)
					summaries.push(
						constructUserSummary(result.user, result.banned, ageFn)
					);
				else if (!msg.commandFlags.idLookup) {
					const res = await twitch.gql.user.search(input[0]);
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
				text: `error getting ${utils.format.plural(input.length, 'user')}`,
				mention: true,
			};
		}

		const maxLen = twitch.MAX_MESSAGE_LENGTH - 3 - msg.senderUsername.length;
		if (utils.canFitAll(summaries, maxLen, 2))
			return { text: utils.format.join(summaries, '; '), mention: true };

		try {
			const link = await paste.create(utils.format.join(summaries, '\n'));
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
			parts.push(`extension panels: ${panelsCount.EXTENSION}`);
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
			const { hex, shorthandHex, rgb, name: colorName } = color;
			parts.push(
				`color: #${shorthandHex || hex} ${colorName} ` +
					`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
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
