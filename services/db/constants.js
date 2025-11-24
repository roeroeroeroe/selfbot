export const MAX_MESSAGE_QUEUE_EMPTY_STREAKS = 3;
export const SEARCH_MESSAGES_DEFAULT_LIMIT = 1000;
export const PG_TRGM_MIN_SIMILARITY_THRESHOLD = 0.3;
export const VALID_CHANNELS_COLUMNS = new Set([
	'id',
	'login',
	'display_name',
	'log',
	'prefix',
	'suspended',
	'privileged',
	'joined_at',
]);
export const VALID_CUSTOMCOMMANDS_COLUMNS = new Set([
	'name',
	'channel_id',
	'trigger',
	'response',
	'runcmd',
	'whitelist',
	'cooldown',
	'reply',
	'mention',
]);
export const VALID_MESSAGES_COLUMNS = new Set([
	'id',
	'channel_id',
	'user_id',
	'text',
	'timestamp',
]);

export const MAX_PREFIX_LENGTH = 15;

// used for config validation
export const MAX_MESSAGES_FLUSH_INTERVAL_MS = 10000;
export const MAX_MESSAGES_PER_CHANNEL_FLUSH = 1000;
