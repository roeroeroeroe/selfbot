import config from '../../../../config.json' with { type: 'json' };
import cooldown from '../../../cooldown.js';
import logger from '../../../logger.js';
import metrics from '../../../metrics/index.js';
import utils from '../../../../utils/index.js';
import twitch from '../../index.js';
import {
	CHANNEL_MODERATION_ACTION_COOLDOWN_MS,
	USER_MODERATION_ACTION_COOLDOWN_KEY_PREFIX,
} from './constants.js';

export const subs = {
	user: ['chatrooms-user-v1'],
	channel: [],
};

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
		const channelName = utils.pickName(user.login, user.displayName);

		let message = `[Hermes] user_moderation_action: ${action} in #${channelName}`;
		if (msg.data.reason)
			message += `, reason: ${utils.format.trim(msg.data.reason)}`;
		logger.info(message);

		if (!config.twitch.hermes.autoAcknowledgeChatWarnings || action !== 'warn')
			return;
		try {
			const res = await twitch.gql.channel.acknowledgeChatWarning(
				msg.data.channel_id
			);
			const errCode = res.acknowledgeChatWarning.error?.code;
			if (errCode) logger.error('error acknowledging warning:', errCode);
			else {
				metrics.counter.increment(
					metrics.names.counters.HERMES_ACKNOWLEDGED_WARNINGS
				);
				logger.info(
					`[Hermes] user_moderation_action: acknowledged warning in #${channelName}`
				);
			}
		} catch (err) {
			logger.error('error acknowledging warning:', err);
		}
	},
};
