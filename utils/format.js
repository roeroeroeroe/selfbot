import config from '../config.json' with { type: 'json' };
// prettier-ignore
const IEC_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
const MAX_IEC_BYTE_UNIT_INDEX = IEC_BYTE_UNITS.length - 1;

function trimString(str, lim = 500) {
	str ??= '';
	return str.length > lim ? str.slice(0, lim - 1) + '…' : str;
}

function joinParts(arr, sep = config.responsePartsSeparator) {
	return arr.join(sep);
}

function formatBytes(bytes, precision = 1) {
	if (typeof bytes !== 'number' || bytes < 1) return '0 B';
	let i = 0;
	for (; bytes >= 1024 && i < MAX_IEC_BYTE_UNIT_INDEX; bytes /= 1024, i++);

	return `${bytes.toFixed(precision)} ${IEC_BYTE_UNITS[i]}`;
}

function toPlural(n, single, plural = `${single}s`) {
	return n === 1 ? single : plural;
}

function align(arr, partsSeparator = '__ALIGN__') {
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

export default {
	trim: trimString,
	join: joinParts,
	bytes: formatBytes,
	plural: toPlural,
	align,
};
