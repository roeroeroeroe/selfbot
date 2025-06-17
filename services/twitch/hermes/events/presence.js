import config from '../../../../config.json' with { type: 'json' };
import logger from '../../../logger.js';
import db from '../../../db/index.js';
import utils from '../../../../utils/index.js';
import twitch from '../../index.js';

export const subs = {
	user: ['presence'],
	channel: [],
};

export default {
	presence: async msg => {
		const activity = msg.data.activity;
		if (
			activity?.type !== 'watching' ||
			String(msg.data.user_id) !== config.bot.id
		)
			return;
		const channelName = utils.pickName(
			activity.channel_login,
			activity.channel_display_name
		);
		logger.info(
			`[Hermes] presence: watching #${channelName} (category: ${activity.game || 'N/A'})`
		);
		if (!config.twitch.hermes.autoJoinWatching) return;
		const channel = await db.channel.get(activity.channel_id);
		if (channel) return;
		try {
			await db.channel.insert(
				activity.channel_id,
				activity.channel_login,
				activity.channel_display_name
			);
			twitch.chat.join(activity.channel_login);
			twitch.hermes.subscribeToChannel(activity.channel_id);
			logger.info(`[Hermes] presence: joining #${channelName}`);
		} catch (err) {
			logger.error(`error joining channel ${activity.channel_login}:`, err);
		}
	},
};
