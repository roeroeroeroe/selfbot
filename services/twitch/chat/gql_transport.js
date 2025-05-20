import metrics from '../../metrics/index.js';
import logger from '../../logger.js';
import twitch from '../index.js';
import utils from '../../../utils/index.js';

export default function createGqlTransport(botNonce) {
	return {
		send(channelId, _, message, nonce = botNonce, parentId) {
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
						metrics.counter.increment(
							metrics.names.counters.GQL_TX_DROPPED_MESSAGES
						);
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
