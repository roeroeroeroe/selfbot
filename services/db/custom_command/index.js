import * as queries from './queries.js';
import db from '../index.js';
import logger from '../../logger.js';

async function insertCustomCommand(
	commandName,
	channelId,
	trigger,
	response,
	runcmd,
	whitelist,
	cooldown,
	reply = false,
	mention = false
) {
	logger.debug(
		`[DB] inserting custom command ${commandName}:`,
		`channel_id: ${channelId}, trigger: ${trigger},`,
		`response: ${response}, runcmd: ${runcmd},`,
		`whitelist: ${whitelist}, cooldown: ${cooldown},`,
		`reply: ${reply}, mention: ${mention}`
	);
	await db.query(queries.INSERT_CUSTOM_COMMAND, [
		commandName,
		channelId,
		trigger,
		response,
		runcmd,
		whitelist,
		cooldown,
		reply,
		mention,
	]);
}
// prettier-ignore
function updateCustomCommand(commandName, newValues = {}) {
	const keys = Object.keys(newValues);
	if (!keys.length)
		return;
	const setClauses = [], values = [];
	for (const key of keys) {
		if (!db.VALID_CUSTOMCOMMANDS_COLUMNS.has(key))
			throw new Error(`invalid column name: ${key}`);
		setClauses.push(`${key} = $${values.push(newValues[key])}`);
	}
	return db.query(`
		UPDATE customcommands
		SET ${setClauses.join(', ')}
		WHERE name = $${values.push(commandName)}`, values);
}

async function deleteCustomCommand(commandName) {
	logger.debug('[DB] deleting custom command', commandName);
	await db.query(queries.DELETE_CUSTOM_COMMAND, [commandName]);
}

export default {
	queries,

	insert: insertCustomCommand,
	update: updateCustomCommand,
	delete: deleteCustomCommand,
};
