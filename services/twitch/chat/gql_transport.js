import metrics from '../../metrics.js';
import logger from '../../logger.js';
import twitch from '../index.js';
import utils from '../../../utils/index.js';

const DROPPED_MESSAGES_METRICS_COUNTER = 'gql_dropped_messages';
metrics.counter.create(DROPPED_MESSAGES_METRICS_COUNTER);

export default function createGqlTransport(botNonce) {
	return {
		async send(channelId, _, message, nonce = botNonce, parentId) {
			logger.debug('[GQL-TX]', channelId, message);
			return utils.retry(
				async () => {
					const res = await twitch.gql.chat.send(
						channelId,
						message,
						nonce,
						parentId
					);
					if (res.sendChatMessage?.dropReason) {
						metrics.counter.increment(DROPPED_MESSAGES_METRICS_COUNTER);
						const err = new Error(`dropped: ${res.sendChatMessage.dropReason}`);
						err.retryable = true;
						throw err;
					}
					return res;
				},
				{ logLabel: 'GQL-TX' }
			);
		},
	};
}
