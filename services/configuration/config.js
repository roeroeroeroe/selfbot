import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../../config.json' with { type: 'json' };
import twitch from '../twitch/index.js';
import db from '../db/index.js';
import logger from '../logger.js';
import utils from '../../utils/index.js';
import assert from './assert.js';

const configPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../config.json'
);

// prettier-ignore
const validators = {
	'bot.rateLimits': v => assert.stringOneOf(v, ['regular', 'verified']),
	'bot.entryChannelLogin': assert.username,
	'bot.login': assert.username,
	'bot.id': assert.id,
	'commands.defaultPrefix': v => assert.assert(utils.isValidPrefix(v), 'must be a valid prefix'),
	'commands.loadUnsafe': assert.bool,
	'commands.suggestClosest': assert.bool,
	'messages.tosViolationPlaceholder': assert.nonEmptyString,
	'messages.responsePartsSeparator': assert.nonEmptyString,
	'messages.logByDefault': assert.bool,
	'twitch.sender.backend': v => assert.stringOneOf(v, ['irc', 'gql']),
	'twitch.sender.clientNoncePlatform': v => assert.stringOneOf(v, ['web', 'android', 'ios']),
	'twitch.irc.socket': v => assert.stringOneOf(v, ['tcp', 'websocket']),
	'twitch.irc.maxChannelCountPerConnection': assert.nonNegativeInt,
	'twitch.irc.connectionsPoolSize': v => {
		if (config.twitch.sender.backend !== 'irc') return;
		assert.nonNegativeInt(v);
		const max =
			config.bot.rateLimits === 'verified'
				? twitch.chat.VERIFIED_MAX_CONNECTIONS_POOL_SIZE
				: twitch.chat.REGULAR_MAX_CONNECTIONS_POOL_SIZE;
		assert.assert(v <= max, `cannot exceed ${max} with ${config.bot.rateLimits} 'bot.rateLimits'`);
	},
	'twitch.hermes.subscribeToUserTopics': assert.bool,
	'twitch.hermes.maxConnections': v =>
		assert.intBetween(v, 1, twitch.hermes.MAX_CONNECTIONS),
	'twitch.hermes.maxTopicsPerConnection': v =>
		assert.intBetween(v, 1, twitch.hermes.MAX_TOPICS_PER_CONNECTION),
	'twitch.hermes.autoAcknowledgeChatWarnings': assert.bool,
	'twitch.hermes.autoJoinRaids': assert.bool,
	'twitch.hermes.autoJoinWatching': assert.bool,
	'twitch.hermes.autoBet.enabled': assert.bool,
	'twitch.hermes.autoBet.ignoreOwnPredictions': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.bool(v);
	},
	'twitch.hermes.autoBet.minRequiredBalance': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.nonNegativeInt(v);
		assert.assert(v >= twitch.MIN_PREDICTION_BET, `must be >= ${twitch.MIN_PREDICTION_BET}`);
	},
	'twitch.hermes.autoBet.strategy.betDelayPercent': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.intBetween(v, 1, 99);
	},
	'twitch.hermes.autoBet.strategy.outcomeSelection': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.stringOneOf(v, ['mostPopular', 'highestMultiplier', 'poolMedian', 'random']);
	},
	'twitch.hermes.autoBet.strategy.bet.min': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.intBetween(v, twitch.MIN_PREDICTION_BET, twitch.MAX_PREDICTION_BET);
	},
	'twitch.hermes.autoBet.strategy.bet.max': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.intBetween(v, twitch.MIN_PREDICTION_BET, twitch.MAX_PREDICTION_BET);
		assert.assert(v >= config.twitch.hermes.autoBet.strategy.bet.min,
		       "must be >= 'twitch.hermes.autoBet.strategy.bet.min'");
	},
	'twitch.hermes.autoBet.strategy.bet.poolFraction': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.floatBetween(v, 0.001, 1);
	},
	'twitch.hermes.autoBet.strategy.bet.maxBalanceFraction': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.floatBetween(v, 0.001, 1);
	},
	'twitch.hermes.autoBet.strategy.bet.onInsufficientFunds': v => {
		if (!config.twitch.hermes.autoBet.enabled) return;
		assert.stringOneOf(v, ['betAll', 'abort']);
	},
	'retry.maxRetries': assert.nonNegativeInt,
	'retry.baseDelayMs': assert.nonNegativeInt,
	'retry.jitter': v => assert.floatBetween(v, 0, 1),
	'cache': v => assert.stringOneOf(v, ['redis', 'valkey', 'inMemory']),
	'db.messagesFlushIntervalMs': v => assert.intBetween(v, 100, db.MAX_MESSAGES_FLUSH_INTERVAL_MS),
	'db.maxMessagesPerChannelFlush': v => assert.intBetween(v, 1, db.MAX_MESSAGES_PER_CHANNEL_FLUSH),
	'paste.service': v => assert.stringOneOf(v, ['hastebin', 'nullPtr']),
	'paste.maxLength': assert.nonNegativeInt,
	'paste.hastebin.instance': v => {
		if (config.paste.service !== 'hastebin') return;
		assert.httpUrl(v);
	},
	'paste.hastebin.raw': v => {
		if (config.paste.service !== 'hastebin') return;
		assert.bool(v);
	},
	'paste.nullPtr.instance': v => {
		if (config.paste.service !== 'nullPtr') return;
		assert.httpUrl(v);
	},
	'paste.nullPtr.secret': v => {
		if (config.paste.service !== 'nullPtr') return;
		assert.bool(v);
	},
	'metrics.enabled': assert.bool,
	'metrics.sampleIntervalMs': v => {
		if (!config.metrics.enabled) return;
		assert.assert(Number.isInteger(v) && v >= 1000, 'must be a >= 1000 integer');
	},
	'metrics.prometheus.enabled': v => {
		if (!config.metrics.enabled) return;
		assert.bool(v);
	},
	'metrics.prometheus.host': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert.nonEmptyString(v);
	},
	'metrics.prometheus.port': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert.port(v);
	},
	'metrics.prometheus.endpoint': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert.assert(typeof v === 'string' && v.startsWith('/'), 'must be a valid endpoint');
	},
	'metrics.prometheus.prefix': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert.assert(typeof v === 'string', 'must be a string');
	},
	'shell': v => {
		if (v === null) return;
		assert.assert(process.platform !== 'win32', 'not supported on win32');
		assert.executable(v);
	},
	'logger.level': v => assert.stringOneOf(v, ['debug', 'info', 'warning', 'error', 'none']),
	'logger.showErrorStackTraces': assert.bool,
	'logger.colorize': assert.bool,
};

