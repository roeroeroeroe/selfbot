export const INSERT_CUSTOM_COMMAND = `
INSERT INTO customcommands (
	name, channel_id, trigger, response, runcmd, whitelist, cooldown, reply, mention
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

export const DELETE_CUSTOM_COMMAND = `
DELETE FROM customcommands
WHERE name = $1`;
