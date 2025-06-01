const counters = {
	CACHE_HITS: 'cache_hits',
	CACHE_MISSES: 'cache_misses',

	COMMANDS_EXECUTED: 'commands_executed',
	CUSTOM_COMMANDS_EXECUTED: 'custom_commands_executed',

	GQL_ERRORS: 'gql_graphql_errors',
	GQL_MESSAGES_DROPPED: 'gql_messages_dropped',
	GQL_REQUESTS_TX: 'gql_requests_sent',
	GQL_RETRIES: 'gql_retries',

	HASTEBIN_REQUESTS_TX: 'hastebin_requests_sent',
	HASTEBIN_RETRIES: 'hastebin_retries',

	HELIX_REQUESTS_TX: 'helix_requests_sent',
	HELIX_RETRIES: 'helix_retries',

	HERMES_ACKNOWLEDGED_WARNINGS: 'hermes_acknowledged_warnings',
	HERMES_JOINED_RAIDS: 'hermes_joined_raids',
	HERMES_MISSED_KEEPALIVES: 'hermes_keepalives_missed',
	HERMES_NOTIFICATIONS_PROCESSED: 'hermes_notifications_processed',
	HERMES_NOTIFICATIONS_RX: 'hermes_notifications_received',
	HERMES_RECONNECTS_RX: 'hermes_reconnects_received',

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
