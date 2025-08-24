import { inspect } from 'util';
import config from '../config.json' with { type: 'json' };
import twitch from '../services/twitch/index.js';
import logger from '../services/logger.js';
import metrics from '../services/metrics/index.js';
import regex from './regex.js';
import db from '../services/db/index.js';

export const BASE16_CHARSET = '0123456789abcdef';
export const BASE62_CHARSET =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const BASE64URL_CHARSET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

export function withTimeout(promise, ms) {
	if (ms <= 0) return promise;
	let timeout;
	return Promise.race([
		promise,
		new Promise((_, rej) => {
			timeout = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms);
		}),
	]).finally(() => clearTimeout(timeout));
}
// prettier-ignore
/**
 * - Whitespace characters (`' '`, `\t`, `\n`) outside of quotes split arguments.
 * - Matching single or double quotes group enclosed content as a single argument.
 * - Empty quotes produce an empty string if surrounded by whitespace
 *   boundaries (e.g., `a "" b` -> `['a', '', 'b']`).
 *   Empty quotes adjacent to a non-whitespace character on one side are ignored
 *   and do not produce a token (e.g., `a ""b` -> `['a', 'b']`).
 * - Backslash outside quotes is treated as a literal character.
 *   Backslash inside quotes can escape the matching quote
 *   (e.g., `"a\\"b"` -> `['a"b']`).
 * - Quotes surrounded by non-whitespace characters on both sides are treated as
 *   literal characters (e.g., `a"b"c` -> `['a"b"c']`, `a""b` -> `['a""b']`).
 * - Unmatched quotes are treated as literal characters.
 */
export function tokenize(str, out = []) {
	if (!Array.isArray(out)) {
		logger.warning('tokenize: out must be an array');
		out = [];
	}
	if (!str)
		return out;
	const N = str.length;

	let IndexArray;
	if (N <= 0xff) IndexArray = Uint8Array;
	else if (N <= 0xffff) IndexArray = Uint16Array;
	else IndexArray = Uint32Array;

	const nextSingle = new IndexArray(N + 1).fill(N);
	const nextDouble = new IndexArray(N + 1).fill(N);
	for (let i = N - 1; i >= 0; i--) {
		nextSingle[i] = nextSingle[i + 1];
		nextDouble[i] = nextDouble[i + 1];
		const c = str[i];
		if (c === "'") {
			if (str[i - 1] !== '\\')
				nextSingle[i] = i;
		} else if (c === '"') {
			if (str[i - 1] !== '\\')
				nextDouble[i] = i;
		}
	}

	let token = '';
	for (let i = 0; i < N; i++) {
		const c = str[i];
		if (c === "'" || c === '"') {
			const closingAt = (c === "'" ? nextSingle : nextDouble)[i + 1];
			if (closingAt === N) {
				token += c;
				continue;
			}

			const lc = str[i - 1],
				rc = str[closingAt + 1],
				isLeftBoundary = !lc || lc === ' ' || lc === '\n' || lc === '\t',
				isRightBoundary = !rc || rc === ' ' || rc === '\n' || rc === '\t';
			if (!isLeftBoundary && !isRightBoundary) {
				token += c;
				continue;
			}

			if (closingAt === i + 1) {
				if (isLeftBoundary && isRightBoundary && !token)
					out.push('');
				i = closingAt;
				continue;
			}

			for (let innerIndex = i + 1; innerIndex < closingAt; ) {
				const ic = str[innerIndex];
				if (ic === '\\' && str[innerIndex + 1] === c) {
					token += c;
					innerIndex += 2;
				} else {
					token += ic;
					innerIndex++;
				}
			}

			i = closingAt;
			continue;
		}
		if (c === ' ' || c === '\n' || c === '\t') {
			if (token) {
				out.push(token);
				token = '';
			}
			continue;
		}
		token += c;
	}
	if (token)
		out.push(token);

	return out;
}

export function splitArray(arr, len) {
	if (arr.length <= len || len <= 0) return [arr];
	const chunks = new Array(Math.ceil(arr.length / len));
	for (
		let i = 0, chunkIndex = 0;
		i < arr.length;
		chunks[chunkIndex++] = arr.slice(i, (i += len))
	);

	return chunks;
}

