import { Writable } from 'stream';
const { stdout, stderr, uptime, exit } = process;

/**
 * @callback LogFn
 * @param {...any} args
 * @returns {...any}
 * Forwards the return value of the `write()` method of the stream. By default:
 * Returns `true` if the entire data was flushed successfully to the kernel buffer,
 * or if the log level is inactive (< `minLevel`).
 * Returns `false` if all or part of the data was queued in user memory
 */

/**
 * @typedef {Object} Logger
 * @property {LogFn} trace Log trace message. Writes to `outputStream`
 * @property {LogFn} debug Log debug message. Writes to `outputStream`
 * @property {LogFn} info Log info message. Writes to `outputStream`
 * @property {LogFn} warning Log warning. Writes to `errorStream`
 * @property {LogFn} error Log error. Writes to `errorStream`
 * @property {LogFn} fatal Log error and exit with code 1. Writes to `errorStream`
 * @property {() => void} cleanup Cleanup logger resources. Must be called once
 */

const ANSI_COLORS = {
	__proto__: null,
	// black:   '\x1b[30m',
	red:     '\x1b[31m',
	// green:   '\x1b[32m',
	yellow:  '\x1b[33m',
	// blue:    '\x1b[34m',
	// magenta: '\x1b[35m',
	// cyan:    '\x1b[36m',
	// white:   '\x1b[37m',

	reset: '\x1b[0m',
};

const OUT = new function () {
	Object.setPrototypeOf(this, null);

	let iota = 0;
	const make = name => void (this[name] = iota++);

	make('OUTPUT');
	make('ERROR');
};

const LEVELS = new function () {
	Object.setPrototypeOf(this, null);

	let iota = 0;
	const make = (name, outType, color) =>
		void (this[name] = { __proto__: null, priority: iota++, outType, color });

	make('trace',   OUT.OUTPUT);
	make('debug',   OUT.OUTPUT);
	make('info',    OUT.OUTPUT);
	make('warning', OUT.ERROR, ANSI_COLORS.yellow);
	make('error',   OUT.ERROR, ANSI_COLORS.red);
	make('none');
};

const DEFAULT_LEVEL    = 'info',
      UPTIME_PRECISION = 6;

const ZERO        = '0'.charCodeAt(0),
      HYPHENMINUS = '-'.charCodeAt(0),
      SPACE       = ' '.charCodeAt(0),
      COLON       = ':'.charCodeAt(0);

const TWO_DIGIT_LUT = Buffer.allocUnsafe(200);
for (let i = 0; i < 100; i++) {
	TWO_DIGIT_LUT[i * 2] = ZERO + ((i / 10) | 0);
	TWO_DIGIT_LUT[i * 2 + 1] = ZERO + (i % 10);
}

let instances = 0,
    tickTimeout,
    tsBuf,
    ts = '';

function initTicker() {
	tsBuf = Buffer.allocUnsafe(19);
	// 'YYYY-MM-DD HH:MM:SS'
	//      ^  ^
	tsBuf[4] = tsBuf[7] = HYPHENMINUS;
	// 'YYYY-MM-DD HH:MM:SS'
	//            ^
	tsBuf[10] = SPACE;
	// 'YYYY-MM-DD HH:MM:SS'
	//               ^  ^
	tsBuf[13] = tsBuf[16] = COLON;

	(function tick() {
		const date = new Date();

		const y  = date.getUTCFullYear(),
		      mo = date.getUTCMonth() + 1,
		      d  = date.getUTCDate(),
		      h  = date.getUTCHours(),
		      mm = date.getUTCMinutes(),
		      s  = date.getUTCSeconds();

		TWO_DIGIT_LUT.copy(tsBuf, 0, ((y / 100) | 0) * 2, ((y / 100) | 0) * 2 + 2);
		TWO_DIGIT_LUT.copy(tsBuf, 2, (y % 100) * 2, (y % 100) * 2 + 2);

		TWO_DIGIT_LUT.copy(tsBuf, 5, mo * 2, mo * 2 + 2);
		TWO_DIGIT_LUT.copy(tsBuf, 8, d * 2, d * 2 + 2);

		TWO_DIGIT_LUT.copy(tsBuf, 11, h * 2, h * 2 + 2);
		TWO_DIGIT_LUT.copy(tsBuf, 14, mm * 2, mm * 2 + 2);
		TWO_DIGIT_LUT.copy(tsBuf, 17, s * 2, s * 2 + 2);

		ts = tsBuf.toString('ascii');
		tickTimeout = setTimeout(tick, 1000 - (Date.now() % 1000));
	})();
}

