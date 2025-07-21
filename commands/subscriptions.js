import paste from '../services/paste/index.js';
import logger from '../services/logger.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const tiers = twitch.gql.user.SUBSCRIPTION_BENEFIT_TIERS;

export default {
	name: 'subscriptions',
	aliases: ['subs'],
	description: "get bot's subscriptions",
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'printEmotes',
			short: 'p',
			long: 'print-emotes',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print available emotes',
		},
		{
			name: 'verbose',
			short: 'v',
			long: 'verbose',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'show subscription details',
		},
	],
	execute: async msg => {
		let subscriptionBenefitEdges;
		try {
			subscriptionBenefitEdges =
				await twitch.gql.user.getSelfSubscriptionBenefits();
		} catch (err) {
			logger.error('error getting subscription benefits:', err);
			return { text: 'error getting subscription benefits', mention: true };
		}

		const channelCount = subscriptionBenefitEdges.length;
		if (!channelCount) return { text: '0 channels', mention: true };

		const { printEmotes, verbose } = msg.commandFlags;

		const emoteTokens = [];
		const verbosePageLines = [];
		const tierCounts = {};
		for (const t in tiers) tierCounts[t] = 0;

		let giftedCount = 0,
			totalEmoteCount = 0;

		let processEmotes;
		if (printEmotes)
			processEmotes = function (emotes, isAvailable = true) {
				if (!Array.isArray(emotes)) return 0;
				if (isAvailable) {
					const before = emoteTokens.length;
					for (let i = 0, t; i < emotes.length; i++)
						if ((t = emotes[i].token)) emoteTokens.push(t);
					return emoteTokens.length - before;
				}
				let c = 0;
				for (let i = 0; i < emotes.length; i++) if (emotes[i].token) c++;
				return c;
			};
		else
			processEmotes = function (emotes, add) {
				if (!Array.isArray(emotes)) return 0;
				let c = 0;
				for (let i = 0; i < emotes.length; i++) if (emotes[i].token) c++;
				if (add) totalEmoteCount += c;
				return c;
			};

		for (let i = 0; i < channelCount; i++) {
			const { purchasedWithPrime, tier, gift, user } =
				subscriptionBenefitEdges[i].node;
			tierCounts[tier]++;
			if (gift?.isGift) giftedCount++;

			let channelTotalEmoteCount = 0,
				channelAvailableEmoteCount = 0;

			const localEmotesSets = user.channel?.localEmotesSets;
			if (localEmotesSets?.length)
				for (let j = 0; j < localEmotesSets.length; j++) {
					const c = processEmotes(localEmotesSets[j].emotes, true);
					channelTotalEmoteCount += c;
					channelAvailableEmoteCount += c;
				}

			const products = user.subscriptionProducts;
			if (!products?.length) continue;

			const tierNum = +tier;
			for (let j = 0; j < products.length; j++) {
				const product = products[j],
					productTierNum = +product.tier;
				if (Number.isNaN(productTierNum)) {
					logger.warning('malformed subscription product tier:', product);
					continue;
				}
				const isAvailable = productTierNum <= tierNum;
				const c = processEmotes(product.emotes, isAvailable);
				channelTotalEmoteCount += c;
				if (isAvailable) channelAvailableEmoteCount += c;
			}

			if (!verbose) continue;

			const verboseLineParts = [
				`#${utils.pickName(user.login, user.displayName)}: ` +
					(purchasedWithPrime ? 'Prime' : `tier ${tiers[tier]}`),
			];
			if (gift?.isGift) verboseLineParts.push('gifted');
			verboseLineParts.push(
				`${channelAvailableEmoteCount}/${channelTotalEmoteCount} ` +
					`${utils.format.plural(channelTotalEmoteCount, 'emote')} available`
			);
			verbosePageLines.push(verboseLineParts.join(', '));
		}

		const responseParts = [
			`${channelCount} ${utils.format.plural(channelCount, 'channel')}`,
		];

		if ((totalEmoteCount ||= emoteTokens.length))
			responseParts.push(
				`${totalEmoteCount} ${utils.format.plural(totalEmoteCount, 'emote')}`
			);
		if (giftedCount) responseParts.push(`gifted: ${giftedCount}`);
		for (const t in tiers) {
			const count = tierCounts[t];
			if (count) responseParts.push(`tier ${tiers[t]}: ${count}`);
		}

		if (printEmotes && emoteTokens.length)
			for (const message of utils.splitString(
				emoteTokens.join(' '),
				twitch.MAX_MESSAGE_LENGTH - 1
			))
				msg.send(message);

		if (verbose)
			try {
				const link = await paste.create(verbosePageLines.join('\n'));
				responseParts.push(link);
			} catch (err) {
				logger.error('error creating paste:', err);
				responseParts.push('error creating paste');
			}

		return { text: utils.format.join(responseParts), mention: true };
	},
};
