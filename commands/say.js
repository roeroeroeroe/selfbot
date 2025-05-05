import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'say',
	aliases: [],
	description: 'send message(s)',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'target channel (default: current channel)',
		},
		{
			name: 'count',
			aliases: [null, 'count'],
			type: 'number',
			required: false,
			defaultValue: 1,
			description: 'send the message N times (default: 1, min: 1, max: 100)',
			validator: v => v >= 1 && v <= 100,
		},
		{
			name: 'fill',
			aliases: ['f', 'fill'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'fill the message',
		},
		{
			name: 'repeat',
			aliases: ['r', 'repeat'],
			type: 'number',
			required: false,
			defaultValue: 1,
			description: 'repeat the message N times (default: 1, min: 1, max: 250)',
			validator: v => v >= 1 && v <= 250,
		},
		{
			name: 'reverse',
			aliases: [null, 'reverse'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'reverse the message',
		},
		{
			name: 'upper',
			aliases: ['u', 'upper'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'convert to uppercase',
		},
		{
			name: 'lower',
			aliases: ['l', 'lower'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'convert to lowercase',
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

		const phrase = msg.args.join(' ');
		let text = '';
		if (msg.commandFlags.fill) text = fill(phrase);
		else if (msg.commandFlags.repeat > 1)
			text = repeat(phrase, msg.commandFlags.repeat);
		else text = phrase;

		if (msg.commandFlags.upper) text = text.toUpperCase();
		else if (msg.commandFlags.lower) text = text.toLowerCase();

		if (msg.commandFlags.reverse) text = text.split('').reverse().join('');

		for (let i = 0; i < msg.commandFlags.count; i++)
			twitch.chat.send(
				channel.id,
				channel.login,
				undefined, // userLogin
				text,
				false, // mention
				privileged,
				'' // parentId
			);
	},
};

function maxRepeats(phrase) {
	return (501 / (phrase.length + 1)) | 0;
}

function fill(phrase) {
	return Array(maxRepeats(phrase)).fill(phrase).join(' ');
}

function repeat(phrase, times) {
	return Array(Math.min(times, maxRepeats(phrase)))
		.fill(phrase)
		.join(' ');
}
