import StringMatcher from '../services/string_matcher.js';
import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

const ERR_REDEEM_NO_REDEMPTION_ID = 'NO_REDEMPTION_ID';
const ERR_REDEEM_RPC = 'RPC_ERROR';

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

const rewardProperties = {
	title: 'title',
	cost: 'cost',
	isEnabled: 'enabled',
	isPaused: 'paused',
	isInStock: 'in stock',
	isSubOnly: 'sub-only',
	isUserInputRequired: 'requires input',
	cooldownExpiresAt: 'cooldown expires at',
};
const rewardPropertyKeys = Object.keys(rewardProperties),
	rewardPropertyValues = Object.values(rewardProperties);

export default {
	name: 'redeemreward',
	// prettier-ignore
	aliases: [
		'redeem',
		'listrewards',
	],
	description: 'redeem/list custom rewards (alias-driven)',
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
			description: 'target channel (default: current channel)',
		},
		{
			name: 'rewardTitle',
			short: 'r',
			long: 'reward',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'reward to redeem (redeem only)',
		},
		{
			name: 'input',
			short: 'i',
			long: 'input',
			type: 'string',
			required: false,
			defaultValue: '',
			description: 'input for the redemption (redeem only)',
		},
		{
			name: 'count',
			short: 'C',
			long: 'count',
			type: 'int',
			required: false,
			defaultValue: 1,
			description:
				'redeem the reward N times (default: 1, min: 1, max: 100) (redeem only)',
			validator: v => v >= 1 && v <= 100,
		},
		{
			name: 'refund',
			short: 'R',
			long: 'refund',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'auto-refund redemptions (redeem only)',
		},
		{
			name: 'force',
			short: 'f',
			long: 'force',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description:
				'bypass reward checks and try to redeem anyway (redeem only)',
		},
	],
	execute: async msg => {
		let action;
		switch (msg.commandName) {
			case 'redeem':
			case 'redeemreward':
				action = 'redeem';
				break;
			case 'listrewards':
				action = 'list';
		}
		const channelInput = utils.resolveLoginInput(
			msg.commandFlags.channel,
			msg.args[0],
			{ fallback: msg.channelName }
		);
		let res;
		try {
			res = await twitch.gql.channel.getCustomRewards(channelInput);
			if (!res.user?.login || !res.user.channel)
				return { text: 'channel does not exist', mention: true };
		} catch (err) {
			logger.error('error getting custom rewards:', err);
			return { text: 'error getting custom rewards', mention: true };
		}

		const channelName = utils.pickName(res.user.login, res.user.displayName);
		const communityPointsSettings = res.user.channel.communityPointsSettings;

		if (!communityPointsSettings?.isAvailable)
			return {
				text: `community points are unavailable in #${channelName}`,
				mention: true,
			};
		if (!communityPointsSettings.isEnabled)
			return {
				text: `community points are disabled in #${channelName}`,
				mention: true,
			};
		const rewards = communityPointsSettings.customRewards;
		if (!rewards.length)
			return {
				text: `no custom rewards found in #${channelName}`,
				mention: true,
			};
		const selfCommunityPoints = res.user.channel.self?.communityPoints;
		const balance = selfCommunityPoints?.balance;
		if (typeof balance !== 'number')
			return {
				text: 'failed to get current balance',
				mention: true,
			};

		if (action === 'list') {
			const redeemable = getRedeemable(
				rewards,
				selfCommunityPoints.canRedeemRewardsForFree,
				balance,
				!!res.user.self?.subscriptionBenefit?.id,
				res.user.login
			);
			const responseParts = [
				`balance: ${balance}`,
				`${rewards.length} ${utils.format.plural(rewards.length, 'custom reward')}` +
					` (${redeemable.length} redeemable)`,
			];
			try {
				const link = await paste.create(getFormattedList(rewards, redeemable));
				responseParts.push(link);
			} catch (err) {
				logger.error('error creating paste:', err);
				responseParts.push('error creating paste');
			}
			return { text: utils.format.join(responseParts), mention: true };
		}

		const { rewardTitle, input, count, refund, force } = msg.commandFlags;

		if (!rewardTitle)
			return { text: 'reward title is required', mention: true };

		const reward = rewards.find(r => r.title === rewardTitle);
		if (!reward) {
			let errorResponse = `reward "${rewardTitle}" does not exist in #${channelName}`;
			const redeemable = getRedeemable(
				rewards,
				selfCommunityPoints.canRedeemRewardsForFree,
				balance,
				!!res.user.self?.subscriptionBenefit?.id,
				res.user.login
			);
			if (!redeemable.length) return { text: errorResponse, mention: true };
			let closestTitle;
			try {
				closestTitle = new StringMatcher(
					redeemable.map(r => r.title)
				).getClosest(rewardTitle);
			} catch (err) {
				logger.warning(
					'failed to initialize string matcher for reward titles:',
					err
				);
			}
			if (closestTitle)
				errorResponse += `, most similar redeemable reward: ${closestTitle}`;
			return { text: errorResponse, mention: true };
		}

		if (
			!force &&
			reward.isSubOnly &&
			!res.user.self?.subscriptionBenefit?.id &&
			res.user.login !== config.bot.login
		)
			return {
				text: `reward "${rewardTitle}" is sub-only`,
				mention: true,
			};

		if (!force) {
			const totalCost = reward.cost * count;
			if (!selfCommunityPoints.canRedeemRewardsForFree && totalCost > balance)
				return {
					text: `insufficient balance (cost: ${totalCost}, balance: ${balance})`,
					mention: true,
				};
			if (!reward.isEnabled)
				return {
					text: `reward "${rewardTitle}" is disabled`,
					mention: true,
				};
			if (reward.isPaused)
				return {
					text: `reward "${rewardTitle}" is paused`,
					mention: true,
				};
			if (!reward.isInStock)
				return {
					text: `reward "${rewardTitle}" is out of stock`,
					mention: true,
				};
			if (reward.cooldownExpiresAt) {
				const fmtAvail = utils.duration.format(
					new Date(reward.cooldownExpiresAt) - Date.now()
				);
				return {
					text: `reward "${rewardTitle}" is on cooldown (will become available in ${fmtAvail})`,
					mention: true,
				};
			}
			if (reward.isUserInputRequired && !input)
				return {
					text: `reward "${rewardTitle}" requires input`,
					mention: true,
				};
			if (refund) {
				if (
					selfCommunityPoints.canRedeemRewardsForFree ||
					res.user.login === config.bot.login
				)
					return {
						text: `auto-refund is redundant for #${channelName}`,
						mention: true,
					};
				if (!res.user.self?.isModerator)
					return {
						text: 'auto-refund option requires moderator status',
						mention: true,
					};
			}
		}

		const { redeemErrors, refundsFailed } = await redeem(
			res.user.id,
			reward.id,
			reward.title,
			reward.cost,
			reward.prompt,
			input || null,
			count,
			refund
		);

		if (redeemErrors.length === count) {
			let errorResponse =
				count === 1
					? 'error redeeming reward'
					: `all ${count} redemptions failed`;
			errorResponse += `: ${redeemErrors[0]}`;
			if (redeemErrors.length > 1) {
				const rem = redeemErrors.length - 1;
				errorResponse += ` (${rem} more ${utils.format.plural(rem, 'error')}...)`;
			}
			return { text: errorResponse, mention: true };
		}

		let newBalance;
		try {
			newBalance =
				await twitch.gql.channel.getSelfChannelPointsBalance(channelInput);
			if (newBalance === null)
				return { text: 'failed to get new balance', mention: true };
		} catch (err) {
			logger.error('error getting channel points balance:', err);
			return { text: 'error getting new balance', mention: true };
		}

		const successes = count - redeemErrors.length;
		const responseParts = [
			`redeemed "${rewardTitle}" ${successes} ${utils.format.plural(successes, 'time')}`,
		];
		if (redeemErrors.length) {
			let errorsPart = `errors: ${redeemErrors[0]}`;
			const rem = redeemErrors.length - 1;
			if (rem)
				errorsPart += ` (${rem} more ${utils.format.plural(rem, 'error')}...)`;
			responseParts.push(errorsPart);
		}
		if (refund) {
			let refundPart;
			if (!refundsFailed) refundPart = 'auto-refunded';
			else if (refundsFailed === successes)
				refundPart = 'auto-refund failed for all redemptions';
			else
				refundPart = `auto-refund: ${successes - refundsFailed} succeeded, ${refundsFailed} failed`;
			responseParts.push(refundPart);
		}
		responseParts.push(`remaining balance: ${newBalance}`);
		return { text: utils.format.join(responseParts), mention: true };
	},
};
// prettier-ignore
function getRedeemable(rewards, canRedeemForFree, balance, isSubscribed,
                       channelLogin) {
	const redeemable = [];
	for (let i = 0; i < rewards.length; i++) {
		const r = rewards[i];
		if (r.isEnabled && !r.isPaused && r.isInStock &&
		    !r.cooldownExpiresAt &&
		    (canRedeemForFree || r.cost <= balance) &&
		    (!r.isSubOnly || isSubscribed || channelLogin === config.bot.login))
			redeemable.push(r);
	}
	return redeemable;
}

