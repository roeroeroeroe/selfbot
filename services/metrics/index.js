import config from '../../config.json' with { type: 'json' };
import startServer from './prometheus.js';
import logger from '../logger.js';
import names from './metric_names.js';

const counters = new Map(),
	gauges = new Map();

let initialized = false,
	server;

function init() {
	if (initialized || !config.metrics.enabled) return;
	initialized = true;
	for (const k in names.counters) createCounter(names.counters[k]);
	for (const k in names.gauges) createGauge(names.gauges[k]);
	const { enabled, host, port, endpoint, prefix } = config.metrics.prometheus;
	if (enabled) server = startServer({ host, port, endpoint, prefix });
}

function createCounter(name) {
	if (counters.has(name)) return;
	counters.set(name, 0);
	logger.debug(`[METRICS] created counter ${name}`);
}

function incCounter(name, by = 1) {
	const curr = counters.get(name);
	if (curr === undefined) throw new Error(`counter "${name}" not defined`);
	counters.set(name, curr + by);
}

function getCounter(name) {
	const curr = counters.get(name);
	if (curr === undefined) throw new Error(`counter "${name}" not defined`);
	return curr;
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
	const curr = gauges.get(name);
	if (curr === undefined) throw new Error(`gauge "${name}" not defined`);
	gauges.set(name, curr + by);
}

function decGauge(name, by = 1) {
	const curr = gauges.get(name);
	if (curr === undefined) throw new Error(`gauge "${name}" not defined`);
	gauges.set(name, curr - by);
}

function getGauge(name) {
	const curr = gauges.get(name);
	if (curr === undefined) throw new Error(`gauge "${name}" not defined`);
	return curr;
}

async function cleanup() {
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
		counters,
		gauges,
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
		cleanup,

		get prometheusServer() {
			return server;
		},
	};
else {
	const noop = () => {};
	metrics = {
		names: { counters: {}, gauges: {} },
		counters,
		gauges,
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
		cleanup: noop,
		get prometheusServer() {
			return null;
		},
	};
}

export default metrics;
