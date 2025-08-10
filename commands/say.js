import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'say',
	aliases: [],
	description: 'send message(s)',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [
		['fill', 'repeat'],
		['upper', 'lower'],
	],
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
			name: 'count',
			short: 'C',
			long: 'count',
			type: 'int',
			required: false,
			defaultValue: 1,
			description: 'send the message N times (default: 1, min: 1, max: 100)',
			validator: v => v >= 1 && v <= 100,
		},
		{
			name: 'fill',
			short: 'f',
			long: 'fill',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: `fill the message to maximum length (${twitch.MAX_MESSAGE_LENGTH})`,
		},
		{
			name: 'repeat',
			short: 'r',
			long: 'repeat',
			type: 'int',
			required: false,
			defaultValue: 0,
			description: 'repeat the message N times (min: 2, max: 250)',
			validator: v => v >= 2 && v <= 250,
		},
		{
			name: 'reverse',
			short: 'R',
			long: 'reverse',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'reverse the message',
		},
		{
			name: 'upper',
			short: 'u',
			long: 'upper',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'convert to uppercase',
		},
		{
			name: 'lower',
			short: 'l',
			long: 'lower',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'convert to lowercase',
		},
		{
			name: 'force',
			short: null,
			long: 'force',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'skip chat restrictions checks and try to send anyway',
		},
	],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no message provided', mention: true };
		let channel, privileged;
		if (msg.commandFlags.channel) {
			try {
				channel = await twitch.gql.user.resolve(msg.commandFlags.channel);
				if (!channel)
					return {
						text: `channel ${msg.commandFlags.channel} does not exist`,
						mention: true,
					};
				privileged = await twitch.gql.channel.isSelfPrivileged(channel.login);
			} catch (err) {
				logger.error(`error resolving user ${msg.commandFlags.channel}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else {
			channel = { id: msg.channelID, login: msg.channelName };
			privileged = msg.query.privileged;
		}

		if (!msg.commandFlags.force) {
			const { allowed, slowMode, error, strikeStatus } =
				await twitch.gql.chat.canSend(channel.id, channel.login, privileged);
			if (!allowed) return { text: error, mention: true };
			if (strikeStatus.warningDetails?.createdAt)
				try {
					const res = await twitch.gql.channel.acknowledgeChatWarning(
						channel.id
					);
					const errCode = res.acknowledgeChatWarning.error?.code;
					if (errCode) {
						logger.error('error acknowledging warning:', errCode);
						return {
							text: `error acknowledging warning: ${errCode}`,
							mention: true,
						};
					}
				} catch (err) {
					logger.error('error acknowledging warning:', err);
					return { text: 'error acknowledging warning', mention: true };
				}
			twitch.chat.setSlowModeDuration(channel.id, slowMode);
		}

		const phrase = msg.args.join(' ');
		let text;
		if (msg.commandFlags.fill) text = fill(phrase);
		else if (msg.commandFlags.repeat)
			text = repeat(phrase, msg.commandFlags.repeat);
		if (msg.commandFlags.upper) text = text.toUpperCase();
		else if (msg.commandFlags.lower) text = text.toLowerCase();
		if (msg.commandFlags.reverse) text = text.split('').reverse().join('');

		for (let i = 0; i < msg.commandFlags.count; i++)
			twitch.chat.send(
				channel.id,
				channel.login,
				undefined, // userLogin
				text || phrase,
				false, // mention
				privileged,
				'' // parentId
			);
	},
};

function maxRepeats(phrase) {
	return ((twitch.MAX_MESSAGE_LENGTH + 1) / (phrase.length + 1)) | 0;
}

function fill(phrase) {
	return Array(maxRepeats(phrase)).fill(phrase).join(' ');
}

function repeat(phrase, times) {
	return Array(Math.min(times, maxRepeats(phrase)))
		.fill(phrase)
		.join(' ');
}
