import 'dotenv/config';
import configuration from './services/configuration/index.js';
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
		const timings = {};
		function mark(step) { timings[step] = performance.now(); }
		mark('start');

		configuration.config.validate();
		mark('config');

		await configuration.env.validate();
		mark('env');

		metrics.init();
		mark('metrics');

		await db.init();
		mark('db');

		twitch.hermes.init();
		mark('hermes');

		let c = await commands.load();
		mark('commands');
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'command')}`);

		c = await customCommands.load();
		mark('custom commands');
		logger.info(`[INIT] loaded ${c} ${utils.format.plural(c, 'custom command')}`);

		await twitch.chat.connect();
		mark('chat');

		shutdown.register(twitch.cleanup);
		shutdown.register(db.cleanup);
		shutdown.register(cache.cleanup);
		shutdown.register(metrics.cleanup);
		shutdown.register(cooldown.cleanup);
		shutdown.register(logger.cleanup);
		mark('shutdown');

		const steps = Object.keys(timings);
		const total = timings[steps[steps.length - 1]] - timings.start;
		const formattedTimings = [];
		for (let i = 1; i < steps.length; i++) {
			const step = steps[i];
			const delta = timings[step] - timings[steps[i - 1]];
			formattedTimings.push(`${step}: ${delta.toFixed(3)}ms`);
		}
		logger.info(`[INIT] finished in ${total.toFixed(3)}ms`,
		            `(${formattedTimings.join(', ')})`);
	} catch (err) {
		logger.fatal('init error:', err);
	}
})();
