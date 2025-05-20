export const counters = {
	HELIX_REQUESTS_SENT: 'helix_requests_sent',
	HELIX_RETRIES: 'helix_retries',

	HASTEBIN_REQUESTS_SENT: 'hastebin_requests_sent',
	HASTEBIN_RETRIES: 'hastebin_retries',

	COMMANDS_EXECUTED: 'commands_executed',
	CUSTOM_COMMANDS_EXECUTED: 'custom_commands_executed',

	GQL_REQUESTS_SENT: 'gql_requests_sent',
	GQL_RETRIES: 'gql_retries',
	GQL_ERRORS: 'gql_graphql_errors',

	HERMES_NOTIFICATIONS_RX: 'hermes_notifications_received',
	HERMES_NOTIFICATIONS_PROCESSED: 'hermes_notifications_processed',
	HERMES_RECONNECTS_RX: 'hermes_reconnects_received',
	HERMES_MISSED_KEEPALIVES: 'hermes_keepalives_missed',
	HERMES_JOINED_RAIDS: 'hermes_joined_raids',
	HERMES_ACKNOWLEDGED_WARNINGS: 'hermes_acknowledged_warnings',

	TMI_MESSAGES_RX: 'tmi_messages_received',
	TMI_MESSAGES_TX: 'tmi_messages_sent',
	GQL_TX_DROPPED_MESSAGES: 'gql_tx_dropped_messages',

	PG_QUERIES: 'postgres_queries',
};

export const gauges = {
	HERMES_CONNECTIONS: 'hermes_connections',
	HERMES_TOPICS: 'hermes_topics',
};