function cleanup() {
	if (!--instances) {
		clearTimeout(tickTimeout);
		ts = '<logger: use after cleanup>';
		return;
	}
	if (instances < 0)
		instances = 0;
}

const join = Function.prototype.call.bind(Array.prototype.join);

function format(args) {
	if (!args.length)
		return '';
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (typeof arg) {
		case 'string':
			continue;
		case 'object':
			if (arg instanceof Error) {
				args[i] = arg.message;
				continue;
			}
			try {
				args[i] = JSON.stringify(arg);
			} catch {
				args[i] = '[Circular]';
			}
			continue;
		default:
			args[i] = String(arg);
		}
	}

	return join(args, ' ');
}

function formatWithErrStacks(args) {
	if (!args.length)
		return '';
	let stack;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (typeof arg) {
		case 'string':
			continue;
		case 'object':
			if (arg instanceof Error) {
				if (stack)
					stack += '\n' + (arg.stack || arg.message);
				else
					stack = arg.stack || arg.message;
				args[i] = arg.message;
				continue;
			}
			try {
				args[i] = JSON.stringify(arg);
			} catch {
				args[i] = '[Circular]';
			}
			continue;
		default:
			args[i] = String(arg);
		}
	}

	return stack
		? join(args, ' ') + '\n' + stack
		: join(args, ' ');
}

const COLORIZE_OFF    = 0b00,
      COLORIZE_AUTO   = 0b01,
      COLORIZE_ALWAYS = 0b10,
      TIMESTAMP           = 1 << 2,
      UPTIME              = 1 << 3,
      APPEND_ERROR_STACKS = 1 << 4,
      BRACKETED_LEVEL     = 1 << 5;

export const COLORIZE_MASK = 0b11;

export const FLAGS = {
	__proto__: null,
	/** Disable ANSI color output entirely */
	COLORIZE_OFF,
	/** Automatically colorize output if the stream is a TTY */
	COLORIZE_AUTO,
	/** Always colorize output, even if the stream is not a TTY */
	COLORIZE_ALWAYS,

	/** Include UTC timestamp in log messages */
	TIMESTAMP,
	/** Include process uptime in log messages */
	UPTIME,
	/** Append error stack traces for Error objects in log messages */
	APPEND_ERROR_STACKS,
	/** Use a "[LEVEL]" label instead of "level:" in log messages */
	BRACKETED_LEVEL,
};

/** `COLORIZE_AUTO | TIMESTAMP | UPTIME | APPEND_ERROR_STACKS` */
export const DEFAULT_FLAGS =
	COLORIZE_AUTO | TIMESTAMP | UPTIME | APPEND_ERROR_STACKS;

const noop     = () => {},
      noopTrue = () => true;

/**
 * @param {string} [minLevel] Minimum logging level. `'none'` disables all log output
 * @param {number} [flags] Use `FLAGS`, default: `DEFAULT_FLAGS`
 * @param {Writable} [outputStream] Output stream, default: `process.stdout`
 * @param {Writable} [errorStream] Error stream, default: `process.stderr`
 * @returns {Logger}
 * @throws {Error} If an unknown `level` is provided
 * @throws {Error} If invalid `flags` are provided
 * @throws {Error} If `outputStream` is not a `Writable` and `outputStream.write`
 * is not a function
 * @throws {Error} If `errorStream` is not a `Writable` and `errorStream.write`
 * is not a function
 */
