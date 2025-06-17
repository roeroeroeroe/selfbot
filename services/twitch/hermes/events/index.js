import config from '../../../../config.json' with { type: 'json' };
import moderationAction, {
	subs as moderationActionSubs,
} from './moderation_action.js';
import raid, { subs as raidSubs } from './raid.js';
import presence, { subs as presenceSubs } from './presence.js';
import prediction, { subs as predictionSubs } from './prediction.js';

export const subs = { user: [], channel: [] };
const handlers = {};

function add(newHandlers, newSubs) {
	Object.assign(handlers, newHandlers);
	for (const t of newSubs.user) subs.user.push(t);
	for (const t of newSubs.channel) subs.channel.push(t);
}

add(moderationAction, moderationActionSubs);
if (config.twitch.hermes.autoJoinRaids) add(raid, raidSubs);
if (config.twitch.hermes.autoJoinWatching) add(presence, presenceSubs);
if (config.twitch.hermes.autoBet.enabled) add(prediction, predictionSubs);

export default handlers;
