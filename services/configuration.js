import { writeFile } from 'fs/promises';
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
function assertNonNegativeInt(v) {
	assert(Number.isInteger(v) && v >= 0, 'must be a non-negative integer');
}
function assertIntBetween(v, a, b) {
	// prettier-ignore
	assert(Number.isInteger(v) && v >= a && v <= b, `must be an integer between ${a} and ${b}`);
}
function assertStringOneOf(v, arr) {
	// prettier-ignore
	assert(typeof v === 'string' && arr.includes(v), `must be one of: ${arr.join(', ')}`);
}
// prettier-ignore
const validators = {
	'bot.rateLimits': v => assertStringOneOf(v, ['regular', 'verified']),
	'bot.entryChannelLogin': v => assert(typeof v === 'string' && utils.regex.patterns.username.test(v), 'must be a valid username'),
	'bot.login': v => assert(typeof v === 'string' && utils.regex.patterns.username.test(v), 'must be a valid username'),
	'bot.id': v => assert(typeof v === 'string' && utils.regex.patterns.id.test(v), 'must be a valid id'),
	'commands.defaultPrefix': v => assert(utils.isValidPrefix(v), 'must be a valid prefix'),
	'commands.loadUnsafe': v => assertBool(v),
	'commands.suggestClosest': v => assertBool(v),
	'messages.tosViolationPlaceholder': v => assertNonEmptyString(v),
	'messages.responsePartsSeparator': v => assertNonEmptyString(v),
	'messages.logByDefault': v => assertBool(v),
	'twitch.ircTransport': v => assertStringOneOf(v, ['tcp', 'websocket']),
	'twitch.sender.transport': v => assertStringOneOf(v, ['irc', 'gql']),
	'twitch.sender.irc.connectionsPoolSize': v => {
		if (config.twitch.sender.transport !== 'irc') return;
		assertNonNegativeInt(v);
		const max =
			config.bot.rateLimits === 'verified'
				? twitch.chat.VERIFIED_MAX_CONNECTIONS_POOL_SIZE
				: twitch.chat.REGULAR_MAX_CONNECTIONS_POOL_SIZE;
		assert(v <= max, `cannot exceed ${max} with ${config.bot.rateLimits} bot.rateLimits`);
	},
	'twitch.hermes.maxConnections': v => assertIntBetween(v, 1, twitch.hermes.MAX_CONNECTIONS),
	'twitch.hermes.maxTopicsPerConnection': v => assertIntBetween(v, 1, twitch.hermes.MAX_TOPICS_PER_CONNECTION),
	'twitch.hermes.autoAcknowledgeChatWarnings': v => assertBool(v),
	'twitch.hermes.autoJoinRaids': v => assertBool(v),
	'twitch.hermes.autoJoinWatching': v => assertBool(v),
	'retry.maxRetries': v => assertNonNegativeInt(v),
	'retry.baseDelayMs': v => assertNonNegativeInt(v),
	'retry.jitter': v => assert(typeof v === 'number' && v >= 0 && v <= 1, 'must be between 0 and 1'),
	'cache': v => assertStringOneOf(v, ['redis', 'valkey', 'inMemory']),
	'db.messagesFlushIntervalMs': v => assertIntBetween(v, 100, db.MAX_MESSAGES_FLUSH_INTERVAL_MS),
	'db.maxMessagesPerChannelFlush': v => assertIntBetween(v, 1, db.MAX_MESSAGES_PER_CHANNEL_FLUSH),
	'hastebin.instance': v => assert(utils.isValidHttpUrl(v), 'must be a valid URL'),
	'hastebin.maxPasteLength': v => assertNonNegativeInt(v),
	'metrics.enabled': v => assertBool(v),
	'metrics.sampleIntervalMs': v => {
		if (!config.metrics.enabled) return;
		assert(Number.isInteger(v) && v >= 1000, 'must be a >= 1000 integer');
	},
	'metrics.logIntervalMs': v => {
		if (!config.metrics.enabled) return;
		assertNonNegativeInt(v);
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
		assertIntBetween(v, 1, 65535)
	},
	'metrics.prometheus.endpoint': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert(typeof v === 'string' && v.startsWith('/'), 'must be a valid endpoint');
	},
	'metrics.prometheus.prefix': v => {
		if (!config.metrics.enabled || !config.metrics.prometheus.enabled) return;
		assert(typeof v === 'string', 'must be a string');
	},
	'shell': v => assertNonEmptyString(v),
	'logger.level': v => assertStringOneOf(v, ['debug', 'info', 'warning', 'error', 'none']),
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
	await writeFile(configPath, JSON.stringify(config, null, '\t'));
}

export default {
	validate: validateConfig,
	update: updateConfig,
};
