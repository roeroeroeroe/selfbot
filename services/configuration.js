import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' with { type: 'json' };
import twitch from './twitch/index.js';
import db from './db/index.js';
import utils from '../utils/index.js';
import logger from './logger.js';

const configPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'../config.json'
);

function assert(bool, message) {
	if (!bool) throw new Error(message);
}
function assertBool(v) {
	assert(typeof v === 'boolean', 'must be a boolean');
}
function assertNonEmptyString(v) {
	assert(typeof v === 'string' && v.trim(), 'must be a non-empty string');
}
// prettier-ignore
function assertUsername(v) {
	assert(typeof v === 'string' && utils.regex.patterns.username.test(v),
	       'must be a valid username');
}
// prettier-ignore
function assertId(v) {
	assert(typeof v === 'string' && utils.regex.patterns.id.test(v),
	       'must be a valid id');
}
function assertNonNegativeInt(v) {
	assert(Number.isInteger(v) && v >= 0, 'must be a non-negative integer');
}
// prettier-ignore
function assertIntBetween(v, a, b) {
	assert(Number.isInteger(v) && v >= a && v <= b,
	       `must be an integer between ${a} and ${b}`);
}
// prettier-ignore
function assertFloatBetween(v, a, b) {
	assert(typeof v === 'number' && !Number.isNaN(v) && v >= a && v <= b,
	       `must be a float between ${a} and ${b}`);
}
// prettier-ignore
function assertStringOneOf(v, arr) {
	assert(typeof v === 'string' && arr.includes(v),
	       `must be one of: ${arr.join(', ')}`);
}
// prettier-ignore
function assertHttpUrl(v) {
	assert(utils.isValidHttpUrl(v) && !v.endsWith('/'),
	       'must be a valid HTTP URL with no trailing slashes');
}