function getFormattedList(rewards, redeemable) {
	const redeemableIds = new Set(redeemable.map(r => r.id));
	const lines = [
		`redeemable${alignSep}${rewardPropertyValues.join(alignSep)}\n`,
	];
	const sortedRewards = rewards.slice().sort((a, b) => a.cost - b.cost);
	for (let i = 0; i < sortedRewards.length; i++) {
		const r = sortedRewards[i];
		const parts = [String(redeemableIds.has(r.id))];
		for (let j = 0; j < rewardPropertyKeys.length; j++) {
			const k = rewardPropertyKeys[j];
			const v = r[k];
			if (v === null || v === undefined) {
				parts.push('');
				continue;
			}
			if (k === 'cooldownExpiresAt') {
				parts.push(utils.date.format(v));
				continue;
			}
			parts.push(String(v));
		}
		lines.push(parts.join(alignSep));
	}
	return utils.format.align(lines);
}
// prettier-ignore
async function redeem(channelId, rewardId, title, cost, prompt, textInput,
                      count, refund) {
	const redeemErrors = [];
	const refundPromises = [];
	let refundsFailed = 0;
	for (let i = 0; i < count; i++) {
		let redemptionId;
		try {
			const res = await twitch.gql.channel.redeemCustomReward(
				channelId, rewardId, title, cost, prompt, textInput
			);
			const payload = res.redeemCommunityPointsCustomReward;
			const errCode = payload.error?.code;
			if (errCode) {
				redeemErrors.push(errCode);
				continue;
			}
			if (!(redemptionId = payload?.redemption?.id)) {
				redeemErrors.push(ERR_REDEEM_NO_REDEMPTION_ID);
				continue;
			}
		} catch (err) {
			logger.error('error redeeming custom reward:', err);
			redeemErrors.push(ERR_REDEEM_RPC);
			continue;
		}
		if (!refund)
			continue;
		refundPromises.push(
			twitch.gql.channel
				.refundCustomRewardRedemption(channelId, redemptionId)
				.then(res => {
					const errCode =
						res.updateCommunityPointsCustomRewardRedemptionStatus.error?.code;
					if (errCode) {
						logger.error('error refunding custom reward redemption:', errCode);
						refundsFailed++;
					}
				})
				.catch(err => {
					logger.error('error refunding custom reward redemption:', err);
					refundsFailed++;
				})
		);
	}
	if (refundPromises.length)
		await Promise.all(refundPromises);
	return { redeemErrors, refundsFailed };
}
