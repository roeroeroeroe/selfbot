import config from '../../config.json' with { type: 'json' };
import startServer from './prometheus.js';
import logger from '../logger.js';
import names from './metric_names.js';

const counters = new Map(),
	gauges = new Map(),
	lastCounterValues = new Map();

let lastSampleTs = Date.now(),
	latestSnapshot = { timestamp: lastSampleTs, counters: {}, gauges: {} },
	server,
	initialized = false,
	snapshotInterval,
	logInterval;

function init() {
	if (initialized || !config.metrics.enabled) return;
	initialized = true;
	for (const k in names.counters) createCounter(names.counters[k]);
	for (const k in names.gauges) createGauge(names.gauges[k]);
	snapshotInterval = setInterval(() => {
		const now = Date.now();
		const invDeltaSec = 1000 / (now - lastSampleTs);

		const ctrs = {};
		for (const [k, v] of counters) {
			const prev = lastCounterValues.get(k) || 0;
			ctrs[k] = {
				value: v,
				rate: Math.max(0, (v - prev) * invDeltaSec),
			};
			lastCounterValues.set(k, v);
		}
		const gs = {};
		for (const [k, v] of gauges) gs[k] = v;

		latestSnapshot = { timestamp: now, counters: ctrs, gauges: gs };
		lastSampleTs = now;
	}, config.metrics.sampleIntervalMs);

	if (config.metrics.logIntervalMs)
		logInterval = setInterval(
			() => logger.info('[METRICS]', latestSnapshot),
			config.metrics.logIntervalMs
		);

	const { enabled, host, port, endpoint, prefix } = config.metrics.prometheus;
	if (enabled) server = startServer({ host, port, endpoint, prefix });
}

function createCounter(name) {
	if (counters.has(name)) return;
	counters.set(name, 0);
	lastCounterValues.set(name, 0);
	logger.debug(`[METRICS] created counter ${name}`);
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
	logger.debug(`[METRICS] created gauge ${name}`);
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

async function cleanup() {
	if (snapshotInterval) {
		clearInterval(snapshotInterval);
		snapshotInterval = null;
	}
	if (logInterval) {
		clearInterval(logInterval);
		logInterval = null;
	}
	if (!server) return;
	await new Promise(res =>
		server.close(err => {
			if (err) {
				logger.error('error closing prometheus server:', err);
				res();
			}
			logger.debug('[PROMETHEUS] server closed');
			res();
		})
	);
}

let metrics;
if (config.metrics.enabled)
	metrics = {
		names,
		init,
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
		cleanup,

		get prometheusServer() {
			return server;
		},
	};
else {
	const noop = () => {};
	metrics = {
		names: { counters: {}, gauges: {} },
		init: noop,
		counter: {
			create: noop,
			increment: noop,
			get: () => ({ value: 0, rate: 0 }),
		},
		gauge: {
			create: noop,
			set: noop,
			increment: noop,
			decrement: noop,
			get: () => 0,
		},
		get: () => ({ timestamp: Date.now(), counters: {}, gauges: {} }),
		cleanup: noop,
		get prometheusServer() {
			return null;
		},
	};
}

export default metrics;
