import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';

const MAX_REASON_LENGTH = 100;

export default {
	name: 'selfstrikestatus',
	aliases: ['strikestatus', 'bancheck', 'bc'],
	description: 'get active ban/timeout/warning status for a channel',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			defaultValue: null,
			required: false,
			description: 'target channel',
		},
	],
	execute: async msg => {
		const channelInput = utils.resolveLoginInput(
			msg.commandFlags.channel,
			msg.args[0]
		);
		if (!channelInput) return { text: 'channel is required', mention: true };

		let channel;
		try {
			channel = await twitch.gql.user.resolve(channelInput);
			if (!channel) return { text: 'channel does not exist', mention: true };
		} catch (err) {
			logger.error(`error resolving user ${channelInput}:`, err);
			return { text: 'error resolving channel', mention: true };
		}

		let banDetails, timeoutDetails, warningDetails;
		try {
			const res = await twitch.gql.user.getSelfStrikeStatus(channel.id);
			const strikeStatus = res?.chatModeratorStrikeStatus;
			if (!strikeStatus)
				return { text: 'failed to get strike status', mention: true };
			banDetails = strikeStatus.banDetails;
			timeoutDetails = strikeStatus.timeoutDetails;
			warningDetails = strikeStatus.warningDetails;
		} catch (err) {
			logger.error('error getting strike status:', err);
			return { text: 'error getting strike status', mention: true };
		}

		const channelName = utils.pickName(channel.login, channel.displayName);
		const response =
			processStrikeDetails('banned', channelName, banDetails) ||
			processStrikeDetails('timed out', channelName, timeoutDetails) ||
			processStrikeDetails('warned', channelName, warningDetails) ||
			`no active strike in #${channelName}`;

		return { text: response, mention: true };
	},
};

function processStrikeDetails(actionLabel, channelName, details) {
	if (!details?.id) return;
	const responseParts = [`${actionLabel} in #${channelName}`];
	const now = Date.now();

	if (details.createdAt) {
		const when = utils.date.format(details.createdAt);
		const fmtAgo = utils.duration.format(now - new Date(details.createdAt));
		responseParts.push(`since ${when} (${fmtAgo} ago)`);
	}
	if (details.expiresAt) {
		const fmtIn = utils.duration.format(new Date(details.expiresAt) - now);
		responseParts.push(`expires in ${fmtIn}`);
	}
	if (details.reason) {
		const reason = utils.format.trim(details.reason, MAX_REASON_LENGTH);
		responseParts.push(`reason: ${reason}`);
	}

	return utils.format.join(responseParts);
}
