import logger from '../services/logger.js';
import paste from '../services/paste/index.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

export default {
	name: 'moderatedchannels',
	aliases: ['mc', 'listmc'],
	description: 'list moderated channels',
	unsafe: false,
	lock: 'CHANNEL',
	flags: [
		{
			name: 'info',
			short: 'i',
			long: 'info',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print summary only',
		},
	],
	execute: async msg => {
		const counters = {
			editable: { count: 0, label: 'editor in' },
			live: { count: 0, label: 'live' },
			staff: { count: 0, label: 'staff' },
			exStaff: { count: 0, label: 'ex-staff' },
			partners: { count: 0, label: 'partners' },
			affiliates: { count: 0, label: 'affiliates' },
			totalFollowers: { count: 0, label: 'total followers' },
		};

		let moderatedChannelEdges;
		try {
			moderatedChannelEdges =
				await twitch.gql.channel.getSelfModeratedChannels();
		} catch (err) {
			logger.error('error getting moderated channels:', err);
			return { text: 'error getting moderated channels', mention: true };
		}

		const channelCount = moderatedChannelEdges.length;
		if (!channelCount) return { text: '0 channels', mention: true };

		const lines = [];

		let processEdge;
		if (msg.commandFlags.info)
			processEdge = function (e) {
				const user = e.node;
				const { roles, followers } = user;
				if (e.isLive) counters.live.count++;
				if (roles?.isStaff) counters.staff.count++;
				else if (roles?.isStaff === false) counters.exStaff.count++;
				if (roles?.isPartner) counters.partners.count++;
				else if (roles?.isAffiliate) counters.affiliates.count++;
				if (followers?.totalCount)
					counters.totalFollowers.count += followers.totalCount;
				if (user.self.isEditor) counters.editable.count++;
			};
		else
			processEdge = function (e) {
				const { node: user, isLive, grantedAt } = e;
				const lineParts = [utils.pickName(user.login, e.node.displayName)];
				if (isLive) {
					const viewers = user.stream?.viewersCount || 0;
					lineParts.push(
						`live (${viewers} ${utils.format.plural(viewers, 'viewer')})`
					);
					counters.live.count++;
				}
				const { roles, followers } = user;
				if (roles?.isStaff) {
					lineParts.push('staff');
					counters.staff.count++;
				} else if (roles?.isStaff === false) {
					lineParts.push('ex-staff');
					counters.exStaff.count++;
				}
				if (roles?.isPartner) {
					lineParts.push('partner');
					counters.partners.count++;
				} else if (roles?.isAffiliate) {
					lineParts.push('affiliate');
					counters.affiliates.count++;
				}
				const followersCount = followers?.totalCount;
				if (followersCount) {
					lineParts.push(
						`${followersCount} ${utils.format.plural(followersCount, 'follower')}`
					);
					counters.totalFollowers.count += followersCount;
				}
				lineParts[lineParts.length - 1] +=
					`${alignSep}granted at: ${utils.date.format(grantedAt)}`;

				if (user.self.isEditor) {
					lineParts.push('editor');
					counters.editable.count++;
				}
				lines.push(utils.format.join(lineParts));
			};

		for (let i = 0; i < channelCount; i++)
			processEdge(moderatedChannelEdges[i]);

		const responseParts = [
			`${channelCount} ${utils.format.plural(channelCount, 'channel')}`,
		];

		for (const c of Object.values(counters))
			if (c.count) responseParts.push(`${c.label}: ${c.count}`);

		if (!msg.commandFlags.info)
			try {
				const link = await paste.create(utils.format.align(lines));
				responseParts.push(link);
			} catch (err) {
				logger.error('error creating paste:', err);
				responseParts.push('error creating paste');
			}

		return { text: utils.format.join(responseParts), mention: true };
	},
};
