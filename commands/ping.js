import config from '../config.json' with { type: 'json' };
import os from 'os';
import hermes from '../services/twitch/hermes/client.js';
import utils from '../utils/index.js';
import metrics from '../services/metrics.js';
import hastebin from '../services/hastebin.js';
import logger from '../services/logger.js';

export default {
	name: 'ping',
	aliases: ['status'],
	description: 'show bot status',
	unsafe: false,
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
	execute: async msg => {
		if (msg.commandFlags.host) return getHostResponse();
		if (msg.commandFlags.metrics) return await getMetricsResponse();

		return await getGenericResponse(msg);
	},
};

function getHostResponse() {
	const totalMem = os.totalmem();
	const usedMem = totalMem - os.freemem();

	return {
		text: utils.format.join([
			`uptime: ${utils.duration.format(os.uptime() * 1000, 2)}`,
			`memory: ${utils.format.bytes(usedMem)}/${utils.format.bytes(totalMem)}`,
			`host: ${os.type()}`,
			`kernel: ${os.release()}`,
			`arch: ${os.machine()}`,
		]),
		mention: true,
	};
}

async function getMetricsResponse() {
	const sampleInterval = utils.duration.format(config.metrics.sampleIntervalMs);
	const snapshot = metrics.get();
	const counters = formatMetrics(snapshot.counters, sampleInterval);
	const gauges = formatMetrics(snapshot.gauges);

	const lines = [];
	if (counters.length) lines.push('counters:', ...counters);
	if (gauges.length)
		lines.push(`${lines.length ? '\n' : ''}gauges:`, ...gauges);
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
	await msg.client.ping();
	const t1 = performance.now();
	let topics = 0;
	for (const topic of hermes.topics.values())
		if (topic.state === hermes.TopicState.SUBSCRIBED) topics++;
	return {
		text: utils.format.join([
			`tmi: ${(t1 - t0) | 0}ms`,
			`handler: ${(t0 - msg.receivedAt).toFixed(2)}ms`,
			`uptime: ${utils.duration.format(Date.now() - msg.client.connectedAt, 2)}`,
			`memory: ${utils.format.bytes(process.memoryUsage().heapTotal)}`,
			`channels: ${msg.client.joinedChannels.size}`,
			`irc: ${msg.client.connections.length}`,
			`hermes: ${hermes.connections.size} (${topics} ${utils.format.plural(topics, 'topic')})`,
			`node: ${process.version}`,
		]),
		mention: true,
	};
}

function formatMetrics(obj, sampleInterval) {
	return sampleInterval
		? Object.entries(obj).map(
				([k, v]) => `${k}: ${v.value} (${v.rate.toFixed(1)}/${sampleInterval})`
			)
		: Object.entries(obj).map(([k, v]) => `${k}: ${v}`);
}
