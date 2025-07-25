import config from '../config.json' with { type: 'json' };
import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';

const SI_PREFIXES = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
// prettier-ignore
const IEC_PREFIXES = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

const DEFAULT_ALIGN_SEPARATOR = '__ALIGN__';

function trimString(str, lim = twitch.MAX_MESSAGE_LENGTH) {
	str ??= '';
	return str.length > lim ? str.slice(0, lim - 1) + '…' : str;
}

function joinParts(arr, separator = config.messages.responsePartsSeparator) {
	return arr.join(separator);
}

function formatBytes(bytes, base = 1024, precision = 1) {
	if (typeof bytes !== 'number' || bytes < 1) return '0 B';
	let prefixes;
	switch (base) {
		case 1000:
			prefixes = SI_PREFIXES;
			break;
		case 1024:
			prefixes = IEC_PREFIXES;
			break;
		default:
			logger.warning('formatBytes: invalid base:', base);
			base = 1024;
			prefixes = IEC_PREFIXES;
	}
	let i = 0;
	for (let N = prefixes.length - 1; bytes >= base && i < N; bytes /= base, i++);

	return `${bytes.toFixed(precision)} ${prefixes[i]}`;
}

function toPlural(n, single, plural) {
	if (n === 1) return single;
	return plural ?? single + 's';
}

function align(lines, separator = DEFAULT_ALIGN_SEPARATOR, padding = 3) {
	if (!Number.isInteger(padding) || padding < 1) {
		logger.warning('align: invalid padding:', padding);
		padding = 3;
	}
	if (typeof lines === 'string') lines = lines.split('\n');
	else if (!Array.isArray(lines)) return '';
	if (!lines.length) return '';
	if (typeof separator !== 'string' || !separator) {
		logger.warning('align: invalid separator:', separator);
		separator = DEFAULT_ALIGN_SEPARATOR;
	}

	const rows = new Array(lines.length),
		columnWidths = [];
	let maxColumns = 0;
	for (let i = 0; i < lines.length; i++) {
		const cells = (rows[i] = lines[i].split(separator));
		if (cells.length > maxColumns) maxColumns = cells.length;
		if (cells.length < 2) continue;
		for (let j = 0; j < cells.length; j++) {
			const len = cells[j].length;
			if (columnWidths[j] === undefined || len > columnWidths[j])
				columnWidths[j] = len;
		}
	}
	if (maxColumns < 2) return lines.join('\n');

	const alignedLines = new Array(lines.length);
	for (let i = 0; i < lines.length; i++) {
		const cells = rows[i];
		if (cells.length === 1) {
			alignedLines[i] = cells[0];
			continue;
		}
		let line = '';
		for (let j = 0; j < cells.length - 1; j++)
			line += cells[j].padEnd(columnWidths[j] + padding);
		line += cells[cells.length - 1];
		alignedLines[i] = line;
	}

	return alignedLines.join('\n');
}

export default {
	DEFAULT_ALIGN_SEPARATOR,

	trim: trimString,
	join: joinParts,
	bytes: formatBytes,
	plural: toPlural,
	align,
};
