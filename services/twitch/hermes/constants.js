export const WS_URL = `wss://hermes.twitch.tv/v1?clientId=${process.env.TWITCH_ANDROID_CLIENT_ID}`;
export const WS_CONNECTION_SPAWN_WINDOW_MS = 1000;
export const WS_CONNECTION_SPAWNS_PER_WINDOW = 1;
export const BASE64URL_CHARSET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const TopicState = { SUBSCRIBING: 0, SUBSCRIBED: 1, UNSUBSCRIBING: 2 };

// used for config validation
export const MAX_CONNECTIONS = 500;
export const MAX_TOPICS_PER_CONNECTION = 100;
