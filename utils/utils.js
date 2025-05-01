import config from '../config.json' with { type: 'json' };

const shellArgPattern = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
const base62Charset =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

export function withTimeout(promise, ms) {
	let id;
	return Promise.race([
		promise,
		new Promise((_, rej) => {
			id = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms);
		}),
	]).finally(() => clearTimeout(id));
}

export function shellSplit(str) {
	shellArgPattern.lastIndex = 0;
	const args = [];
	for (const match of str.match(shellArgPattern) ?? [])
		args.push(
			(match.startsWith('"') && match.endsWith('"')) ||
				(match.startsWith("'") && match.endsWith("'"))
				? match.substring(1, match.length - 1)
				: match
		);

	return args;
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

export function splitString(str, len) {
	if (!str) return [''];
	if (str.length <= len) return [str];
	const words = str.split(' ');
	const chunks = [];
	for (
		let i = 0, j = 0, curr = words[0]?.length || 0;
		i < words.length;
		chunks.push(words.slice(j, i).join(' ')),
			j = i,
			curr = words[i] ? words[i].length : 0
	)
		for (; ++i < words.length && (curr += 1 + words[i].length) <= len; );

	return chunks;
}

export function getEffectiveName(login, displayName) {
	return displayName.toLowerCase() === login ? displayName : login;
}

function damerauLevenshteinDistance(a, b) {
	const aLen = a.length;
	const bLen = b.length;
	const INF = aLen + bLen;

	const da = {};
	for (const char of new Set([...a, ...b])) da[char] = 0;

	const d = [];
	const rows = aLen + 2;
	const cols = bLen + 2;
	for (let i = 0; i < rows; d[i++] = new Array(cols).fill(0));
	d[0][0] = INF;
	for (let i = 0; i <= aLen; i++) {
		d[i + 1][1] = i;
		d[i + 1][0] = INF;
	}
	for (let j = 0; j <= bLen; j++) {
		d[1][j + 1] = j;
		d[0][j + 1] = INF;
	}

	for (let i = 1; i <= aLen; i++) {
		let db = 0;
		for (let j = 1; j <= bLen; j++) {
			const i1 = da[b[j - 1]];
			const j1 = db;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			if (cost === 0) db = j;

			d[i + 1][j + 1] = Math.min(
				d[i][j] + cost,
				d[i + 1][j] + 1,
				d[i][j + 1] + 1,
				d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
			);
		}
		da[a[i - 1]] = i;
	}

	return d[aLen + 1][bLen + 1];
}

export function getClosestString(str, arr) {
	let bestMatch = null,
		bestDistance = Infinity;

	for (const s of arr) {
		const distance = damerauLevenshteinDistance(str, s);
		if (distance < bestDistance) {
			if (distance <= 1) return s;
			bestDistance = distance;
			bestMatch = s;
		}
	}

	return bestMatch;
}

export function randomString(cset, len = 5) {
	cset ||= base62Charset;
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
