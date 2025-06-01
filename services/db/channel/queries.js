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

export const SELECT_CHANNEL = `
SELECT id, login, display_name, log, prefix, suspended, privileged, joined_at
FROM channels
WHERE id = $1`;

export const SELECT_CHANNEL_BY_LOGIN = `
SELECT id, login, display_name, log, prefix, suspended, privileged, joined_at
FROM channels
WHERE login = $1`;

export const DELETE_CHANNEL = `
DELETE FROM channels
WHERE id = $1`;
