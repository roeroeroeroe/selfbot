import config from '../config.json' with { type: 'json' };
import NewLogger, { FLAGS, COLORIZE_MASK } from './logger/logger.js';

let flags = config.logger.colorize & COLORIZE_MASK;
if (config.logger.timestamp)
	flags |= FLAGS.TIMESTAMP;
if (config.logger.uptime)
	flags |= FLAGS.UPTIME;
if (config.logger.showErrorStackTraces)
	flags |= FLAGS.APPEND_ERROR_STACKS;
if (config.logger.bracketedLevel)
	flags |= FLAGS.BRACKETED_LEVEL;

export default NewLogger(config.logger.level, flags);
