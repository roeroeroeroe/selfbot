import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const MAX_USERS = 5000;
const MAX_DESCRIPTION_LENGTH = 75;
const MAX_TEAM_NAME_LENGTH = 25;
const INLINE_SUMMARY_SEPARATOR = '; ';

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
			long: 'id',
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
		const ageFn = utils.duration.createAge(Date.now());
		const idLookup = msg.commandFlags.idLookup;

		const unique = new Set();
		let targets;
		if (idLookup) {
			for (let i = 0; i < msg.args.length; i++) {
				const id = msg.args[i].trim();
				if (!id || unique.has(id) || !utils.regex.patterns.id.test(id))
					continue;
				unique.add(id);
				if (unique.size >= MAX_USERS) break;
			}
			targets = unique.size ? Array.from(unique) : [msg.senderUserID];
		} else {
			for (let i = 0; i < msg.args.length; i++) {
				const u = utils.trimLogin(msg.args[i]);
				if (!u || unique.has(u)) continue;
				unique.add(u);
				if (unique.size >= MAX_USERS) break;
			}
			targets = unique.size ? Array.from(unique) : [msg.senderUsername];
		}

		let usersMap;
		try {
			usersMap = await getUsersMap(targets, idLookup);
		} catch (err) {
			logger.error('error getting users:', err);
			return {
				text: `error getting ${utils.format.plural(targets.length, 'user')}`,
				mention: true,
			};
		}

		const summaries = [];
		if (targets.length > 1) {
			const idPrefix = idLookup ? 'with id ' : '';
			for (let i = 0; i < targets.length; i++) {
				const user = usersMap.get(targets[i]);
				summaries.push(
					user
						? buildUserSummary(user, null, ageFn)
						: `user ${idPrefix}${targets[i]} does not exist`
				);
			}
		} else {
			const result = usersMap.get(targets[0]);
			if (result?.user)
				summaries.push(buildUserSummary(result.user, result.banned, ageFn));
			else {
				const suggestion = await getSuggestion(targets[0], idLookup);
				summaries.push(
					suggestion
						? `user does not exist, did you mean ${suggestion}?`
						: 'user does not exist'
				);
			}
		}

		const maxLen =
			twitch.MAX_MESSAGE_LENGTH -
			twitch.chat.MENTION_OVERHEAD_LENGTH -
			msg.senderUsername.length;
		if (utils.canFitAll(summaries, maxLen, INLINE_SUMMARY_SEPARATOR.length))
			return { text: summaries.join(INLINE_SUMMARY_SEPARATOR), mention: true };

		try {
			const link = await paste.create(summaries.join('\n'));
			return { text: link, mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			return { text: 'error creating paste', mention: true };
		}
	},
};

async function getUsersMap(targets, idLookup) {
	if (targets.length > 1)
		return idLookup
			? twitch.gql.user.getMany(null, targets)
			: twitch.gql.user.getMany(targets);

	const target = targets[0];
	const result = idLookup
		? await twitch.gql.user.getUserWithBanReason(null, target)
		: await twitch.gql.user.getUserWithBanReason(target);

	if (result?.user) return new Map([[target, result]]);
	return new Map();
}

async function getSuggestion(input, idLookup) {
	if (idLookup) return null;
	try {
		const users = await twitch.gql.user.search(input);
		return users[0]?.login || null;
	} catch (err) {
		logger.error('error searching users:', err);
		return null;
	}
}

function buildUserSummary(user, banned, ageFn) {
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
	if (roles.isMonetized) roleList.push('monetized');
	if (roles.isPartner) roleList.push('partner');
	if (roles.isAffiliate) roleList.push('affiliate');

	return roleList;
}
