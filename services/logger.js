import { mkdirSync, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import config from '../config.json' with { type: 'json' };

const FILE_WRITE_FLUSH_INTERVAL_MS = 250;
const ANSI = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	reset: '\x1b[0m',
};

const logsDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../logs'
);
try {
	mkdirSync(logsDirectory, { recursive: true });
} catch (err) {
	process.stderr.write(`failed to mkdir logs: ${err.message}\n`);
	process.exit(1);
}
// prettier-ignore
const levels = {
	debug: { priority: 0, standardStream: process.stdout, color: null, writeToFile: true },
	info: { priority: 1, standardStream: process.stdout, color: null, writeToFile: true },
	warning: { priority: 2, standardStream: process.stdout, color: 'yellow', writeToFile: true },
	error: { priority: 3, standardStream: process.stderr, color: 'red', writeToFile: true },
	none: { priority: 4, standardStream: null, color: null, writeToFile: false },
};

const minPriority =
	levels[config.logger.level]?.priority ?? levels.info.priority;

const fileLevels = Object.values(levels).filter(
	l => l.writeToFile && l.priority >= minPriority
);

for (const level in levels) {
	const cfg = levels[level];
	cfg.name = level;
	cfg.file = null;
	const color = cfg.color;
	cfg.colorize =
		config.logger.colorize && color
			? s => ANSI[color] + s + ANSI.reset
			: s => s;
}

function openAllFiles(dateString) {
	for (const cfg of fileLevels) {
		if (cfg.file) cfg.file.end();
		const filePath = path.join(logsDirectory, `${cfg.name}_${dateString}.log`);
		cfg.file = createWriteStream(filePath, { flags: 'a' });
		cfg.file.cork();
		cfg.file.on('error', err =>
			process.stderr.write(`file stream error (${filePath}): ${err.message}\n`)
		);
	}
}
// prettier-ignore
function scheduleRotation() {
	const now = Date.now();
	const today = new Date(now);
	const nextMidnight = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate() + 1,
		0, 0, 0
	);
	setTimeout(() => {
		openAllFiles(new Date().toISOString().slice(0, 10));
		scheduleRotation();
	}, nextMidnight - now);
}

openAllFiles(new Date().toISOString().slice(0, 10));
scheduleRotation();

const flushInterval = setInterval(() => {
	for (const cfg of fileLevels) {
		cfg.file.uncork();
		cfg.file.cork();
	}
}, FILE_WRITE_FLUSH_INTERVAL_MS);

function formatArgs(args) {
	let stack = null;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg instanceof Error) {
			stack = arg.stack || arg.message;
			args[i] = arg.message;
			continue;
		}
		switch (typeof arg) {
			case 'string':
				break;
			case 'object':
				try {
					args[i] = JSON.stringify(arg);
				} catch {
					args[i] = '[Circular]';
				}
				break;
			default:
				args[i] = String(arg);
		}
	}

	return stack ? args.join(' ') + '\n' + stack : args.join(' ');
}

let ts = ''; // YYYY-MM-DD HH:MM:SS
(function tick() {
	const iso = new Date().toISOString();
	ts = iso.slice(0, 10) + ' ' + iso.slice(11, 19);
	setTimeout(tick, 1000 - (Date.now() % 1000));
})();

function makeLogger(level) {
	const cfg = levels[level];
	return (...args) => {
		if (cfg.priority < minPriority) return;

		const uptime = process.uptime().toFixed(6);
		const msg = formatArgs(args);

		if (cfg.standardStream)
			cfg.standardStream.write(
				`[${ts} ${uptime}] ${level}: ${cfg.colorize(msg)}\n`
			);

		if (cfg.writeToFile) cfg.file.write(`[${ts} ${uptime}] ${msg}\n`);
	};
}

const debug = makeLogger('debug');
const info = makeLogger('info');
const warning = makeLogger('warning');
const error = makeLogger('error');
function fatal(...args) {
	clearInterval(flushInterval);
	error(...args);
	const streams = fileLevels.map(l => l.file).filter(Boolean);

	let remaining = streams.length;
	if (!remaining) return process.exit(1);

	for (const stream of streams) {
		stream.uncork();
		stream.once('finish', () => {
			if (!--remaining) process.exit(1);
		});
		stream.end();
	}

	setTimeout(() => process.exit(1), 500);
}

export default {
	debug,
	info,
	warning,
	error,
	fatal,
};
