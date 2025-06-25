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
import shutdown from './services/shutdown.js';
import cache from './services/cache/index.js';
import cooldown from './services/cooldown.js';
// prettier-ignore
(async () => {
	try {
		const t0 = performance.now();
		logger.debug('[INIT] validating configuration object:', config);
		configuration.validate();
		const t1 = performance.now();

		logger.debug('[INIT] validating token...');
		await twitch.oauth.validateToken(process.env.TWITCH_ANDROID_TOKEN,
		                                 process.env.TWITCH_ANDROID_CLIENT_ID,
		                                 config.bot.login, config.bot.id);
		const t2 = performance.now();
		logger.info('[INIT] validated token');

		logger.debug('[INIT] initializing metrics');
		metrics.init();
		const t3 = performance.now();

		logger.debug('[INIT] initializing db');
		await db.init();
		const t4 = performance.now();

		logger.debug('[INIT] initializing hermes');
		twitch.hermes.init();

		logger.debug('[INIT] loading commands');
		let c = await commands.load();
		const t5 = performance.now();
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'command')}`);

		logger.debug('[INIT] loading custom commands');
		c = await customCommands.load();
		const t6 = performance.now();
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'custom command')}`);

		await twitch.chat.connect();
		shutdown.register(twitch.cleanup);
		shutdown.register(db.cleanup);
		shutdown.register(cache.cleanup);
		shutdown.register(metrics.cleanup);
		shutdown.register(cooldown.cleanup);
		shutdown.register(logger.cleanup);
		const t7 = performance.now();
		logger.info(`[INIT] finished in ${(t7 - t0).toFixed(3)}ms`,
		            `(config: ${(t1 - t0).toFixed(3)}ms,`,
		            `token: ${(t2 - t1).toFixed(3)}ms,`,
		            `metrics: ${(t3 - t2).toFixed(3)}ms,`,
		            `db: ${(t4 - t3).toFixed(3)}ms,`,
		            `commands: ${(t5 - t4).toFixed(3)}ms,`,
		            `custom commands: ${(t6 - t5).toFixed(3)}ms,`,
		            `chat: ${(t7 - t6).toFixed(3)}ms)`);
	} catch (err) {
		logger.fatal('init error:', err);
	}
})();
