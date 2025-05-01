import logger from '../services/logger.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

export default {
	name: 'streaminfo',
	aliases: ['si'],
	description: 'get stream info',
	unsafe: false,
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'string',
			defaultValue: '',
			required: false,
			description: 'target channel (default: current channel)',
		},
	],
	execute: async msg => {
		const channelLogin = (
			msg.commandFlags.channel ||
			msg.args[0] ||
			msg.channelName
		).toLowerCase();

		let res;
		try {
			res = await twitch.gql.stream.get(channelLogin);
		} catch (err) {
			logger.error('error getting stream:', err);
			return { text: 'error getting stream', mention: true };
		}

		if (!res.user) return { text: 'channel does not exist', mention: true };

		const channelName = utils.getEffectiveName(
			res.user.login,
			res.user.displayName
		);
		const now = Date.now();
		function age(date) {
			return utils.duration.format(now - Date.parse(date));
		}

		if (!res.user.stream) {
			if (!res.user.lastBroadcast?.startedAt)
				return {
					text: `${channelName} has never streamed before`,
					mention: true,
				};

			const lastLiveResponsePart = `${channelName} was last live ${age(res.user.lastBroadcast.startedAt)} ago`;

			const lastVodId = res.user.videos?.edges[0]?.node?.id;
			if (!lastVodId) return { text: lastLiveResponsePart, mention: true };

			const vodData = await twitch.gql.video.get(lastVodId);
			if (!vodData.video) return { text: lastLiveResponsePart, mention: true };

			const responseParts = [lastLiveResponsePart];

			const vodDuration = utils.duration.format(
				vodData.video.lengthSeconds * 1000
			);
			let vodString = `latest VOD (${age(vodData.video.createdAt)} ago): https://www.twitch.tv/videos/${lastVodId}, ${vodDuration}`;

			if (vodData.video.viewCount)
				vodString += `, ${vodData.video.viewCount} ${utils.format.plural(vodData.video.viewCount, 'view')}`;

			const topClip = vodData.video.topClips?.edges[0]?.node;
			if (topClip) {
				const viewCountPart = topClip.viewCount
					? ` (${topClip.viewCount} ${utils.format.plural(topClip.viewCount, 'view')})`
					: '';
				const clipCreator = utils.getEffectiveName(
					topClip.curator.login,
					topClip.curator.displayName
				);
				const offset = utils.duration.format(topClip.videoOffsetSeconds * 1000);
				const featuredPart = topClip.isFeatured ? ', featured' : '';

				vodString += `, top clip${viewCountPart}: ${topClip.url}, created by ${clipCreator} ${offset} into the stream${featuredPart}`;
			}

			responseParts.push(vodString);
			return { text: utils.format.join(responseParts), mention: true };
		}

		const stream = res.user.stream;
		const responseParts = [
			stream.freeformTags?.some(t => t.name === 'Rerun')
				? `${channelName} is currently live with a rerun`
				: `${channelName} is currently live`,
			`uptime: ${age(stream.createdAt)}`,
		];

		if (res.user.broadcastSettings.title)
			parts.push(
				`title: ${utils.format.trim(res.user.broadcastSettings.title, 50)}`
			);
		if (stream.game?.displayName)
			parts.push(`category: ${stream.game.displayName}`);
		if (stream.language) parts.push(`language: ${stream.language}`);
		responseParts.push(`viewers: ${stream.viewersCount ?? 0}`);
		if (stream.averageFPS) parts.push(`fps: ${stream.averageFPS}`);
		if (stream.bitrate) parts.push(`bitrate: ${stream.bitrate} kbit/s`);
		if (stream.codec) parts.push(`codec: ${stream.codec}`);
		if (stream.width && stream.height)
			parts.push(`resolution: ${stream.width}x${stream.height}`);
		if (stream.clipCount) parts.push(`clips created: ${stream.clipCount}`);
		if (res.user.broadcastSettings.isMature)
			parts.push('flagged as mature content');
		if (res.user.stream.previewImageURL)
			responseParts.push(
				res.user.stream.previewImageURL + utils.randomString()
			);

		return { text: utils.format.join(responseParts), mention: true };
	},
};
