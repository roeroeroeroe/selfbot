import logger from '../services/logger.js';
import utils from '../utils/index.js';
import twitch from '../services/twitch/index.js';

const MAX_STREAM_TITLE_LENGTH = 50;

export default {
	name: 'streaminfo',
	aliases: ['si'],
	description: 'get stream info',
	unsafe: false,
	lock: 'NONE',
	flags: [
		{
			name: 'channel',
			aliases: ['c', 'channel'],
			type: 'username',
			defaultValue: null,
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

		const channelName = utils.pickName(res.user.login, res.user.displayName);
		const age = utils.duration.createAge(Date.now());

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
				const clipCreator = utils.pickName(
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
			responseParts.push(
				`title: ${utils.format.trim(res.user.broadcastSettings.title, MAX_STREAM_TITLE_LENGTH)}`
			);
		if (stream.game?.displayName)
			responseParts.push(`category: ${stream.game.displayName}`);
		if (stream.language) responseParts.push(`language: ${stream.language}`);
		responseParts.push(`viewers: ${stream.viewersCount ?? 0}`);
		if (stream.averageFPS) responseParts.push(`fps: ${stream.averageFPS}`);
		if (stream.bitrate) responseParts.push(`bitrate: ${stream.bitrate} kbit/s`);
		if (stream.codec) responseParts.push(`codec: ${stream.codec}`);
		if (stream.width && stream.height)
			responseParts.push(`resolution: ${stream.width}x${stream.height}`);
		if (stream.clipCount)
			responseParts.push(`clips created: ${stream.clipCount}`);
		if (res.user.broadcastSettings.isMature)
			responseParts.push('flagged as mature content');
		if (res.user.stream.previewImageURL)
			responseParts.push(
				res.user.stream.previewImageURL + utils.randomString()
			);

		return { text: utils.format.join(responseParts), mention: true };
	},
};
