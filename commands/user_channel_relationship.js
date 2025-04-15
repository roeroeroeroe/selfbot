import logger from '../services/logger.js';
import utils from '../utils/index.js';
import gql from '../services/twitch/gql/index.js';

export default {
	name: 'relationship',
	aliases: ['rel'],
	description: "get user's relationship with a given channel",
	unsafe: false,
	flags: [
		{
			name: 'user',
			aliases: ['u', 'user'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'user (default: sender)',
		},
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'channel (default: current channel)',
		},
	],
	execute: async msg => {
		const now = Date.now();

		const userInput = msg.commandFlags.user || msg.args[0];
		let user;
		if (userInput) {
			try {
				const res = await gql.user.resolve(userInput);
				if (!res)
					return { text: `user ${userInput} does not exist`, mention: true };
				user = { id: res.id, login: res.login };
			} catch (err) {
				logger.error(`error resolving user ${userInput}:`, err);
				return { text: `error resolving user ${userInput}`, mention: true };
			}
		} else {
			user = { id: msg.senderUserID, login: msg.senderUsername };
		}

		const channelInput = msg.commandFlags.channel || msg.args[1];
		let channel;
		if (channelInput) {
			try {
				const res = await gql.user.resolve(channelInput);
				if (!res)
					return {
						text: `channel ${channelInput} does not exist`,
						mention: true,
					};
				channel = { id: res.id, login: res.login };
			} catch (err) {
				logger.error(`error resolving user ${channelInput}:`, err);
				return {
					text: `error resolving channel ${channelInput}`,
					mention: true,
				};
			}
		} else {
			channel = { id: msg.channelID, login: msg.channelName };
		}

		let relationshipData,
			channelViewerData,
			vipsData,
			foundersData,
			artistsData;
		const results = await Promise.allSettled([
			gql.user.getRelationship(user.login, channel.id),
			gql.channel.getChannelViewer(user.login, channel.login),
			gql.channel.getVips(channel.login),
			gql.channel.getFounders(channel.login),
			gql.channel.getArtists(channel.id),
		]);
		[relationshipData, channelViewerData, vipsData, foundersData, artistsData] =
			results.map(res => (res.status === 'fulfilled' ? res.value : undefined));

		const responseParts = [];
		const userName = utils.getEffectiveName(
			relationshipData.user.login,
			relationshipData.user.displayName
		);
		responseParts.push(`${userName}/${channel.login}`);

		if (relationshipData.user.relationship?.followedAt)
			responseParts.push(
				`followed ${utils.duration.format(now - Date.parse(relationshipData.user.relationship.followedAt))} ago`
			);
		if (relationshipData.user.isModerator) responseParts.push('mod');

		const founder = (foundersData ?? []).find(
			e => e.node?.login === user.login
		);
		if (founder)
			responseParts.push(
				`founder since ${utils.date.format(founder.grantedAt)}`
			);

		const artist = (artistsData?.artists?.edges ?? []).find(
			e => e.node?.login === user.login
		);
		if (artist)
			responseParts.push(`artist since ${utils.date.format(artist.grantedAt)}`);

		const vip = (vipsData ?? []).find(e => e.node?.login === user.login);
		if (vip)
			responseParts.push(`vip since ${utils.date.format(vip.grantedAt)}`);

		const badgesCount =
			channelViewerData?.channelViewer?.earnedBadges?.length ?? 0;
		if (badgesCount)
			responseParts.push(
				`${badgesCount} ${utils.format.plural(badgesCount, 'badge')}`
			);

		const subscriptionTenure =
			relationshipData.user.relationship?.subscriptionTenure;
		const subscriptionBenefit =
			relationshipData.user.relationship?.subscriptionBenefit;
		let subscriptionString = '';

		if (subscriptionBenefit) {
			subscriptionString += `currently subscribed with a ${subscriptionBenefit.purchasedWithPrime ? 'Prime' : `tier ${subscriptionBenefit.tier[0]}`} subscription`;
			if (subscriptionBenefit.gift?.isGift) {
				const gifter = subscriptionBenefit.gift?.gifter
					? utils.getEffectiveName(
							subscriptionBenefit.gift.gifter.login,
							subscriptionBenefit.gift.gifter.displayName
						)
					: 'an anonymous gifter';
				subscriptionString += ` gifted by ${gifter}`;
			}
			if (subscriptionTenure)
				subscriptionString += ` for a total of ${subscriptionTenure.months} ${utils.format.plural(subscriptionTenure.months, 'month')}`;
			// subscription status is hidden - try to get the milestone from badges
			else {
				const subBadge = (
					channelViewerData?.channelViewer?.earnedBadges ?? []
				).find(b => b.setID === 'subscriber');
				if (subBadge) {
					const milestone = subBadge.version;
					subscriptionString += ` (status hidden, milestone: ${milestone} ${utils.format.plural(milestone, 'month')})`;
				}
			}
			if (subscriptionBenefit.platform)
				subscriptionString += `, purchased on platform ${subscriptionBenefit.platform}`;
			if (subscriptionBenefit.endsAt)
				subscriptionString += `, expires in ${utils.duration.format(Date.parse(subscriptionBenefit.endsAt) - now)}`;
			else if (subscriptionBenefit.renewsAt)
				subscriptionString += `, renews in ${utils.duration.format(Date.parse(subscriptionBenefit.renewsAt) - now)}`;
			if (subscriptionBenefit.thirdPartySKU)
				subscriptionString += `. Third-party SKU: ${subscriptionBenefit.thirdPartySKU}`;
		} else if (subscriptionTenure?.months) {
			subscriptionString += `used to be subscribed for a total of ${subscriptionTenure.months} ${utils.format.plural(subscriptionTenure.months, 'month')}`;
			if (subscriptionTenure.end)
				subscriptionString += `, expired ${utils.duration.format(now - Date.parse(subscriptionTenure.end))} ago`;
		}
		if (subscriptionString) responseParts.push(subscriptionString);

		return {
			text:
				responseParts.length === 1
					? `no relationship info found between ${userName} and ${channel.login}`
					: utils.format.join(responseParts),
			mention: true,
		};
	},
};
