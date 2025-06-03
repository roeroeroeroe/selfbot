import config from '../../../config.json' with { type: 'json' };

export const CREATE_CHANNELS_TABLE = `
CREATE TABLE IF NOT EXISTS channels (
	id           VARCHAR(15) PRIMARY KEY,
	login        VARCHAR(25) UNIQUE NOT NULL,
	display_name TEXT        NOT NULL,
	log          BOOLEAN     NOT NULL DEFAULT ${config.messages.logByDefault},
	prefix       VARCHAR(15) NOT NULL DEFAULT '${config.commands.defaultPrefix}',
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
