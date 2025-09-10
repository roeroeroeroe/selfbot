import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const chatterTypes = twitch.gql.channel.CHATTER_TYPES;

export default {
	name: 'chatters',
	aliases: [],
	description: 'get chatters list',
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
			description: 'channel to get chatters for',
		},
		{
			name: 'maxRequests',
			short: 'm',
			long: 'max-requests',
			type: 'int',
			required: false,
			defaultValue: 100,
			description: 'abort after N requests (default: 100, min: 1, max: 1000)',
			validator: v => v >= 1 && v <= 1000,
		},
		{
			name: 'batchSize',
			short: null,
			long: 'batch-size',
			type: 'int',
			required: false,
			defaultValue: 10,
			description: 'run N requests concurrently (default: 10, min: 1, max: 50)',
			validator: v => v >= 1 && v <= 50,
		},
		{
			name: 'minPercent',
			short: 'p',
			long: 'min-percent',
			type: 'int',
			required: false,
			defaultValue: 100,
			description:
				'stop fetching after collecting at least N% of total chatters (default: 100, min: 1, max: 100)',
			validator: v => v >= 1 && v <= 100,
		},
	],
	execute: async msg => {
		let channelLogin;
		const channelInput = utils.resolveLoginInput(
			msg.commandFlags.channel,
			msg.args[0]
		);
		if (channelInput) {
			try {
				const user = await twitch.gql.user.resolve(channelInput);
				if (!user)
					return {
						text: `channel ${channelInput} does not exist`,
						mention: true,
					};
				channelLogin = user.login;
			} catch (err) {
				logger.error(`error resolving user ${channelInput}:`, err);
				return { text: 'error resolving channel', mention: true };
			}
		} else channelLogin = msg.channelName;

		const chatters = Object.create(null);
		for (let i = 0; i < chatterTypes.length; i++)
			chatters[chatterTypes[i]] = new Set();

		const { maxRequests, batchSize, minPercent } = msg.commandFlags;

		let req = 0,
			failedRequests = 0,
			totalCount = 0;
		do {
			const promises = [];
			for (let i = 0; i < batchSize && req < maxRequests; i++, req++)
				promises.push(
					twitch.gql.channel
						.getChatters(channelLogin)
						.catch(err => logger.error('error getting chatters:', err))
				);

			const responses = await Promise.all(promises);

			for (let i = 0; i < responses.length; i++) {
				const data = responses[i];
				if (!data?.user) {
					failedRequests++;
					continue;
				}

				const chattersData = data.user.channel?.chatters;
				if (!chattersData?.count)
					return {
						text: `there are 0 chatters in #${channelLogin}`,
						mention: true,
					};

				totalCount = chattersData.count;
				addChatters(chatters, chattersData);
			}
		} while (
			req < maxRequests &&
			(getTotalChatters(chatters) / totalCount) * 100 < minPercent
		);

		if (failedRequests === req)
			return { text: 'error getting chatters', mention: true };

		const responseParts = [totalCount];
		const collectedCount = Math.min(getTotalChatters(chatters), totalCount);
		if (collectedCount < totalCount)
			responseParts.push(`collected: ${collectedCount}`);

		const list = [];
		for (let i = 0; i < chatterTypes.length; i++) {
			const t = chatterTypes[i],
				cT = chatters[t];
			if (!cT.size) continue;
			list.push(`${list.length ? '\n' : ''}${t} (${cT.size}):`);
			const sorted = [...cT].sort();
			for (let j = 0; j < sorted.length; j++) list.push(sorted[j]);
		}

		try {
			const link = await paste.create(list.join('\n'));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

function addChatters(chatters, data) {
	for (let i = 0; i < chatterTypes.length; i++) {
		const t = chatterTypes[i],
			existing = chatters[t],
			incoming = data[t];
		for (let j = 0; j < incoming.length; j++) {
			const login = incoming[j]?.login;
			if (login) existing.add(login);
		}
	}
}

function getTotalChatters(chatters) {
	let sum = 0;
	for (let i = 0; i < chatterTypes.length; i++)
		sum += chatters[chatterTypes[i]].size;
	return sum;
}
