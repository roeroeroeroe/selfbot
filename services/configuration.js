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
	assert(arr.includes(v), `must be one of: ${arr.join(', ')}`);
}
// prettier-ignore
const validators = {
	'logMessagesByDefault': v => assertBool(v),
	'loadUnsafeCommands': v => assertBool(v),
	'getClosestCommand': v => assertBool(v),
	'autoJoinRaids': v => assertBool(v),
	'autoAcknowledgeChatWarnings': v => assertBool(v),
	'autoJoinWatching': v => assertBool(v),
	'shell': v => assertNonEmptyString(v),
	'ircClientTransport': v => assertStringOneOf(v, ['tcp', 'websocket']),
	'chatServiceTransport': v => assertStringOneOf(v, ['irc', 'gql']),
	'retries': v => assertNonNegativeInt(v),
	'defaultPrefix': v => assert(typeof v === 'string' && utils.isValidPrefix(v), 'must be a valid prefix'),
	'responsePartsSeparator': v => assertNonEmptyString(v),
	'againstTOS': v => assertNonEmptyString(v),
	'hastebinInstance': v => assert(typeof v === 'string' && utils.isValidHttpUrl(v), 'must be a valid URL'),
	'maxPasteLength': v => assertNonNegativeInt(v),
	'rateLimits': v => assertStringOneOf(v, ['regular', 'verified']),
	'authedTmiClientConnectionsPoolSize': v => {
		if (config.chatServiceTransport !== 'irc') return;
		assertNonNegativeInt(v);
		const max =
			config.rateLimits === 'verified'
				? twitch.chat.VERIFIED_MAX_CONNECTIONS_POOL_SIZE
				: twitch.chat.REGULAR_MAX_CONNECTIONS_POOL_SIZE;
		assert(v <= max, `cannot exceed ${max} with ${config.rateLimits} rateLimits`);
	},
	'maxHermesConnections': v => assertIntBetween(v, 1, twitch.hermes.MAX_CONNECTIONS),
	'maxHermesTopicsPerConnection': v => assertIntBetween(v, 1, twitch.hermes.MAX_TOPICS_PER_CONNECTION),
	'messagesFlushIntervalMs': v => assertIntBetween(v, 100, db.MAX_MESSAGES_FLUSH_INTERVAL_MS),
	'maxMessagesPerChannelFlush': v => assertIntBetween(v, 1, db.MAX_MESSAGES_PER_CHANNEL_FLUSH),
	'bot.login': v => assert(typeof v === 'string' && utils.regex.patterns.username.test(v), 'must be a valid username'),
	'bot.id': v => assert(typeof v === 'string' && utils.regex.patterns.id.test(v), 'must be a valid id'),
	'entry_channel.login': v => assert(typeof v === 'string' && utils.regex.patterns.username.test(v), 'must be a valid username'),
	'logger.level': v => assertStringOneOf(v, ['debug', 'info', 'warning', 'error', 'none']),
	'logger.colorize': v => assertBool(v),
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
			throw new Error(`${k} ${err.message}`);
		}
}

async function updateConfig(pathStr, newValue) {
	logger.debug(`[CONFIGURATION] updating ${pathStr}, setting ${newValue}`);
	const { parent, key } = traverse(pathStr);

	const validator = validators[pathStr];
	if (validator)
		try {
			validator(newValue);
		} catch (err) {
			throw new Error(`${pathStr} ${err.message}`);
		}

	parent[key] = newValue;
	await writeFile(configPath, JSON.stringify(config, null, 2));
}

export default {
	validate: validateConfig,
	update: updateConfig,
};
