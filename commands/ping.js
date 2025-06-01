import config from '../config.json' with { type: 'json' };
import os from 'os';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import metrics from '../services/metrics/index.js';
import hastebin from '../services/hastebin.js';
import logger from '../services/logger.js';
import cache from '../services/cache/index.js';

export default {
	name: 'ping',
	aliases: ['status'],
	description: 'show bot status',
	unsafe: false,
	lock: 'CHANNEL',
	exclusiveFlagGroups: [['host', 'metrics']],
	flags: [
		{
			name: 'host',
			aliases: ['h', 'host'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print host information',
		},
		{
			name: 'metrics',
			aliases: ['m', 'metrics'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print latest metrics snapshot',
		},
	],
	execute: msg => {
		if (msg.commandFlags.host) return getHostResponse();
		if (msg.commandFlags.metrics) return getMetricsResponse();

		return getGenericResponse(msg);
	},
};

function getHostResponse() {
	const totalMem = os.totalmem();
	const usedMem = totalMem - os.freemem();

	return {
		text: utils.format.join([
			`uptime: ${utils.duration.format(os.uptime() * 1000, { maxParts: 2 })}`,
			`memory: ${utils.format.bytes(usedMem)}/${utils.format.bytes(totalMem)}`,
			`host: ${os.type()} ${os.machine()}`,
			`kernel: ${os.release()}`,
		]),
		mention: true,
	};
}

async function getMetricsResponse() {
	if (!config.metrics.enabled)
		return { text: 'metrics are disabled', mention: true };
	const sampleInterval = utils.duration.format(config.metrics.sampleIntervalMs);
	const snapshot = metrics.get();
	const counters = formatMetrics(snapshot.counters, sampleInterval);
	const gauges = formatMetrics(snapshot.gauges);

	const lines = [];
	if (counters.length) lines.push('counters:', counters);
	if (gauges.length) lines.push(`${lines.length ? '\n' : ''}gauges:`, gauges);
	if (!lines.length) return { text: 'no metrics available', mention: true };

	try {
		const link = await hastebin.create(utils.format.join(lines, '\n'));
		return {
			text: utils.format.join([
				`snapshot from: ${utils.date.format(snapshot.timestamp)}`,
				link,
			]),
			mention: true,
		};
	} catch (err) {
		logger.error('error creating paste:', err);
		return { text: 'error creating paste', mention: true };
	}
}

async function getGenericResponse(msg) {
	const t0 = performance.now();
	await twitch.chat.ping();
	const t1 = performance.now();
	let topics = 0;
	for (const topic of twitch.hermes.topics.values())
		if (topic.state === twitch.hermes.TopicState.SUBSCRIBED) topics++;
	const processMemory = process.memoryUsage(),
		rss = utils.format.bytes(processMemory.rss),
		heapUsed = utils.format.bytes(processMemory.heapUsed),
		heapTotal = utils.format.bytes(processMemory.heapTotal);
	const channels = twitch.chat.joinedChannels.size;
	let cachePart;
	try {
		const dbsize = await cache.dbsize();
		cachePart = `cache: ${dbsize} ${utils.format.plural(dbsize, 'key')}`;
	} catch (err) {
		logger.error('error getting cache dbsize:', err);
		cachePart = 'cache: N/A';
	}
	return {
		text: utils.format.join([
			`tmi: ${(t1 - t0) | 0}ms`,
			`handler: ${(t0 - msg.receivedAt).toFixed(2)}ms`,
			`uptime: ${utils.duration.format(process.uptime() * 1000, { maxParts: 2 })}`,
			`rss: ${rss}, heap: ${heapUsed}/${heapTotal}`,
			cachePart,
			`irc: ${twitch.chat.connections.length} (${channels} ${utils.format.plural(channels, 'channel')})`,
			`hermes: ${twitch.hermes.connections.size} (${topics} ${utils.format.plural(topics, 'topic')})`,
			`node: ${process.version}`,
			`pid: ${process.pid}, ppid: ${process.ppid}`,
		]),
		mention: true,
	};
}

function formatMetrics(obj, sampleInterval) {
	if (sampleInterval)
		return utils.format.align(
			Object.entries(obj).map(
				([k, v]) =>
					`${k}:__ALIGN__${v.value} (${v.rate.toFixed(1)}/${sampleInterval})`
			)
		);
	return utils.format.align(
		Object.entries(obj).map(([k, v]) => `${k}:__ALIGN__${v}`)
	);
}
