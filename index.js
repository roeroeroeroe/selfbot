import 'dotenv/config';
import config from './config.json' with { type: 'json' };
import Client from './services/twitch/tmi.js';
import logger from './services/logger.js';
import commands from './services/commands.js';
import customCommands from './services/custom_commands.js';
import hermes from './services/twitch/hermes/client.js';
import { validateToken } from './services/twitch/oauth.js';
import { init as initDB } from './services/db.js';
import { toPlural } from './utils/formatters.js';

(async () => {
	try {
		logger.debug('[INIT] configuration object:', config);

		logger.debug('[INIT] validating token...');
		await validateToken(
			process.env.TWITCH_ANDROID_TOKEN,
			process.env.TWITCH_ANDROID_CLIENT_ID,
			config.bot.login,
			config.bot.id
		);
		logger.info('[INIT] validated token');

		logger.debug('[INIT] initializing db');
		await initDB();

		logger.debug('[INIT] initializing hermes');
		let c = await hermes.init();
		logger.info(`[INIT] subscribing to ${c} hermes ${toPlural(c, 'topic')}...`);

		logger.debug('[INIT] loading commands');
		c = await commands.load();
		logger.info(`[INIT] loaded ${c} ${toPlural(c, 'command')}`);

		logger.debug('[INIT] loading custom commands');
		c = await customCommands.load();
		logger.info(`[INIT] loaded ${c} ${toPlural(c, 'custom command')}`);

		logger.debug('[INIT] creating tmi client');
		new Client().connect();
	} catch (err) {
		logger.fatal('init error:', err);
	}
})();
