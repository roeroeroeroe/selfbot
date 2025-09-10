import StringMatcher from '../services/string_matcher.js';
import logger from '../services/logger.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const REWARD_TYPES = {
	RANDOM: 'RANDOM_SUB_EMOTE_UNLOCK',
	CHOSEN: 'CHOSEN_SUB_EMOTE_UNLOCK',
};

export default {
	name: 'unlockchannelemote',
	aliases: ['unlockemote', 'getemote'],
	description: 'unlock an emote using channel points',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'emoteToken',
			short: 'e',
			long: 'emote',
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'emote to unlock, random if omitted',
		},
		{
			name: 'channel',
			short: 'c',
			long: 'channel',
			type: 'username',
			defaultValue: null,
			required: false,
			description: 'channel (default: current channel)',
		},
	],
	execute: async msg => {
		const channelInput = msg.commandFlags.channel || msg.channelName;
		let channel;
		try {
			channel = await twitch.gql.user.resolve(channelInput);
			if (!channel)
				return {
					text: `channel ${channelInput} does not exist`,
					mention: true,
				};
		} catch (err) {
			logger.error(`error resolving user ${channelInput}:`, err);
			return { text: 'error resolving channel', mention: true };
		}

		let res;
		try {
			res = await twitch.gql.channel.getUnlockableEmotes(channel.login);
		} catch (err) {
			logger.error('error getting unlockable emotes:', err);
			return { text: 'error getting unlockable emotes', mention: true };
		}

		const emoteToken = msg.commandFlags.emoteToken;
		const rewardType = emoteToken ? REWARD_TYPES.CHOSEN : REWARD_TYPES.RANDOM;

		const channelName = utils.pickName(channel.login, channel.displayName);

		const automaticRewards =
			res.user.channel?.communityPointsSettings?.automaticRewards;
		if (!automaticRewards?.length)
			return {
				text: `reward ${rewardType} not found in #${channelName}`,
				mention: true,
			};

		let reward;
		for (let i = 0, r; i < automaticRewards.length; i++)
			if ((r = automaticRewards[i]).type === rewardType) {
				reward = r;
				break;
			}
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
		if (typeof balance !== 'number')
			return { text: 'failed to get current balance', mention: true };

		const cost = reward.cost ?? reward.defaultCost;
		if (cost > balance)
			return {
				text: `insufficient balance (cost: ${cost}, balance: ${balance})`,
				mention: true,
			};

		if (emoteToken) {
			const emotePrefix = res.user.emoticonPrefix?.name ?? '';
			if (!emoteToken.startsWith(emotePrefix) || emoteToken === emotePrefix)
				return {
					text: `invalid emote: the emote prefix in #${channelName} is "${emotePrefix}"`,
					mention: true,
				};

			const prefixLength = emotePrefix.length;
			const unlockableEmoteSuffixes = [];
			const emoteVariants =
				res.user.channel.communityPointsSettings.emoteVariants;

			let match;
			for (let i = 0; i < emoteVariants.length; i++) {
				const node = emoteVariants[i];
				const token = node.emote.token;
				if (token.toLowerCase() === emoteToken) {
					match = node;
					break;
				}
				if (node.isUnlockable)
					unlockableEmoteSuffixes.push(token.slice(prefixLength));
			}

			if (!match) {
				let errorResponse = `emote "${emoteToken}" not found`;
				if (unlockableEmoteSuffixes.length) {
					let closestSuffix;
					try {
						closestSuffix = new StringMatcher(
							unlockableEmoteSuffixes
						).getClosest(emoteToken.slice(prefixLength));
					} catch (err) {
						logger.warning(
							'failed to initialize string matcher for emote suffixes:',
							err
						);
					}
					if (closestSuffix)
						errorResponse += `, most similar emote: ${emotePrefix}${closestSuffix}`;
				}
				return { text: errorResponse, mention: true };
			}
			if (!match.isUnlockable)
				return {
					text: `emote "${match.emote.token}" is not unlockable`,
					mention: true,
				};

			try {
				res = (
					await twitch.gql.channel.unlockChosenEmote(
						channel.id,
						cost,
						match.emote.id
					)
				).unlockChosenSubscriberEmote;
			} catch (err) {
				logger.error('error unlocking chosen emote:', err);
				return { text: 'error unlocking emote', mention: true };
			}
			const errCode = res.error?.code;
			if (errCode)
				return { text: `error unlocking emote: ${errCode}`, mention: true };

			return {
				text: `emote ${match.emote.token} (${match.emote.id}) successfully unlocked, remaining balance: ${res.balance}`,
				mention: true,
			};
		}

		try {
			res = (await twitch.gql.channel.unlockRandomEmote(channel.id, cost))
				.unlockRandomSubscriberEmote;
		} catch (err) {
			logger.error('error unlocking random emote:', err);
			return { text: 'error unlocking emote', mention: true };
		}
		const errCode = res.error?.code;
		if (errCode)
			return { text: `error unlocking emote: ${errCode}`, mention: true };

		return {
			text: res.emote
				? `emote ${res.emote.token} (${res.emote.id}) successfully unlocked, remaining balance: ${res.balance}`
				: 'error unlocking emote: no emote in response',
			mention: true,
		};
	},
};
