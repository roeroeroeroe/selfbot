import 'dotenv/config';
import config from './config.json' with { type: 'json' };
import configuration from './services/configuration.js';
import twitch from './services/twitch/index.js';
import metrics from './services/metrics/index.js';
import logger from './services/logger.js';
import db from './services/db/index.js';
import commands from './services/commands.js';
import customCommands from './services/custom_commands.js';
import utils from './utils/index.js';
// prettier-ignore
(async () => {
	try {
		logger.debug('[INIT] validating configuration object:', config);
		configuration.validate();

		logger.debug('[INIT] validating token...');
		await twitch.oauth.validateToken(
			process.env.TWITCH_ANDROID_TOKEN,
			process.env.TWITCH_ANDROID_CLIENT_ID,
			config.bot.login,
			config.bot.id
		);
		logger.info('[INIT] validated token');

		logger.debug('[INIT] initializing metrics');
		metrics.init();

		logger.debug('[INIT] initializing db');
		await db.init();

		logger.debug('[INIT] initializing hermes');
		let c = await twitch.hermes.init();
		logger.info(`[INIT] subscribing to ${c} hermes ${utils.format.plural(c, 'topic')}...`);

		logger.debug('[INIT] loading commands');
		c = await commands.load();
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'command')}`);

		logger.debug('[INIT] loading custom commands');
		c = await customCommands.load();
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'custom command')}`);

		await twitch.chat.connect();
	} catch (err) {
		logger.fatal('init error:', err);
	}
})();
