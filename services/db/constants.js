import config from '../../config.json' with { type: 'json' };

export const QUERIES_METRICS_COUNTER = 'postgres_queries';

// used for config validation
export const MAX_MESSAGES_FLUSH_INTERVAL_MS = 10000;
export const MAX_MESSAGES_PER_CHANNEL_FLUSH = 1000;

export const MAX_MESSAGE_QUEUE_EMPTY_STREAKS = 3;
export const PG_TRGM_MIN_SIMILARITY_THRESHOLD = 0.3;

export const CREATE_CHANNELS_TABLE = `
CREATE TABLE IF NOT EXISTS channels (
	id           VARCHAR(15) PRIMARY KEY,
	login        VARCHAR(25) UNIQUE NOT NULL,
	display_name TEXT        NOT NULL,
	log          BOOLEAN     NOT NULL DEFAULT ${config.logMessagesByDefault},
	prefix       VARCHAR(15) NOT NULL DEFAULT '${config.defaultPrefix}',
	suspended    BOOLEAN     NOT NULL DEFAULT false,
	privileged   BOOLEAN     NOT NULL DEFAULT false,
	joined_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export const CREATE_CUSTOMCOMMANDS_TABLE = `
CREATE TABLE IF NOT EXISTS customcommands (
	name       TEXT         PRIMARY KEY,
	channel_id VARCHAR(15)  REFERENCES channels(id) ON DELETE CASCADE,
	trigger    TEXT         NOT NULL,
	response   VARCHAR(500),
	runcmd     TEXT,
	whitelist  TEXT[],
	cooldown   INTEGER      NOT NULL DEFAULT 0,
	reply      BOOLEAN      NOT NULL DEFAULT false,
	mention    BOOLEAN      NOT NULL DEFAULT false
)`;

export const CREATE_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS messages (
	id         BIGSERIAL    PRIMARY KEY,
	channel_id VARCHAR(15)  REFERENCES channels(id) ON DELETE CASCADE,
	user_id    VARCHAR(15)  NOT NULL,
	text       VARCHAR(500) NOT NULL,
	timestamp  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export const CREATE_TRGM_EXTENSION = `
CREATE EXTENSION IF NOT EXISTS pg_trgm`;

export const CREATE_INDEX_MESSAGES_TEXT = `
CREATE INDEX IF NOT EXISTS idx_messages_text_trgm
ON messages USING gin(text gin_trgm_ops)`;

export const CREATE_INDEX_MESSAGES_CHANNEL_ID = `
CREATE INDEX IF NOT EXISTS idx_messages_channel_id
ON messages(channel_id)`;

export const CREATE_INDEX_MESSAGES_CHANNEL_ID_USER_ID = `
CREATE INDEX IF NOT EXISTS idx_messages_channel_id_user_id
ON messages(channel_id, user_id)`;

export const CHECK_CHANNEL_EXISTS = `
SELECT EXISTS(
	SELECT 1
	FROM channels
	WHERE login = $1
)`;

export const INSERT_CHANNEL = `
INSERT INTO channels (
	id, login, display_name, log, prefix, suspended, privileged
) VALUES ($1, $2, $3, $4, $5, $6, $7)`;

export const UPDATE_CHANNEL = k => `
UPDATE channels SET ${k} = $1 WHERE id = $2`;

export const SELECT_CHANNEL = `
SELECT id, login, display_name, log, prefix, suspended, privileged, joined_at
FROM channels
WHERE id = $1`;

export const DELETE_CHANNEL = `
DELETE FROM channels
WHERE id = $1`;

export const INSERT_CUSTOM_COMMAND = `
INSERT INTO customcommands (
	name, channel_id, trigger, response, runcmd, whitelist, cooldown, reply, mention
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

export const DELETE_CUSTOM_COMMAND = `
DELETE FROM customcommands
WHERE name = $1`;

export const COPY_MESSAGES_STREAM = `
COPY messages (channel_id, user_id, text, timestamp)
	FROM STDIN WITH (FORMAT text)`;
