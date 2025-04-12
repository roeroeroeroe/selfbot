import logger from '../services/logger.js';
import { getEffectiveName, getClosestString } from '../utils/utils.js';
import {
	resolveUser,
	getUnlockableEmotes,
	unlockChosenEmote,
	unlockRandomEmote,
} from '../services/twitch/gql.js';

export default {
	name: 'unlockchannelemote',
	aliases: ['unlockemote', 'getemote'],
	description: 'unlock an emote using channel points',
	unsafe: false,
	flags: [
		{
			name: 'emoteToken',
			aliases: ['e', 'emote'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'emote to unlock',
		},
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'channel (default: current channel)',
		},
	],
	execute: async msg => {
		let channel;
		try {
			channel = await resolveUser(msg.commandFlags.channel || msg.channelName);
			if (!channel) return { text: 'channel does not exist', mention: true };
		} catch (err) {
			logger.error('error resolving user:', err);
			return { text: 'error resolving channel', mention: true };
		}

		const res = await getUnlockableEmotes(channel.login);

		const rewardType = msg.commandFlags.emoteToken
			? 'CHOSEN_SUB_EMOTE_UNLOCK'
			: 'RANDOM_SUB_EMOTE_UNLOCK';

		const channelName = getEffectiveName(channel.login, channel.displayName);

		const reward = (
			res.user.channel?.communityPointsSettings?.automaticRewards ?? []
		).find(r => r.type === rewardType);

		if (!reward)
			return {
				text: `reward ${rewardType} not found in #${channelName}`,
				mention: true,
			};
		if (!reward.isEnabled)
			return {
				text: `reward ${rewardType} is disabled in #${channelName}`,
				mention: true,
			};

		const balance = res.user.channel.self?.communityPoints?.balance;
		if (balance === null || balance === undefined)
			return { text: 'failed to get current balance', mention: true };

		const cost = reward.cost ?? reward.defaultCost;
		if (cost > balance)
			return {
				text: `insufficient balance (cost: ${cost}, balance: ${balance})`,
				mention: true,
			};

		if (msg.commandFlags.emoteToken) {
			const emotePrefix = res.user.emoticonPrefix?.name ?? '';
			if (
				!msg.commandFlags.emoteToken.startsWith(emotePrefix) ||
				msg.commandFlags.emoteToken === emotePrefix
			)
				return {
					text: `invalid emote: the emote prefix in #${channelName} is "${emotePrefix}"`,
					mention: true,
				};

			const unlockableEmoteSuffixes = [];
			const prefixLength = emotePrefix.length;
			let matchingNode;
			for (const n of res.user.channel.communityPointsSettings.emoteVariants ??
				[]) {
				const token = n.emote.token;
				if (token === msg.commandFlags.emoteToken) {
					matchingNode = n;
					break;
				}
				if (n.isUnlockable)
					unlockableEmoteSuffixes.push(token.slice(prefixLength));
			}

			if (!matchingNode) {
				let errorString = `emote "${msg.commandFlags.emoteToken}" not found`;
				if (unlockableEmoteSuffixes.length) {
					const closestSuffix = getClosestString(
						msg.commandFlags.emoteToken.slice(prefixLength),
						unlockableEmoteSuffixes
					);
					if (closestSuffix)
						errorString += `, most similar emote: ${emotePrefix}${closestSuffix}`;
				}
				return { text: errorString, mention: true };
			}
			if (!matchingNode.isUnlockable)
				return {
					text: `emote "${msg.commandFlags.emoteToken}" is not unlockable`,
					mention: true,
				};

			const result = processResponse(
				await unlockChosenEmote(channel.id, cost, matchingNode.emote.id),
				'unlockChosenSubscriberEmote'
			);
			if (result.error)
				return {
					text: `error unlocking emote: ${result.error}`,
					mention: true,
				};

			return {
				text: `emote ${msg.commandFlags.emoteToken} successfully unlocked, remaining balance: ${result.balance}`,
				mention: true,
			};
		}

		const result = processResponse(
			await unlockRandomEmote(channel.id, cost),
			'unlockRandomSubscriberEmote'
		);
		if (result.error)
			return { text: `error unlocking emote: ${result.error}`, mention: true };

		return {
			text: result.emote
				? `emote ${result.emote.token} (${result.emote.id}) successfully unlocked, remaining balance: ${result.balance}`
				: 'error unlocking emote: no emote in response',
			mention: true,
		};
	},
};

function processResponse(data, key) {
	return {
		emote: data[key].emote ?? null,
		balance: data[key].balance,
		error: data[key].error?.code ?? null,
	};
}
