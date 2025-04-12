import { mkdirSync, createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import config from '../config.json' with { type: 'json' };

const logsDirectoryPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../logs'
);

const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	reset: '\x1b[0m',
};

const shouldColorize = config.logger.colorize;

const logLevels = {
	debug: {
		priority: 0,
		standardStream: process.stdout,
		color: null,
		file: { stream: null, date: '' },
	},
	info: {
		priority: 1,
		standardStream: process.stdout,
		color: null,
		file: { stream: null, date: '' },
	},
	warning: {
		priority: 2,
		standardStream: process.stdout,
		color: 'yellow',
		file: { stream: null, date: '' },
	},
	error: {
		priority: 3,
		standardStream: process.stderr,
		color: 'red',
		file: { stream: null, date: '' },
	},
	none: {
		priority: 4,
		standardStream: null,
		color: null,
		file: { stream: null, date: '' },
	},
};

const currentPriority =
	logLevels[config.logger.level]?.priority ?? logLevels.info.priority;

try {
	mkdirSync(logsDirectoryPath, { recursive: true });
} catch (err) {
	process.stderr.write(`failed to create logs directory: ${err.message}\n`);
	process.exit(1);
}

function log(level, args) {
	const { priority, standardStream, color, file } = logLevels[level];
	if (priority < currentPriority) return;

	const nowISO = new Date().toISOString();
	const fileDateString = nowISO.substring(0, 10);
	const ts = formatISODate(nowISO);
	const message = parseArgs(args);

	if (standardStream)
		standardStream.write(`${ts} ${level}: ${colorize(message, color)}\n`);

	if (file.date !== fileDateString || !file.stream) {
		if (file.stream) file.stream.end();
		try {
			file.stream = createWriteStream(
				`${logsDirectoryPath}/${level}_${fileDateString}.log`,
				{ flags: 'a' }
			);
			file.date = fileDateString;
		} catch (err) {
			process.stderr.write(`error creating stream: ${err.message}\n`);
			return;
		}
	}

	file.stream.write(`${ts} ${message}\n`);
}

function colorize(str, color) {
	return shouldColorize && color
		? `${colors[color]}${str}${colors.reset}`
		: str;
}

function formatISODate(date = new Date().toISOString()) {
	return `[${date.substring(0, 10)} ${date.substring(11, 19)} ${process.uptime().toFixed(6)}]`;
}

function parseArgs(args) {
	const sanitized = [];
	let stack;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg instanceof Error) {
			if (arg.stack) stack = arg.stack;
			if (i + 1 < args.length) sanitized.push(arg.message);
		} else if (typeof arg === 'object')
			try {
				sanitized.push(JSON.stringify(arg));
			} catch {
				sanitized.push('[Circular]');
			}
		else sanitized.push(String(arg));
	}

	return stack ? `${sanitized.join(' ')}\n${stack}` : sanitized.join(' ');
}

function debug(...args) {
	log('debug', args);
}

function info(...args) {
	log('info', args);
}

function warning(...args) {
	log('warning', args);
}

function error(...args) {
	log('error', args);
}

function fatal(...args) {
	log('error', args);
	if (logLevels.error.file.stream)
		logLevels.error.file.stream.end(() => process.exit(1));
	else process.exit(1);
}

export default {
	debug,
	info,
	warning,
	error,
	fatal,
};
