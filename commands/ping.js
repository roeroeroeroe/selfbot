import config from '../config.json' with { type: 'json' };
import os from 'os';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import metrics from '../services/metrics/index.js';
import paste from '../services/paste/index.js';
import logger from '../services/logger.js';
import cache from '../services/cache/index.js';
import exec from '../services/exec.js';

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

let currentCommitPart = 'commit: N/A';

export default {
	name: 'ping',
	aliases: ['status'],
	description: 'get bot status',
	unsafe: false,
	lock: 'CHANNEL',
	exclusiveFlagGroups: [['host', 'metrics']],
	flags: [
		{
			name: 'host',
			short: 'h',
			long: 'host',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print host information',
		},
		{
			name: 'metrics',
			short: 'm',
			long: 'metrics',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print metrics',
		},
	],
	init: async () => {
		if (!config.shell) return;
		const { stdout, exitCode } = await exec.shell('git rev-parse --short HEAD');
		if (stdout && !exitCode) currentCommitPart = `commit: ${stdout}`;
	},
	execute: msg => {
		if (msg.commandFlags.host) return getHostResponse();
		if (msg.commandFlags.metrics) return getMetricsResponse();

		return getGenericResponse(msg);
	},
};

function getHostResponse() {
	const totalMem = os.totalmem(),
		usedMem = totalMem - os.freemem();

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

	const { counters, gauges } = metrics;
	let page = buildMetricsPageSection('counters', counters);
	page = buildMetricsPageSection('gauges', gauges, page);
	if (!page) return { text: 'no metrics available', mention: true };

	try {
		const link = await paste.create(page);
		return { text: link, mention: true };
	} catch (err) {
		logger.error('error creating paste:', err);
		return { text: 'error creating paste', mention: true };
	}
}

function buildMetricsPageSection(label, map, page) {
	if (!map.size) return page;
	if (!page) page = `${label}:\n`;
	else page += `\n\n${label}:\n`;
	const lines = [];
	for (const [k, v] of map) lines.push(`${k}:${alignSep}${v}`);
	return page + utils.format.align(lines);
}

async function getGenericResponse(msg) {
	const t0 = performance.now();
	let tmiLatencyPart;
	try {
		await twitch.chat.ping();
		const t1 = performance.now();
		tmiLatencyPart = `tmi: ${(t1 - t0) | 0}ms`;
	} catch (err) {
		logger.error(err);
		tmiLatencyPart = 'tmi: N/A';
	}
	let topics = 0;
	for (const topic of twitch.hermes.topics.values())
		if (topic.state === twitch.hermes.TopicState.SUBSCRIBED) topics++;
	const processMemory = process.memoryUsage(),
		rss = utils.format.bytes(processMemory.rss),
		heapUsed = utils.format.bytes(processMemory.heapUsed),
		heapTotal = utils.format.bytes(processMemory.heapTotal);
	const channels = twitch.chat.joinedCount;
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
			tmiLatencyPart,
			`handler: ${(t0 - msg.receivedAt).toFixed(2)}ms`,
			`uptime: ${utils.duration.format(process.uptime() * 1000, { maxParts: 2 })}`,
			`rss: ${rss}, heap: ${heapUsed}/${heapTotal}`,
			cachePart,
			`irc: ${twitch.chat.connections.length} (${channels} ${utils.format.plural(channels, 'channel')})`,
			`hermes: ${twitch.hermes.connections.size} (${topics} ${utils.format.plural(topics, 'topic')})`,
			`node: ${process.version}`,
			currentCommitPart,
			`pid: ${process.pid}, ppid: ${process.ppid}`,
		]),
		mention: true,
	};
}
