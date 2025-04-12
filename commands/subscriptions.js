import logger from '../services/logger.js';
import { subscriptionBenefits } from '../services/twitch/gql.js';
import { joinResponseParts, toPlural } from '../utils/formatters.js';
import { splitString } from '../utils/utils.js';

export default {
	name: 'subscriptions',
	aliases: ['subs'],
	description: "get bot's subscriptions",
	unsafe: false,
	flags: [
		{
			name: 'printEmotes',
			aliases: ['p', 'print-emotes'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print available emotes',
		},
	],
	execute: async msg => {
		let res;
		try {
			res = await subscriptionBenefits();
		} catch (err) {
			logger.error('error getting subscription benefits:', err);
			return { text: 'error getting subscription benefits', mention: true };
		}

		if (!res.length) return { text: '0 channels', mention: true };

		const counters = {
			tiers: {
				1000: { count: 0, desc: '1' },
				2000: { count: 0, desc: '2' },
				3000: { count: 0, desc: '3' },
			},
			gifted: 0,
		};
		const allEmotes = [];

		for (const edge of res) {
			const user = edge.node.user;
			if (edge.node.gift?.isGift) counters.gifted++;
			counters.tiers[edge.node.tier].count++;

			for (const set of user.channel?.localEmotesSets ?? [])
				for (const e of set.emotes ?? []) if (e.token) allEmotes.push(e.token);

			if (user.subscriptionProducts[0]?.emotes?.length)
				for (const e of user.subscriptionProducts[0].emotes)
					if (e.token) allEmotes.push(e.token);

			if (
				user.subscriptionProducts[1]?.emotes?.length &&
				edge.node.tier !== '1000'
			)
				for (const e of user.subscriptionProducts[1].emotes)
					if (e.token) allEmotes.push(e.token);

			if (
				user.subscriptionProducts[2]?.emotes?.length &&
				edge.node.tier === '3000'
			)
				for (const e of user.subscriptionProducts[2].emotes)
					if (e.token) allEmotes.push(e.token);
		}

		const responseParts = [];
		responseParts.push(`${res.length} ${toPlural(res.length, 'channel')}`);
		if (allEmotes.length)
			responseParts.push(
				`${allEmotes.length} ${toPlural(allEmotes.length, 'emote')}`
			);
		if (counters.gifted) responseParts.push(`gifted: ${counters.gifted}`);
		for (const t in counters.tiers) {
			const counter = counters.tiers[t];
			if (counter.count)
				responseParts.push(`tier ${counter.desc}: ${counter.count}`);
		}

		if (msg.commandFlags.printEmotes && allEmotes.length)
			for (const message of splitString(allEmotes.join(' '), 499))
				await msg.send(message);

		return { text: joinResponseParts(responseParts), mention: true };
	},
};