export function pickName(login, displayName) {
	return displayName.toLowerCase() === login ? displayName : login;
}

export function randomString(cset, len = 5) {
	cset ||= BASE62_CHARSET;
	const arr = new Array(len);
	for (let i = 0; i < len; arr[i++] = cset[(Math.random() * cset.length) | 0]);

	return arr.join('');
}

export function canFitAll(arr, limit, separatorLength) {
	const N = arr.length;
	let total = -separatorLength,
		i = 0;
	for (; i < N && (total += arr[i++].length + separatorLength) <= limit; );

	return i === N && total <= limit;
}

export function getMaxMessageLength(login, reply, mention, action) {
	login ??= '';
	let max = twitch.MAX_MESSAGE_LENGTH;
	if (reply) max -= login.length + twitch.chat.REPLY_OVERHEAD_LENGTH;
	else if (mention) max -= login.length + twitch.chat.MENTION_OVERHEAD_LENGTH;
	if (action) max -= twitch.chat.ACTION_OVERHEAD_LENGTH;
	return max;
}

const defaultCanRetry = err => err.retryable === true;
export async function retry(
	fn,
	{
		maxRetries = config.retry.maxRetries,
		baseDelay = config.retry.baseDelayMs,
		jitter = config.retry.jitter,
		requestsCounter,
		retriesCounter,
		logLabel = '',
		canRetry = defaultCanRetry,
	} = {}
) {
	const logPrefix = logLabel ? `[${logLabel}] ` : '';

	for (let i = 0; i <= maxRetries; i++) {
		const attempt = i + 1;
		if (i) {
			const exp = 2 ** (i - 1);
			const jitterFactor = 1 + Math.random() * jitter;
			const backoff = Math.round(baseDelay * exp * jitterFactor);
			logger.debug(`${logPrefix}retry ${i}, backing off ${backoff}ms`);
			await sleep(backoff);
			if (retriesCounter) metrics.counter.increment(retriesCounter);
		}

		logger.debug(`${logPrefix}attempt ${attempt}`);
		if (requestsCounter) metrics.counter.increment(requestsCounter);
		try {
			const result = await fn(i);
			logger.debug(`${logPrefix}succeeded on attempt ${attempt}`);
			return result;
		} catch (err) {
			if (i === maxRetries || !canRetry(err)) {
				logger.warning(`${logPrefix}giving up after ${attempt} attempts`);
				throw err;
			}
			logger.warning(`${logPrefix}error on attempt ${attempt}:`, err);
		}
	}
}

export function isValidPrefix(prefix) {
	return (
		typeof prefix === 'string' &&
		prefix &&
		prefix.length <= db.MAX_PREFIX_LENGTH &&
		!prefix.startsWith('.') &&
		!prefix.startsWith('/') &&
		!/\s/.test(prefix)
	);
}

export function isValidHttpUrl(str) {
	if (typeof str !== 'string' || !str) return false;
	try {
		const url = new URL(str);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

export function deepInspect(obj, depth = 10) {
	return inspect(obj, {
		depth,
		colors: false,
		compact: true,
		breakLength: Infinity,
	});
}

export function trimLogin(login) {
	if (typeof login !== 'string' || !(login = login.trim())) return '';
	const firstChar = login[0];
	if (firstChar === '@' || firstChar === '#') {
		if (login.length === 1) return '';
		login = login.slice(1);
	}
	return regex.patterns.username.test(login) ? login.toLowerCase() : '';
}

/**
 * @param {string | undefined} flag
 * @param {string | undefined} arg
 * @param {{ args?: string[], fallback?: string }} [opts]
 * @returns {string}
 */
export function resolveLoginInput(flag, arg, opts) {
	if (flag) return flag;
	if (arg) {
		if (opts?.args && Array.isArray(opts.args)) opts.args.shift();
		if ((arg = trimLogin(arg))) return arg;
	}
	return opts?.fallback || '';
}
