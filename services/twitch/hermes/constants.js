export const WS_URL = `wss://hermes.twitch.tv/v1?clientId=${process.env.TWITCH_ANDROID_CLIENT_ID}`;
export const HEALTH_CHECK_INTERVAL_MS = 2000;
export const WS_CONNECTION_SPAWN_WINDOW_MS = 1000;
export const WS_CONNECTION_SPAWNS_PER_WINDOW = 1;
export const BASE64URL_CHARSET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const USER_SUBS = ['chatrooms-user-v1', 'presence'];
export const CHANNEL_SUBS = ['raid'];
export const TopicState = { SUBSCRIBING: 0, SUBSCRIBED: 1, UNSUBSCRIBING: 2 };

export const CHANNEL_MODERATION_ACTION_COOLDOWN_MS = 2500;
export const USER_MODERATION_ACTION_COOLDOWN_KEY_PREFIX =
	'hermes:user_moderation_action';
export const RAID_COOLDOWN_KEY_PREFIX = 'hermes:raid_update_v2';

// used for config validation
export const MAX_CONNECTIONS = 100;
export const MAX_TOPICS_PER_CONNECTION = 100;
