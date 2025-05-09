import logger from '../services/logger.js';
import hastebin from '../services/hastebin.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'chatters',
	aliases: [],
	description: 'get chatters list',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			required: false,
			defaultValue: '',
			description: 'channel to get chatters for',
		},
		{
			name: 'raw',
			aliases: ['r', 'raw'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print usernames only',
		},
		{
			name: 'maxRequests',
			aliases: ['m', 'max-requests'],
			type: 'number',
			required: false,
			defaultValue: 100,
			description: 'abort after N requests (default: 100, min: 1, max: 1000)',
			validator: v => v >= 1 && v <= 1000,
		},
		{
			name: 'batchSize',
			aliases: [null, 'batch-size'],
			type: 'number',
			required: false,
			defaultValue: 10,
			description: 'run N requests concurrently (default: 10, min: 1, max: 50)',
			validator: v => v >= 1 && v <= 50,
		},
		{
			name: 'minPercent',
			aliases: ['p', 'min-percent'],
			type: 'number',
			required: false,
			defaultValue: 100,
			description:
				'stop fetching after collecting at least N% of total chatters (default: 100, min: 1, max: 100)',
			validator: v => v >= 1 && v <= 100,
		},
	],
	execute: async msg => {
		let channelLogin = msg.channelName;
		const input = msg.commandFlags.channel || msg.args[0];
		if (input) {
			try {
				const user = await twitch.gql.user.resolve(input);
				if (!user)
					return { text: `channel ${input} does not exist`, mention: true };
				channelLogin = user.login;
			} catch (err) {
				logger.error(`error resolving user ${input}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		}
		let req = 0,
			totalCount = 0;
		const chatters = {
			broadcasters: new Set(),
			mods: new Set(),
			vips: new Set(),
			viewers: new Set(),
		};

		do {
			const promises = [];
			for (
				let i = 0;
				i < msg.commandFlags.batchSize && req < msg.commandFlags.maxRequests;
				i++, req++
			)
				promises.push(twitch.gql.channel.getChatters(channelLogin));

			const responses = await Promise.all(promises);

			for (const data of responses) {
				if (!data.user)
					return {
						text: `channel ${channelLogin} does not exist`,
						mention: true,
					};

				const chattersData = data.user.channel?.chatters || {};
				if (!chattersData?.count)
					return {
						text: `there are 0 chatters in #${channelLogin}`,
						mention: true,
					};

				totalCount = chattersData.count;
				addChatters(chatters, chattersData);
			}
		} while (
			req < msg.commandFlags.maxRequests &&
			(getTotalChatters(chatters) / totalCount) * 100 <
				msg.commandFlags.minPercent
		);

		const list = [];
		if (msg.commandFlags.raw) {
			const allChatters = [];
			for (const t in chatters)
				for (const c of chatters[t]) allChatters.push(c);
			for (const c of allChatters.sort()) list.push(c);
		} else {
			for (const t in chatters)
				if (chatters[t].size) {
					list.push(`${list.length ? '\n' : ''}${t} (${chatters[t].size}):`);
					for (const c of Array.from(chatters[t]).sort()) list.push(c);
				}
		}

		const messageParts = [totalCount];
		try {
			const link = await hastebin.create(list.join('\n'));
			const collectedChattersCount = getTotalChatters(chatters);
			if (collectedChattersCount !== totalCount)
				messageParts.push(`collected: ${collectedChattersCount}`);
			messageParts.push(link);
			return { text: utils.format.join(messageParts), mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			messageParts.push('error creating paste');
			return { text: utils.format.join(messageParts), mention: true };
		}
	},
};

const chattersTypes = ['broadcasters', 'mods', 'vips', 'viewers'];

function addChatters(chatters, data) {
	for (const t of chattersTypes)
		if (data[t]) for (const c of data[t]) if (c.login) chatters[t].add(c.login);
}

function getTotalChatters(chatters) {
	return (
		chatters.broadcasters.size +
		chatters.mods.size +
		chatters.vips.size +
		chatters.viewers.size
	);
}