export default function NewLogger(minLevel, flags, outputStream, errorStream) {
	if (minLevel === undefined)
		minLevel = DEFAULT_LEVEL;
	else if (typeof minLevel !== 'string' || !LEVELS[minLevel])
		throw new Error(`unknown level: ${minLevel}`);

	if (flags === undefined)
		flags = DEFAULT_FLAGS;
	else if (!Number.isInteger(flags) ||
	         flags & ~(COLORIZE_MASK | TIMESTAMP | UPTIME | APPEND_ERROR_STACKS | BRACKETED_LEVEL) ||
	         ((flags & COLORIZE_MASK) !== COLORIZE_OFF &&
	         (flags & COLORIZE_MASK) !== COLORIZE_AUTO &&
	         (flags & COLORIZE_MASK) !== COLORIZE_ALWAYS))
		throw new Error('invalid flags');

	if (outputStream === undefined)
		outputStream = stdout;
	else if (!(outputStream instanceof Writable) &&
	         typeof outputStream?.write !== 'function')
		throw new Error('outputStream must be a Writable or expose write()');

	if (errorStream === undefined)
		errorStream = stderr;
	else if (!(errorStream instanceof Writable) &&
	         typeof errorStream?.write !== 'function')
		throw new Error('errorStream must be a Writable or expose write()');

	const fmt = flags & APPEND_ERROR_STACKS ? formatWithErrStacks : format;

	function make(l) {
		const { priority, outType, color } = LEVELS[l];
		if (priority < LEVELS[minLevel].priority)
			return noopTrue;

		let stream;
		switch (outType) {
		case OUT.OUTPUT:
			stream = outputStream;
			break;
		case OUT.ERROR:
			stream = errorStream;
		}

		const colorize = color &&
		                 ((flags & COLORIZE_MASK) === COLORIZE_ALWAYS ||
		                 ((flags & COLORIZE_MASK) === COLORIZE_AUTO && stream.isTTY));
		const reset = ANSI_COLORS.reset;

		const label = flags & BRACKETED_LEVEL
			? `[${l.toUpperCase()}]`
			: `${l}:`;

		if (flags & TIMESTAMP && flags & UPTIME)
			return colorize
				? function () { return stream.write(`[${ts} ${uptime().toFixed(UPTIME_PRECISION)}] ${label} ${color}${fmt(arguments)}${reset}\n`); }
				: function () { return stream.write(`[${ts} ${uptime().toFixed(UPTIME_PRECISION)}] ${label} ${fmt(arguments)}\n`); };

		if (flags & TIMESTAMP)
			return colorize
				? function () { return stream.write(`[${ts}] ${label} ${color}${fmt(arguments)}${reset}\n`); }
				: function () { return stream.write(`[${ts}] ${label} ${fmt(arguments)}\n`); };

		if (flags & UPTIME)
			return colorize
				? function () { return stream.write(`[${uptime().toFixed(UPTIME_PRECISION)}] ${label} ${color}${fmt(arguments)}${reset}\n`); }
				: function () { return stream.write(`[${uptime().toFixed(UPTIME_PRECISION)}] ${label} ${fmt(arguments)}\n`); };

		return colorize
			? function () { return stream.write(`${label} ${color}${fmt(arguments)}${reset}\n`); }
			: function () { return stream.write(`${label} ${fmt(arguments)}\n`); };
	}

	const trace   = make('trace'),
	      debug   = make('debug'),
	      info    = make('info'),
	      warning = make('warning'),
	      error   = make('error'),
	      fatal   = (...args) => { error(...args); exit(1); };

	if (flags & TIMESTAMP && minLevel !== 'none' && ++instances === 1)
		initTicker();

	return {
		__proto__: null,
		trace,
		debug,
		info,
		warning,
		error,
		fatal,
		cleanup: flags & TIMESTAMP && minLevel !== 'none' ? cleanup : noop,
	};
}
