import db from './index.js';
import logger from '../logger.js';

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
	await db.query(db.INSERT_CUSTOM_COMMAND, [
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

async function updateCustomCommand(commandName, newValues = {}) {
	const keys = Object.keys(newValues);
	logger.debug(
		`[DB] updating custom command ${commandName}, setting`,
		`${keys.length} new values`
	);
	const values = [];
	let queryStr = 'UPDATE customcommands SET ',
		i = 1;
	for (const k of keys) {
		queryStr += `${k} = $${i++}, `;
		values.push(newValues[k]);
	}
	values.push(commandName);
	await db.query(`${queryStr.slice(0, -2)} WHERE name = $${i}`, values);
}

async function deleteCustomCommand(commandName) {
	logger.debug('[DB] deleting custom command', commandName);
	await db.query(db.DELETE_CUSTOM_COMMAND, [commandName]);
}

export default {
	insert: insertCustomCommand,
	update: updateCustomCommand,
	delete: deleteCustomCommand,
};
