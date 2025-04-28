import http from 'http';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 5000;

const counters = new Map();
const gauges = new Map();

const lastCounterValues = new Map();
let lastSampleTs = Date.now();

let latestSnapshot = {
	timestamp: lastSampleTs,
	counters: {},
	gauges: {},
};

if (config.metrics.prometheus.enabled) {
	const {
		host = '127.0.0.1',
		port = 9091,
		endpoint = '/metrics',
		prefix = 'selfbot_',
	} = config.metrics.prometheus;

	http
		.createServer((req, res) => {
			const requestSummary = `${req.method} ${req.url} (${req.socket.remoteAddress}:${req.socket.remotePort})`;
			if (req.url !== endpoint) {
				res.writeHead(404);
				logger.debug('[PROMETHEUS] 404', requestSummary);
				return res.end();
			}
			if (req.method !== 'GET') {
				res.writeHead(405, { Allow: 'GET' });
				logger.debug('[PROMETHEUS] 405', requestSummary);
				return res.end();
			}

			res.writeHead(200, {
				'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
			});
			const lines = [];
			for (const [name, value] of counters.entries()) {
				const m = `${prefix}${name}_total`;
				lines.push(`# TYPE ${m} counter\n${m} ${value}`);
			}
			for (const [name, value] of gauges.entries()) {
				const m = `${prefix}${name}`;
				lines.push(`# TYPE ${m} gauge\n${m} ${value}`);
			}
			logger.debug('[PROMETHEUS] 200', requestSummary);
			res.end(`${lines.join('\n')}\n`);
		})
		.listen(port, host, () =>
			logger.info(`[PROMETHEUS] serving at http://${host}:${port}${endpoint}`)
		);
}

function createCounter(name) {
	if (counters.has(name)) return;
	counters.set(name, 0);
	lastCounterValues.set(name, 0);
}

function incCounter(name, by = 1) {
	if (!counters.has(name)) throw new Error(`counter "${name}" not defined`);
	counters.set(name, counters.get(name) + by);
}

function getCounter(name) {
	const snap = latestSnapshot.counters;
	if (!(name in snap)) throw new Error(`counter "${name}" not defined`);
	return snap[name];
}

function createGauge(name) {
	if (gauges.has(name)) return;
	gauges.set(name, 0);
}

function setGauge(name, val) {
	if (!gauges.has(name)) throw new Error(`gauge "${name}" not defined`);
	gauges.set(name, val);
}

function incGauge(name, by = 1) {
	if (!gauges.has(name)) throw new Error(`gauge "${name}" not defined`);
	gauges.set(name, gauges.get(name) + by);
}

function decGauge(name, by = 1) {
	if (!gauges.has(name)) throw new Error(`gauge "${name}" not defined`);
	gauges.set(name, gauges.get(name) - by);
}

function getGauge(name) {
	const snap = latestSnapshot.gauges;
	if (!(name in snap)) throw new Error(`gauge "${name}" not defined`);
	return snap[name];
}

function getMetrics() {
	return latestSnapshot;
}

setInterval(() => {
	const now = Date.now();
	let deltaMs = now - lastSampleTs;
	if (deltaMs <= 0) deltaMs = 1;

	const ctrs = {};
	for (const [k, v] of counters.entries()) {
		ctrs[k] = {
			value: v,
			rate: Math.max(0, v - (lastCounterValues.get(k) || 0)) / (deltaMs / 1000),
		};
		lastCounterValues.set(k, v);
	}

	const gs = {};
	for (const [k, v] of gauges.entries()) gs[k] = v;

	latestSnapshot = { timestamp: now, counters: ctrs, gauges: gs };
	lastSampleTs = now;
}, config.metrics.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS);

if (config.metrics.logIntervalMs)
	setInterval(
		() => logger.info('[METRICS]', latestSnapshot),
		config.metrics.logIntervalMs
	);

export default {
	counter: {
		create: createCounter,
		increment: incCounter,
		get: getCounter,
	},
	gauge: {
		create: createGauge,
		set: setGauge,
		increment: incGauge,
		decrement: decGauge,
		get: getGauge,
	},
	get: getMetrics,
};
