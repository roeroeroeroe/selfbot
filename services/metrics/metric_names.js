const counters = {
	CACHE_HITS: 'cache_hits',
	CACHE_MISSES: 'cache_misses',

	COMMANDS_EXECUTED: 'commands_executed',
	CUSTOM_COMMANDS_EXECUTED: 'custom_commands_executed',

	GQL_ERRORS: 'gql_graphql_errors',
	GQL_MESSAGES_DROPPED: 'gql_messages_dropped',
	GQL_REQUESTS_TX: 'gql_requests_sent',
	GQL_RETRIES: 'gql_retries',

	HELIX_REQUESTS_TX: 'helix_requests_sent',
	HELIX_RETRIES: 'helix_retries',

	HERMES_ACKNOWLEDGED_WARNINGS: 'hermes_warnings_acknowledged',
	HERMES_JOINED_RAIDS: 'hermes_raids_joined',
	HERMES_MISSED_KEEPALIVES: 'hermes_keepalives_missed',
	HERMES_NOTIFICATIONS_PROCESSED: 'hermes_notifications_processed',
	HERMES_NOTIFICATIONS_RX: 'hermes_notifications_received',
	HERMES_PREDICTIONS_BETS_PLACED: 'hermes_predictions_bets_placed',
	HERMES_PREDICTIONS_LOST: 'hermes_predictions_lost',
	HERMES_PREDICTIONS_REFUNDED: 'hermes_predictions_refunded',
	HERMES_PREDICTIONS_WON: 'hermes_predictions_won',
	HERMES_RECONNECTS_RX: 'hermes_reconnects_received',

	PASTE_REQUESTS_TX: 'paste_requests_sent',
	PASTE_RETRIES: 'paste_retries',

	PG_QUERIES: 'postgres_queries',

	TMI_MESSAGES_RX: 'tmi_messages_received',
	TMI_MESSAGES_TX: 'tmi_messages_sent',
};

const gauges = {
	HERMES_CONNECTIONS: 'hermes_connections',
	HERMES_TOPICS: 'hermes_topics',
};

export default {
	counters,
	gauges,
};
