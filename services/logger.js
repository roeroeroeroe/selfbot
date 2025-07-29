import {
	mkdirSync,
	openSync,
	createWriteStream,
	fsyncSync,
	closeSync,
} from 'fs';
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

const logsDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../logs'
);
try {
	mkdirSync(logsDirectory, { recursive: true });
} catch (err) {
	process.stderr.write(`failed to mkdir logs: ${err.message}\n`);
	for (let i = 0; i < fileLevels.length; fileLevels[i++].writeToFile = false);
	fileLevels.length = 0;
}

for (const level in levels) {
	const cfg = levels[level];
	cfg.name = level;
	cfg.file = null;
	const color = cfg.color;
	cfg.colorize =
		config.logger.colorize && color && ANSI[color]
			? s => ANSI[color] + s + ANSI.reset
			: s => s;
}

let rotationTimeout, tickTimeout;

function openAllFiles(dateString) {
	for (let i = 0; i < fileLevels.length; i++) {
		const cfg = fileLevels[i];
		if (cfg.file) {
			cfg.file.end();
			close(cfg);
		}
		const filePath = path.join(logsDirectory, `${cfg.name}_${dateString}.log`);
		cfg.filePath = filePath;
		let fd;
		try {
			fd = openSync(filePath, 'a');
		} catch (err) {
			process.stderr.write(`failed to open ${filePath}: ${err.message}\n`);
			cfg.fd = cfg.file = null;
			continue;
		}
		cfg.fd = fd;
		cfg.file = createWriteStream(null, { fd, autoClose: false });
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
	rotationTimeout = setTimeout(() => {
		openAllFiles(new Date().toISOString().slice(0, 10));
		scheduleRotation();
	}, nextMidnight - now);
}

openAllFiles(new Date().toISOString().slice(0, 10));
scheduleRotation();

const flushInterval = setInterval(() => {
	for (let i = 0, cfg; i < fileLevels.length; i++) {
		if (!(cfg = fileLevels[i]).file?.writableLength) continue;
		cfg.file.uncork();
		cfg.file.cork();
	}
}, FILE_WRITE_FLUSH_INTERVAL_MS);

let formatArgs;
if (config.logger.showErrorStackTraces)
	formatArgs = function (args) {
		if (!args.length) return '';
		let stack;
		for (let i = 0, arg; i < args.length; i++) {
			if ((arg = args[i]) instanceof Error) {
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
	};
else
	formatArgs = function (args) {
		if (!args.length) return '';
		for (let i = 0, arg; i < args.length; i++) {
			if ((arg = args[i]) instanceof Error) {
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
		return args.join(' ');
	};

let ts = ''; // YYYY-MM-DD HH:MM:SS
(function tick() {
	const iso = new Date().toISOString();
	ts = iso.slice(0, 10) + ' ' + iso.slice(11, 19);
	tickTimeout = setTimeout(tick, 1000 - (Date.now() % 1000));
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

async function cleanup() {
	clearInterval(flushInterval);
	clearTimeout(rotationTimeout);
	clearTimeout(tickTimeout);
	for (let i = 0; i < fileLevels.length; i++) {
		const cfg = fileLevels[i];
		cfg.writeToFile = false;
		const stream = cfg.file;
		if (stream) {
			stream.uncork();
			await new Promise(res => {
				stream.once('finish', res);
				stream.end();
			});
		}
		close(cfg);
	}
}

function close(cfg) {
	const fd = cfg.fd;
	if (typeof fd !== 'number') return;
	try {
		fsyncSync(fd);
	} catch (err) {
		process.stderr.write(
			`failed to fsync fd ${fd} for ${cfg.name} (${cfg.filePath}): ${err.message}\n`
		);
	}
	try {
		closeSync(fd);
	} catch (err) {
		process.stderr.write(
			`failed to close fd ${fd} for ${cfg.name} (${cfg.filePath}): ${err.message}\n`
		);
	}
	cfg.fd = null;
}

const debug = makeLogger('debug');
const info = makeLogger('info');
const warning = makeLogger('warning');
const error = makeLogger('error');
function fatal(...args) {
	error(...args);
	clearInterval(flushInterval);
	clearTimeout(rotationTimeout);
	clearTimeout(tickTimeout);
	for (let i = 0; i < fileLevels.length; i++) {
		const cfg = fileLevels[i];
		if (cfg.file) {
			cfg.file.uncork();
			cfg.file.end();
		}
		close(cfg);
	}

	process.exit(1);
}

export default {
	debug,
	info,
	warning,
	error,
	fatal,
	cleanup,
};
