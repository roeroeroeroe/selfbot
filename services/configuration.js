import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.json' with { type: 'json' };
import tmi from './twitch/tmi.js';
import hermes from './twitch/hermes/client.js';
import db from './db.js';
import utils from '../utils/index.js';
import logger from './logger.js';

const configPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'../config.json'
);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}
// prettier-ignore
const validators = {
	'logMessagesByDefault': v => assert(typeof v === 'boolean', 'logMessagesByDefault must be a boolean'),
	'loadUnsafeCommands': v => assert(typeof v === 'boolean', 'loadUnsafeCommands must be a boolean'),
	'getClosestCommand': v => assert(typeof v === 'boolean', 'getClosestCommand must be a boolean'),
	'autoJoinRaids': v => assert(typeof v === 'boolean', 'autoJoinRaids must be a boolean'),
	'autoAcknowledgeChatWarnings': v => assert(typeof v === 'boolean', 'autoAcknowledgeChatWarnings must be a boolean'),
	'shell': v => assert(typeof v === 'string' && v.trim(), 'shell must be a non-empty string'),
	'ircClientTransport': v => assert(['tcp', 'websocket'].includes(v), 'ircClientTransport must be "tcp" or "websocket"'),
	'joinRetries': v => assert(Number.isInteger(v) && v >= 0, 'joinRetries must be a non-negative integer'),
	'defaultPrefix': v => assert(typeof v === 'string' && v.trim(), 'defaultPrefix must be a non-empty string'),
	'responsePartsSeparator': v => assert(typeof v === 'string', 'responsePartsSeparator must be a string'),
	'againstTOS': v => assert(typeof v === 'string', 'againstTOS must be a string'),
	'hastebinInstance': v => assert(typeof v === 'string' && utils.regex.patterns.url.test(v), 'hastebinInstance must be a valid URL'),
	'rateLimits': v => assert(['regular', 'verified'].includes(v), 'rateLimits must be "regular" or "verified"'),
	'authedClientConnectionsPoolSize': v => {
		assert(Number.isInteger(v) && v >= 0, 'authedClientConnectionsPoolSize must be a non-negative number');
		const max = config.rateLimits === 'verified'
			? tmi.VERIFIED_MAX_CONNECTIONS_POOL_SIZE
			: tmi.REGULAR_MAX_CONNECTIONS_POOL_SIZE;
		assert(v <= max, `authedClientConnectionsPoolSize cannot exceed ${max} with ${config.rateLimits} rateLimits`);
	},
	'maxHermesConnections': v => {
		assert(Number.isInteger(v) && v >= 1 && v <= hermes.MAX_CONNECTIONS,
			`maxHermesConnections must be an integer between 1 and ${hermes.MAX_CONNECTIONS}`);
	},
	'maxHermesTopicsPerConnection': v => {
		assert(Number.isInteger(v) && v >= 1 && v <= hermes.MAX_TOPICS_PER_CONNECTION,
			`maxHermesTopicsPerConnection must be an integer between 1 and ${hermes.MAX_TOPICS_PER_CONNECTION}`);
	},
	'messagesBatchInsertIntervalMs': v => {
		assert(Number.isInteger(v) && v >= 0 && v <= db.MAX_MESSAGES_BATCH_INSERT_INTERVAL_MS,
			`messagesBatchInsertIntervalMs must be a <= ${db.MAX_MESSAGES_BATCH_INSERT_INTERVAL_MS} integer`);
	},
	'maxMessagesBatchInsertSize': v => {
		assert(Number.isInteger(v) && v >= 0 && v <= db.MAX_MESSAGES_BATCH_SIZE,
			`maxMessagesBatchInsertSize must be a <= ${db.MAX_MESSAGES_BATCH_SIZE} integer`);
	},
	'bot.login': v => assert(typeof v === 'string' && v.trim(), 'bot.login must be a non-empty string'),
	'bot.id': v => assert(typeof v === 'string' && v.trim(), 'bot.id must be a non-empty string'),
	'entry_channel.login': v => assert(typeof v === 'string' && v.trim(), 'entry_channel.login must be a non-empty string'),
	'logger.level': v => assert(['debug', 'info', 'warning', 'error', 'none'].includes(v), 'logger.level must be a valid log level'),
	'logger.colorize': v => assert(typeof v === 'boolean', 'logger.colorize must be a boolean'),
	'metrics.sampleIntervalMs': v => assert(Number.isInteger(v) && v >= 0, 'metrics.sampleIntervalMs must be a non-negative integer'),
	'metrics.logIntervalMs': v => assert(Number.isInteger(v) && v >= 0, 'metrics.logIntervalMs must be a non-negative integer'),
	'metrics.prometheus.enabled': v => assert(typeof v === 'boolean', 'metrics.prometheus.enabled must be a boolean'),
	'metrics.prometheus.host': v => assert(typeof v === 'string' && v.length > 0, 'metrics.prometheus.host must be a non-empty string'),
	'metrics.prometheus.port': v => assert(Number.isInteger(v) && v > 0 && v < 65536, 'metrics.prometheus.port must be an integer between 1 and 65535'),
	'metrics.prometheus.endpoint': v => assert(typeof v === 'string' && v.startsWith('/'), 'metrics.prometheus.endpoint must be a string starting with "/"'),
	'metrics.prometheus.prefix': v => assert(typeof v === 'string', 'metrics.prometheus.prefix must be a string'),
};

function traverse(pathStr) {
	const parts = pathStr.split('.');
	let obj = config;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		assert(
			typeof obj === 'object' && part in obj,
			`invalid config path: ${parts.slice(0, i + 1).join('.')}`
		);
		obj = obj[part];
	}

	const key = parts[parts.length - 1];
	assert(
		typeof obj === 'object' && key in obj,
		`invalid config path: ${pathStr}`
	);

	return { parent: obj, key, value: obj[key] };
}

function validateConfig() {
	for (const k in validators) validators[k](traverse(k).value);
}

async function updateConfig(pathStr, newValue) {
	logger.debug(`[CONFIGURATION] updating ${pathStr}, setting ${newValue}`);
	const { parent, key } = traverse(pathStr);

	const validator = validators[pathStr] || validators[key];
	if (validator) validator(newValue);

	parent[key] = newValue;
	await writeFile(configPath, JSON.stringify(config, null, 2));
}

export default {
	validate: validateConfig,
	update: updateConfig,
};
