export function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

export function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, rej) =>
			setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)
		),
	]);
}

const shellArgPattern = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
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
	if (arr.length <= len) return [arr];
	const chunks = new Array(Math.ceil(arr.length / len));
	for (
		let i = 0, chunkIndex = 0;
		i < arr.length;
		chunks[chunkIndex++] = arr.slice(i, (i += len))
	);

	return chunks;
}

export function splitString(str, len) {
	if (!str) return [];
	if (str.length <= len) return [str];
	const words = str.split(' ');
	const chunks = [];
	for (
		let i = 0, j = 0, curr = words[0].length;
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

export function hexToRgb(hex) {
	hex = hex.replace(/^#/, '');
	if (hex.length === 3)
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];

	const n = parseInt(hex, 16);

	return {
		r: (n >> 16) & 0xff,
		g: (n >> 8) & 0xff,
		b: n & 0xff,
	};
}

export function rgbToHex({ r, g, b }) {
	return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function levenshteinDistance(a, b) {
	if (!a.length) return b.length;
	if (!b.length) return a.length;

	if (a.length > b.length) [a, b] = [b, a];

	const prev = new Array(a.length + 1);

	let i = 0;
	for (; i <= a.length; prev[i] = i++);

	for (let j = 1; j <= b.length; j++) {
		const curr = new Array(a.length + 1);
		curr[0] = j;
		for (
			i = 1;
			i <= a.length;
			curr[i] = Math.min(
				curr[i - 1] + 1,
				prev[i] + 1,
				prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			),
				i++
		);
		for (i = 0; i <= a.length; prev[i] = curr[i++]);
	}

	return prev[a.length];
}

export function getClosestString(str, arr) {
	let bestMatch = null,
		bestDistance = Infinity;

	for (const s of arr) {
		const distance = levenshteinDistance(str, s);
		if (distance < bestDistance) {
			if (distance <= 1) return s;
			bestDistance = distance;
			bestMatch = s;
		}
	}

	return bestMatch;
}

export function randomString(
	cset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
	len = 5
) {
	let s = '';
	for (; s.length < len; s += cset[Math.floor(Math.random() * cset.length)]);

	return s;
}
