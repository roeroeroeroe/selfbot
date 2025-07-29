export const WS_URL = `wss://hermes.twitch.tv/v1?clientId=${process.env.TWITCH_HERMES_CLIENT_ID}`;
export const WS_CONNECTION_SPAWN_WINDOW_MS = 1000;
export const WS_CONNECTION_SPAWNS_PER_WINDOW = 1;
export const RESUBSCRIBE_DELAY_MS = 1000;
export const ID_LENGTH = 21;
export const TopicState = { SUBSCRIBING: 0, SUBSCRIBED: 1, UNSUBSCRIBING: 2 };
export const AUTH_ERROR = {
	AUTH001: 'AUTH001', // must provide token
	AUTH002: 'AUTH002', // bad token
};
export const SUB_ERROR = {
	SUB001: 'SUB001', // internal error
	SUB002: 'SUB002', // invalid topic
	SUB004: 'SUB004', // duplicate subscription
	SUB006: 'SUB006', // too many subscriptions
	SUB007: 'SUB007', // unauthorized
};

// used for config validation
export const MAX_CONNECTIONS = 200;
export const MAX_TOPICS_PER_CONNECTION = 100;
