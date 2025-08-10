export const MESSAGES_WINDOW_MS = 30000;
export const REGULAR_MAX_MESSAGES_PER_WINDOW = 19;
export const REGULAR_MAX_MESSAGES_PER_WINDOW_PRIVILEGED = 99;
export const VERIFIED_MAX_MESSAGES_PER_WINDOW = 7499;
export const DUPLICATE_MESSAGE_THRESHOLD_MS = 30000;
export const INVIS_CHAR = ' \u{E0000}';
export const LOAD_INTERVAL_MS = 1800000;
export const JOINS_WINDOW_MS = 10000;
export const MAX_JOINS_PER_WINDOW = 950;
export const JOINED_CHANNELS_CACHE_TTL_MS = 500;
export const DEFAULT_SLOW_MODE_MS_BY_BACKEND = { gql: 1250, irc: 1100 };
export const REPLY_OVERHEAD_LENGTH = 2; // '@user '
export const MENTION_OVERHEAD_LENGTH = 3; // '@user, '
export const ACTION_OVERHEAD_LENGTH = 4; // '/me '

// used for config validation
export const REGULAR_MAX_CONNECTIONS_POOL_SIZE = 20;
export const VERIFIED_MAX_CONNECTIONS_POOL_SIZE = 200;
