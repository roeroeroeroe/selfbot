import config from '../config.json' with { type: 'json' };

export function trimString(s, lim = 485) {
	return s.length > lim ? s.slice(0, lim - 1) + '…' : s;
}

export function joinResponseParts(arr, sep = config.responsePartsSeparator) {
	return arr.join(sep);
}

const iecByteUnits = [
	'B',
	'KiB',
	'MiB',
	'GiB',
	'TiB',
	'PiB',
	'EiB',
	'ZiB',
	'YiB',
];
export function formatBytes(b, precision = 1) {
	if (typeof b !== 'number' || b < 1) return '0 B';
	let i = 0;
	for (let n = iecByteUnits.length - 1; b >= 1024 && i < n; b /= 1024, i++);

	return `${b.toFixed(precision)} ${iecByteUnits[i]}`;
}

export function toPlural(n, single, plural = `${single}s`) {
	return n === 1 ? single : plural;
}

export function alignLines(arr, partsSeparator = '__ALIGN__') {
	if (!Array.isArray(arr)) arr = arr.split('\n');

	let maxWidth = 0;
	for (const line of arr) {
		const sepIndex = line.indexOf(partsSeparator);
		if (sepIndex > maxWidth) maxWidth = sepIndex;
	}

	const alignedLines = new Array(arr.length);
	for (let i = 0; i < arr.length; i++) {
		const line = arr[i];
		const sepIndex = line.indexOf(partsSeparator);
		if (sepIndex === -1) {
			alignedLines[i] = line;
			continue;
		}
		alignedLines[i] =
			line.slice(0, sepIndex).padEnd(maxWidth + 3) +
			line.slice(sepIndex + partsSeparator.length);
	}

	return alignedLines.join('\n');
}

export function formatDate(date) {
	const iso = new Date(date).toISOString();
	return `${iso.substring(0, 10)} ${iso.substring(11, 19)} UTC`;
}