function traverse(pathStr) {
	const parts = pathStr.split('.');
	let obj = config;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		assert.assert(
			typeof obj === 'object' && obj !== null && part in obj,
			'is missing'
		);
		obj = obj[part];
	}

	const key = parts[parts.length - 1];
	assert.assert(
		typeof obj === 'object' && obj !== null && key in obj,
		'is missing'
	);

	return { parent: obj, key, value: obj[key] };
}

function validateConfig() {
	for (const k in validators)
		try {
			validators[k](traverse(k).value);
		} catch (err) {
			throw new Error(`config option '${k}' ${err.message}`);
		}
}

async function updateConfig(pathStr, newValue) {
	logger.debug(
		`[CONFIGURATION] config: updating '${pathStr}', setting`,
		newValue
	);
	let parent, key;
	try {
		({ parent, key } = traverse(pathStr));
	} catch (err) {
		throw new Error(`config option '${pathStr}' ${err.message}`);
	}

	const validator = validators[pathStr];
	if (validator)
		try {
			validator(newValue);
		} catch (err) {
			throw new Error(`config option '${pathStr}' ${err.message}`);
		}

	parent[key] = newValue;
	await fs.promises.writeFile(configPath, JSON.stringify(config, null, '\t'));
}

export default {
	validate: validateConfig,
	update: updateConfig,
};
