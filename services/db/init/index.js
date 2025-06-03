import config from '../../../config.json' with { type: 'json' };
import * as queries from './queries.js';
import db from '../index.js';
import twitch from '../../twitch/index.js';

export default async function init() {
	await db.query(queries.CREATE_CHANNELS_TABLE);
	await db.query(queries.CREATE_CUSTOMCOMMANDS_TABLE);
	await db.query(queries.CREATE_MESSAGES_TABLE);

	await db.query(queries.CREATE_TRGM_EXTENSION);

	for (const index of [
		queries.CREATE_INDEX_MESSAGES_TEXT,
		queries.CREATE_INDEX_MESSAGES_CHANNEL_ID,
		queries.CREATE_INDEX_MESSAGES_CHANNEL_ID_USER_ID,
	])
		await db.query(index);

	const { exists } = (
		await db.query(db.channel.queries.CHECK_CHANNEL_EXISTS, [
			config.bot.entryChannelLogin,
		])
	)[0];
	if (!exists) {
		const user = await twitch.gql.user.resolve(config.bot.entryChannelLogin);
		if (!user)
			throw new Error(
				`entry channel "${config.bot.entryChannelLogin}" does not exist`
			);

		await db.channel.insert(user.id, user.login, user.displayName);
	}

	setTimeout(db.message.initFlushMessages, config.db.messagesFlushIntervalMs);
}
