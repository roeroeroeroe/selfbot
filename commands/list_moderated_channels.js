import logger from '../services/logger.js';
import { getModeratedChannels } from '../services/twitch/gql.js';
import { createPaste } from '../services/hastebin.js';
import { getEffectiveName } from '../utils/utils.js';
import {
	formatDate,
	joinResponseParts,
	toPlural,
	alignLines,
} from '../utils/formatters.js';

export default {
	name: 'moderatedchannels',
	aliases: ['mc', 'listmc'],
	description: 'list moderated channels',
	unsafe: false,
	flags: [],
	execute: async msg => {
		const list = [];
		const counters = {
			editable: { count: 0, desc: 'editor in' },
			live: { count: 0, desc: 'live' },
			staff: { count: 0, desc: 'staff' },
			exStaff: { count: 0, desc: 'ex-staff' },
			partners: { count: 0, desc: 'partners' },
			affiliates: { count: 0, desc: 'affiliates' },
			totalFollowers: { count: 0, desc: 'total followers' },
		};

		const moderatedChannelsEdges = await getModeratedChannels();
		if (!moderatedChannelsEdges.length)
			return { text: '0 channels', mention: true };

		for (const e of moderatedChannelsEdges) {
			const lineParts = [getEffectiveName(e.node.login, e.node.displayName)];
			if (e.isLive) {
				const viewers = e.node.stream?.viewersCount || 0;
				lineParts.push(`live (${viewers} ${toPlural(viewers, 'viewer')})`);
				counters.live.count++;
			}
			if (e.node.roles?.isStaff) {
				lineParts.push('staff');
				counters.staff.count++;
			} else if (e.node.roles?.isStaff === false) {
				lineParts.push('ex-staff');
				counters.exStaff.count++;
			}
			if (e.node.roles?.isPartner) {
				lineParts.push('partner');
				counters.partners.count++;
			} else if (e.node.roles?.isAffiliate) {
				lineParts.push('affiliate');
				counters.affiliates.count++;
			}
			const followers = e.node.followers?.totalCount || 0;
			if (followers) {
				lineParts.push(`${followers} ${toPlural(followers, 'follower')}`);
				counters.totalFollowers.count += followers;
			}

			lineParts[lineParts.length - 1] +=
				`__ALIGN__granted at: ${formatDate(e.grantedAt)}`;

			if (e.node.self.isEditor) {
				lineParts.push('editor');
				counters.editable.count++;
			}
			list.push(joinResponseParts(lineParts));
		}

		const messageParts = [
			`${moderatedChannelsEdges.length} ${toPlural(moderatedChannelsEdges.length, 'channel')}`,
		];

		for (const counter of Object.values(counters))
			if (counter.count) messageParts.push(`${counter.desc}: ${counter.count}`);

		try {
			const link = await createPaste(alignLines(list), true);
			messageParts.push(link);
			return { text: joinResponseParts(messageParts), mention: true };
		} catch (err) {
			logger.error('error creating paste:', err);
			messageParts.push('error creating paste');
			return { text: joinResponseParts(messageParts), mention: true };
		}
	},
};
