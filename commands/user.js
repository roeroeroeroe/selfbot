import logger from '../services/logger.js';
import { createPaste } from '../services/hastebin.js';
import { formatDuration } from '../utils/duration.js';
import { getUser, getUsers } from '../services/twitch/gql.js';
import { getEffectiveName, hexToRgb } from '../utils/utils.js';
import {
	joinResponseParts,
	toPlural,
	trimString,
} from '../utils/formatters.js';

export default {
	name: 'user',
	aliases: ['u', 'whois'],
	description: 'get user(s) info',
	unsafe: false,
	flags: [
		{
			name: 'idLookup',
			aliases: ['i', 'id'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'treat input as IDs',
		},
	],
	execute: async msg => {
		let responses;
		try {
			responses = buildResponses(msg, await getNormalizedUsers(msg));
		} catch (err) {
			logger.error('error getting users:', err);
			return {
				text: `error getting ${toPlural(msg.args.length || 1, 'user')}`,
				mention: true,
			};
		}

		const response = joinResponseParts(responses, '; ');
		if (response.length < 497 - msg.senderUsername.length)
			return {
				text: response,
				mention: true,
			};

		try {
			const link = await createPaste(joinResponseParts(responses, '\n'), true);
			return {
				text: link,
				mention: true,
			};
		} catch (err) {
			logger.error('error creating paste:', err);
			return {
				text: 'error creating paste',
				mention: true,
			};
		}
	},
};

async function getNormalizedUsers(msg) {
	if (msg.args.length > 1)
		return msg.commandFlags.idLookup
			? await getUsers(null, msg.args)
			: await getUsers(msg.args);

	const input = msg.args[0] || msg.senderUsername;
	const result = msg.commandFlags.idLookup
		? await getUser(null, input)
		: await getUser(input);
	if (!result?.user) return new Map();
	return new Map([
		[msg.commandFlags.idLookup ? result.user.id : result.user.login, result],
	]);
}

function buildResponses(msg, usersMap) {
	const responses = [];

	if (msg.args.length < 2) {
		const [result] = usersMap.values();
		responses.push(
			result?.user
				? constructUserDescription(result.user, result.banned)
				: 'user does not exist'
		);
	} else {
		const idPrefix = msg.commandFlags.idLookup ? 'with id ' : '';
		for (const arg of msg.args) {
			const key = msg.commandFlags.idLookup ? arg : arg.toLowerCase();
			const user = usersMap.get(key);
			responses.push(
				user
					? constructUserDescription(user)
					: `user ${idPrefix}${key} does not exist`
			);
		}
	}

	return responses;
}

function constructUserDescription(user, banned) {
	const parts = [];
	const now = Date.now();
	parts.push(`@${getEffectiveName(user.login, user.displayName)}`);
	parts.push(`id: ${user.id}`);
	if (banned?.reason) {
		let suspendedString = `suspended (${banned.reason}`;
		if (banned.reason === 'DEACTIVATED' && user.deletedAt)
			suspendedString += ` ${formatDuration(now - Date.parse(user.deletedAt))} ago`;
		suspendedString += ')';
		parts.push(suspendedString);
	}
	if (user.description)
		parts.push(`description: ${trimString(user.description, 75)}`);
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
	if (user.follows.totalCount) {
		let followsString = `follows: ${user.follows.totalCount}`;
		if (user.followedGames.nodes.length)
			followsString += ` ${toPlural(user.follows.totalCount, 'channel')}, ${user.followedGames.nodes.length} ${toPlural(user.followedGames.nodes.length, 'category', 'categories')}`;
		parts.push(followsString);
	} else if (user.followedGames.nodes.length)
		parts.push(
			`follows: ${user.followedGames.nodes.length} ${toPlural(user.followedGames.nodes.length, 'category', 'categories')}`
		);
	const roles = [];
	if (user.roles.isStaff) roles.push('staff');
	else if (user.roles.isStaff === false) roles.push('ex-staff');
	if (user.roles.isSiteAdmin) roles.push('site admin');
	if (user.roles.isGlobalMod) roles.push('global mod');
	if (user.roles.isExtensionsDeveloper) roles.push('extensions developer');
	if (user.roles.isParticipatingDJ) roles.push('dj');
	if (user.roles.isPartner) roles.push('partner');
	if (user.roles.isAffiliate) roles.push('affiliate');
	if (roles.length) parts.push(`roles: ${roles.join(', ')}`);

	if (user.emoticonPrefix?.name)
		parts.push(`prefix: ${user.emoticonPrefix.name}`);
	if (user.selectedBadge?.title)
		parts.push(`badge: ${user.selectedBadge.title}`);
	if (user.chatColor) {
		const rgb = hexToRgb(user.chatColor);
		parts.push(`color: ${user.chatColor} (${rgb.r}, ${rgb.g}, ${rgb.b})`);
	} else parts.push('default color (never set)');
	if (
		user.settings.preferredLanguageTag &&
		user.settings.preferredLanguageTag !== 'EN'
	)
		parts.push(`ui language: ${user.settings.preferredLanguageTag}`);
	if (user.primaryTeam) {
		let teamString = `team: ${trimString(user.primaryTeam.name, 25)}`;
		if (user.primaryTeam.owner?.login === user.login) teamString += ' (owner)';
		parts.push(teamString);
	}
	if (!user.stream && user.lastBroadcast?.startedAt)
		parts.push(
			`last live: ${formatDuration(now - Date.parse(user.lastBroadcast.startedAt))} ago`
		);
	parts.push(
		`created: ${formatDuration(now - Date.parse(user.createdAt))} ago`
	);
	if (user.updatedAt)
		parts.push(
			`updated: ${formatDuration(now - Date.parse(user.updatedAt))} ago`
		);
	if (user.stream?.createdAt) {
		let streamString = `live, uptime: ${formatDuration(now - Date.parse(user.stream.createdAt))}`;
		if (user.stream.game?.displayName)
			streamString += `, category: ${user.stream.game.displayName}`;
		if (user.stream.viewersCount)
			streamString += `, viewers: ${user.stream.viewersCount}`;
		parts.push(streamString);
	}

	return joinResponseParts(parts);
}
