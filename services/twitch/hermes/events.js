import config from '../../../config.json' with { type: 'json' };
import cooldown from '../../cooldown.js';
import logger from '../../logger.js';
import db from '../../db.js';
import utils from '../../../utils/index.js';
import twitch from '../index.js';
import metrics from '../../metrics.js';

const JOINED_RAIDS_METRICS_COUNTER = 'hermes_joined_raids';
const ACKNOWLEDGED_WARNINGS_METRICS_COUNTER = 'hermes_acknowledged_warnings';
metrics.counter.create(JOINED_RAIDS_METRICS_COUNTER);
metrics.counter.create(ACKNOWLEDGED_WARNINGS_METRICS_COUNTER);

const CHANNEL_MODERATION_ACTION_COOLDOWN_MS = 2500;

const USER_MODERATION_ACTION_COOLDOWN_KEY_PREFIX =
	'hermes:user_moderation_action';
const RAID_COOLDOWN_KEY_PREFIX = 'hermes:raid_update_v2';

export default {
	user_moderation_action: async msg => {
		if (!msg.data?.channel_id) {
			logger.warning(`[Hermes] user_moderation_action: no channel id:`, msg);
			return;
		}
		if (
			msg.data?.target_id !== config.bot.id ||
			cooldown.has(
				`${USER_MODERATION_ACTION_COOLDOWN_KEY_PREFIX}:${msg.data.channel_id}`
			)
		)
			return;
		cooldown.set(
			`${USER_MODERATION_ACTION_COOLDOWN_KEY_PREFIX}:${msg.data.channel_id}`,
			CHANNEL_MODERATION_ACTION_COOLDOWN_MS
		);

		let user;
		try {
			user = await twitch.gql.user.resolve(null, msg.data.channel_id);
			if (!user) {
				logger.warning(
					`[Hermes] user_moderation_action: got no user for id ${msg.data.channel_id}: ${msg}`
				);
				return;
			}
		} catch (err) {
			logger.error(`error resolving user id ${msg.data.channel_id}:`, err);
			return;
		}

		const action = msg.data.action;
		const channelName = utils.getEffectiveName(user.login, user.displayName);

		let message = `[Hermes] user_moderation_action: ${action} in ${channelName}`;
		if (msg.data.reason)
			message += `, reason: ${utils.format.trim(msg.data.reason)}`;
		logger.info(message);

		if (action === 'warn' && config.autoAcknowledgeChatWarnings)
			try {
				const res = await twitch.gql.channel.acknowledgeChatWarning(
					msg.data.channel_id
				);
				const errorCode = res.acknowledgeChatWarning.error?.code;
				if (errorCode) logger.error('error acknowledging warning:', errorCode);
				else {
					metrics.counter.increment(ACKNOWLEDGED_WARNINGS_METRICS_COUNTER);
					logger.info(
						`[Hermes] user_moderation_action: acknowledged warning in ${channelName}`
					);
				}
			} catch (err) {
				logger.error('error acknowledging warning:', err);
			}
	},

	raid_update_v2: async msg => {
		if (!msg.raid?.id) {
			logger.warning(`[Hermes] raid_update_v2: no raid id:`, msg);
			return;
		}
		if (cooldown.has(`${RAID_COOLDOWN_KEY_PREFIX}:${msg.raid.id}`)) return;
		cooldown.set(`${RAID_COOLDOWN_KEY_PREFIX}:${msg.raid.id}`, 600000);

		const channel = await db.channel.get(msg.raid.source_id);
		if (!channel) {
			logger.warning(
				`[Hermes] raid_update_v2: unknown channel ${msg.raid.source_id}`
			);
			return;
		}
		const sourceChannelName = utils.getEffectiveName(
			channel.login,
			channel.display_name
		);
		const targetChannelName = utils.getEffectiveName(
			msg.raid.target_login,
			msg.raid.target_display_name
		);

		let message = `[Hermes] raid_update_v2: raid from ${sourceChannelName} to ${targetChannelName}`;
		if (msg.raid.creator_id && msg.raid.creator_id !== msg.raid.source_id) {
			try {
				const creator = await twitch.gql.user.resolve(
					null,
					msg.raid.creator_id
				);
				if (creator)
					message += ` (created by ${utils.getEffectiveName(creator.login, creator.displayName)})`;
			} catch (err) {
				logger.error(`error resolving user id ${msg.raid.creator_id}:`, err);
			}
		}
		logger.info(message);

		if (config.autoJoinRaids)
			try {
				const res = await twitch.gql.channel.joinRaid(msg.raid.id);
				if (res?.joinRaid?.raidID) {
					metrics.counter.increment(JOINED_RAIDS_METRICS_COUNTER);
					logger.info(
						`[Hermes] raid_update_v2: joined raid from ${sourceChannelName} to ${targetChannelName}, raid id: ${res.joinRaid.raidID}`
					);
				}
			} catch (err) {
				logger.error('error joining raid:', err);
			}
	},

	presence: async msg => {
		const activity = msg.data.activity;
		if (
			activity?.type !== 'watching' ||
			String(msg.data.user_id) !== config.bot.id
		)
			return;
		const channelName = utils.getEffectiveName(
			activity.channel_login,
			activity.channel_display_name
		);
		logger.info(
			`[Hermes] presence: watching ${channelName} (category: ${activity.game || 'N/A'})`
		);
		if (!config.autoJoinWatching) return;
		const channel = await db.channel.get(activity.channel_id);
		if (channel) return;
		try {
			await db.channel.insert(
				activity.channel_id,
				activity.channel_login,
				activity.channel_display_name
			);
			await twitch.chat.join(activity.channel_login);
			for (const sub of twitch.hermes.CHANNEL_SUBS)
				twitch.hermes.subscribe(sub, activity.channel_id);
			logger.info(`[Hermes] presence: joined ${channelName}`);
		} catch (err) {
			logger.error(`error joining channel ${activity.channel_login}:`, err);
		}
	},
};
