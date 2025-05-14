import config from '../../config.json' with { type: 'json' };
import db from './index.js';
import twitch from '../twitch/index.js';

export default async function init() {
	await db.query(db.CREATE_CHANNELS_TABLE);
	await db.query(db.CREATE_CUSTOMCOMMANDS_TABLE);
	await db.query(db.CREATE_MESSAGES_TABLE);

	await db.query(db.CREATE_TRGM_EXTENSION);

	for (const index of [
		db.CREATE_INDEX_MESSAGES_TEXT,
		db.CREATE_INDEX_MESSAGES_CHANNEL_ID,
		db.CREATE_INDEX_MESSAGES_CHANNEL_ID_USER_ID,
	])
		await db.query(index);

	// prettier-ignore
	const { exists } = (await db.query(db.CHECK_CHANNEL_EXISTS, [config.entry_channel.login]))[0];
	if (!exists) {
		const user = await twitch.gql.user.resolve(config.entry_channel.login);
		if (!user)
			throw new Error(
				`entry channel "${config.entry_channel.login}" does not exist`
			);

		await db.channel.insert(user.id, user.login, user.displayName);
	}

	setTimeout(db.message.initFlushMessages, config.messagesFlushIntervalMs);
}
