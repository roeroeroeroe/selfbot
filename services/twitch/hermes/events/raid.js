import config from '../../../../config.json' with { type: 'json' };
import cooldown from '../../../cooldown.js';
import logger from '../../../logger.js';
import metrics from '../../../metrics/index.js';
import db from '../../../db/index.js';
import utils from '../../../../utils/index.js';
import twitch from '../../index.js';
import { RAID_COOLDOWN_KEY_PREFIX } from './constants.js';

export const subs = {
	user: [],
	channel: ['raid'],
};

export default {
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
				`[Hermes] raid_update_v2: unknown channel id: ${msg.raid.source_id}`
			);
			return;
		}
		const sourceChannelName = utils.pickName(
			channel.login,
			channel.display_name
		);
		const targetChannelName = utils.pickName(
			msg.raid.target_login,
			msg.raid.target_display_name
		);

		let message = `[Hermes] raid_update_v2: raid from #${sourceChannelName} to #${targetChannelName}`;
		if (msg.raid.creator_id && msg.raid.creator_id !== msg.raid.source_id) {
			try {
				const creator = await twitch.gql.user.resolve(
					null,
					msg.raid.creator_id
				);
				if (creator)
					message += ` (created by ${utils.pickName(creator.login, creator.displayName)})`;
			} catch (err) {
				logger.error(`error resolving user id ${msg.raid.creator_id}:`, err);
			}
		}
		logger.info(message);

		if (config.twitch.hermes.autoJoinRaids)
			try {
				const res = await twitch.gql.channel.joinRaid(msg.raid.id);
				if (!res?.joinRaid?.raidID) return;
				metrics.counter.increment(metrics.names.counters.HERMES_JOINED_RAIDS);
				logger.info(
					`[Hermes] raid_update_v2: joined raid from #${sourceChannelName} to #${targetChannelName}, raid id: ${res.joinRaid.raidID}`
				);
			} catch (err) {
				logger.error('error joining raid:', err);
			}
	},
};
