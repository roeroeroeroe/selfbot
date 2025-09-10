import http from 'http';
import metrics from './index.js';
import logger from '../logger.js';

const methodNotAllowedResponseHeaders = { Allow: 'GET' };
const okResponseHeaders = {
	'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
};

export default function init(opts = {}) {
	const {
		host = '127.0.0.1',
		port = 9101,
		endpoint = '/metrics',
		prefix = 'selfbot_',
	} = opts;

	const server = http.createServer((req, res) => {
		const summary = `${req.method} ${req.url}`;
		if (req.url !== endpoint) {
			res.writeHead(404);
			logger.debug('[PROMETHEUS] 404', summary);
			return res.end();
		}
		if (req.method !== 'GET') {
			res.writeHead(405, methodNotAllowedResponseHeaders);
			logger.debug('[PROMETHEUS] 405', summary);
			return res.end();
		}

		res.writeHead(200, okResponseHeaders);
		const lines = [];
		for (const [k, v] of metrics.counters) {
			const m = `${prefix}${k}_total`;
			lines.push(`# TYPE ${m} counter\n${m} ${v}`);
		}
		for (const [k, v] of metrics.gauges) {
			const m = `${prefix}${k}`;
			lines.push(`# TYPE ${m} gauge\n${m} ${v}`);
		}
		res.end(lines.join('\n') + '\n');
		logger.debug('[PROMETHEUS] 200', summary);
	});

	server.on('error', err => logger.fatal('[PROMETHEUS] error:', err));
	server.listen(port, host, () =>
		logger.info(`[PROMETHEUS] listening on http://${host}:${port}${endpoint}`)
	);

	return server;
}