function assertExecutable(v) {
	assertNonEmptyString(v);
	try {
		fs.accessSync(v, fs.constants.X_OK);
	} catch {
		throw new Error('must be executable');
	}
}
// prettier-ignore
const validators = {
	'bot.rateLimits': v => assertStringOneOf(v, ['regular', 'verified']),
	'bot.entryChannelLogin': v => assertUsername(v),
	'bot.login': v => assertUsername(v),
	'bot.id': v => assertId(v),
	'commands.defaultPrefix': v => assert(utils.isValidPrefix(v), 'must be a valid prefix'),
	'commands.loadUnsafe': v => assertBool(v),
	'commands.suggestClosest': v => assertBool(v),
	'messages.tosViolationPlaceholder': v => assertNonEmptyString(v),
	'messages.responsePartsSeparator': v => assertNonEmptyString(v),
	'messages.logByDefault': v => assertBool(v),
	'twitch.sender.backend': v => assertStringOneOf(v, ['irc', 'gql']),
	'twitch.irc.socket': v => assertStringOneOf(v, ['tcp', 'websocket']),
	'twitch.irc.maxChannelCountPerConnection': v => assertNonNegativeInt(v),
	'twitch.irc.connectionsPoolSize': v => {
		if (config.twitch.sender.backend !== 'irc') return;
		assertNonNegativeInt(v);
		const max =
			config.bot.rateLimits === 'verified'
				? twitch.chat.VERIFIED_MAX_CONNECTIONS_POOL_SIZE
				: twitch.chat.REGULAR_MAX_CONNECTIONS_POOL_SIZE;
		assert(v <= max, `cannot exceed ${max} with ${config.bot.rateLimits} 'bot.rateLimits'`);
	},
	'twitch.hermes.maxConnections': v =>
		assertIntBetween(v, 1, twitch.hermes.MAX_CONNECTIONS),
	'twitch.hermes.maxTopicsPerConnection': v =>
		assertIntBetween(v, 1, twitch.hermes.MAX_TOPICS_PER_CONNECTION),
	'twitch.hermes.autoAcknowledgeChatWarnings': v => assertBool(v),
	'twitch.hermes.autoJoinRaids': v => assertBool(v),
	'twitch.hermes.autoJoinWatching': v => assertBool(v),
	'twitch.hermes.autoBet.enabled': v => assertBool(v),
	'twitch.hermes.autoBet.ignoreOwnPredictions': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertBool(v);
	},
	'twitch.hermes.autoBet.minRequiredBalance': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertNonNegativeInt(v);
		assert(v >= twitch.MIN_PREDICTION_BET, `must be >= ${twitch.MIN_PREDICTION_BET}`);
	},
	'twitch.hermes.autoBet.strategy.betDelayPercent': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertIntBetween(v, 1, 99);
	},
	'twitch.hermes.autoBet.strategy.outcomeSelection': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertStringOneOf(v, ['mostPopular', 'highestMultiplier', 'poolMedian', 'random']);
	},
	'twitch.hermes.autoBet.strategy.bet.min': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertIntBetween(v, twitch.MIN_PREDICTION_BET, twitch.MAX_PREDICTION_BET);
	},
	'twitch.hermes.autoBet.strategy.bet.max': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertIntBetween(v, twitch.MIN_PREDICTION_BET, twitch.MAX_PREDICTION_BET);
		assert(v >= config.twitch.hermes.autoBet.strategy.bet.min,
		       "must be >= 'twitch.hermes.autoBet.strategy.bet.min'");
	},
	'twitch.hermes.autoBet.strategy.bet.poolFraction': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertFloatBetween(v, 0.001, 1);
	},
	'twitch.hermes.autoBet.strategy.bet.maxBalanceFraction': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertFloatBetween(v, 0.001, 1);
	},
	'twitch.hermes.autoBet.strategy.bet.onInsufficientFunds': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assertStringOneOf(v, ['betAll', 'abort']);
	},
	'retry.maxRetries': v => assertNonNegativeInt(v),
	'retry.baseDelayMs': v => assertNonNegativeInt(v),
	'retry.jitter': v => assertFloatBetween(v, 0, 1),
	'cache': v => assertStringOneOf(v, ['redis', 'valkey', 'inMemory']),
	'db.messagesFlushIntervalMs': v => assertIntBetween(v, 100, db.MAX_MESSAGES_FLUSH_INTERVAL_MS),
	'db.maxMessagesPerChannelFlush': v => assertIntBetween(v, 1, db.MAX_MESSAGES_PER_CHANNEL_FLUSH),
	'paste.service': v => assertStringOneOf(v, ['hastebin', 'nullPtr']),
	'paste.maxLength': v => assertNonNegativeInt(v),
	'paste.hastebin.instance': v => {
		if (config.paste.service !== 'hastebin') return;
		assertHttpUrl(v);
	},
	'paste.hastebin.raw': v => {
		if (config.paste.service !== 'hastebin') return;
		assertBool(v);
	},
	'paste.nullPtr.instance': v => {
		if (config.paste.service !== 'nullPtr') return;
		assertHttpUrl(v);
	},
	'paste.nullPtr.secret': v => {
		if (config.paste.service !== 'nullPtr') return;
		assertBool(v);
	},
	'metrics.enabled': v => assertBool(v),
	'metrics.sampleIntervalMs': v => {
		if (!config.metrics.enabled) return;
		assert(Number.isInteger(v) && v >= 1000, 'must be a >= 1000 integer');
	},
	'metrics.prometheus.enabled': v => {
		if (!config.metrics.enabled) return;
		assertBool(v);
	},
	'metrics.prometheus.host': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assertNonEmptyString(v);
	},
	'metrics.prometheus.port': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assertIntBetween(v, 1, 65535);
	},
	'metrics.prometheus.endpoint': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert(typeof v === 'string' && v.startsWith('/'), 'must be a valid endpoint');
	},
	'metrics.prometheus.prefix': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert(typeof v === 'string', 'must be a string');
	},
	'shell': v => {
		if (v === null) return;
		assert(process.platform !== 'win32', 'not supported on win32');
		assertExecutable(v);
	},
	'logger.level': v => assertStringOneOf(v, ['debug', 'info', 'warning', 'error', 'none']),
	'logger.showErrorStackTraces': v => assertBool(v),
	'logger.colorize': v => assertBool(v),
};

function traverse(pathStr) {
	const parts = pathStr.split('.');
	let obj = config;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		assert(
			typeof obj === 'object' && obj !== null && part in obj,
			`invalid config path: ${parts.slice(0, i + 1).join('.')}`
		);
		obj = obj[part];
	}

	const key = parts[parts.length - 1];
	assert(
		typeof obj === 'object' && obj !== null && key in obj,
		`invalid config path: ${pathStr}`
	);

	return { parent: obj, key, value: obj[key] };
}

function validateConfig() {
	for (const k in validators)
		try {
			validators[k](traverse(k).value);
		} catch (err) {
			throw new Error(`'${k}' ${err.message}`);
		}
}

async function updateConfig(pathStr, newValue) {
	logger.debug(`[CONFIGURATION] updating '${pathStr}', setting`, newValue);
	const { parent, key } = traverse(pathStr);

	const validator = validators[pathStr];
	if (validator)
		try {
			validator(newValue);
		} catch (err) {
			throw new Error(`${pathStr} ${err.message}`);
		}

	parent[key] = newValue;
	await fs.promises.writeFile(configPath, JSON.stringify(config, null, '\t'));
}

export default {
	validate: validateConfig,
	update: updateConfig,
};
