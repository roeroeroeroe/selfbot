import logger from '../services/logger.js';
import utils from './index.js';
// prettier-ignore
const UNIT_NAMES = [
	'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond',
];
// prettier-ignore
const UNIT_PLURALS = [
	'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds',
];
const UNIT_MS = [
	31536000000, 2592000000, 604800000, 86400000, 3600000, 60000, 1000, 1,
];
const UNIT_ALIASES = [
	['y', 'yr', 'yrs'],
	['mo', 'mos'],
	['w', 'wk', 'wks'],
	['d'],
	['h', 'hr', 'hrs'],
	['m', 'min', 'mins'],
	['s', 'sec', 'secs'],
	['ms', 'msec', 'msecs'],
];

const aliasToMs = new Map();
const nameToIndex = Object.create(null);

for (let i = 0; i < UNIT_NAMES.length; i++) {
	nameToIndex[UNIT_NAMES[i]] = i;
	nameToIndex[UNIT_PLURALS[i]] = i;
	aliasToMs.set(UNIT_NAMES[i], UNIT_MS[i]);
	aliasToMs.set(UNIT_PLURALS[i], UNIT_MS[i]);
	for (const a of UNIT_ALIASES[i]) {
		nameToIndex[a] = i;
		aliasToMs.set(a, UNIT_MS[i]);
	}
}

const sortedUnitKeys = Array.from(aliasToMs.keys())
	.sort((a, b) => b.length - a.length)
	.join('|');

const numberPattern = /^\d+(?:\.\d+)?$/;
const durationPattern = new RegExp(
	`(\\d+(?:\\.\\d+)?)\\s*(${sortedUnitKeys})`,
	'g'
);

function parse(str, defaultUnit = 'millisecond') {
	if (typeof str !== 'string' || !(str = str.trim().toLowerCase())) return null;

	if (numberPattern.test(str)) {
		const unitMs = aliasToMs.get(defaultUnit);
		if (!unitMs) {
			logger.warning('parse: invalid defaultUnit:', defaultUnit);
			return Math.round(parseFloat(str));
		}
		return Math.round(parseFloat(str) * unitMs);
	}
	let total = 0,
		match;

	durationPattern.lastIndex = 0;
	while ((match = durationPattern.exec(str)) !== null) {
		const num = parseFloat(match[1]);
		const unitMs = aliasToMs.get(match[2]);
		if (!Number.isFinite(num) || !unitMs) return null;
		total += num * unitMs;
	}

	durationPattern.lastIndex = 0;
	if (!total && !durationPattern.exec(str)) return null;

	durationPattern.lastIndex = 0;
	if (str.replace(durationPattern, '').trim()) return null;

	return Math.round(total);
}

function format(
	ms,
	{
		maxParts = 3,
		separator = ', ',
		lastSeparator = ', and ',
		shortForm = true,
		smallest = 'second',
	} = {}
) {
	if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;

	const end = nameToIndex[smallest] ?? UNIT_NAMES.length - 1;
	if (!ms)
		return shortForm ? `0${UNIT_ALIASES[end][0]}` : `0 ${UNIT_PLURALS[end]}`;

	const buildPart = shortForm
		? (c, i) => `${c}${UNIT_ALIASES[i][0]}`
		: (c, i) =>
				`${c} ${utils.format.plural(c, UNIT_NAMES[i], UNIT_PLURALS[i])}`;

	const parts = [];
	for (let i = 0; i <= end && parts.length < maxParts; i++) {
		const count = Math.floor(ms / UNIT_MS[i]);
		if (!count) continue;
		parts.push(buildPart(count, i));
		ms -= count * UNIT_MS[i];
	}

	switch (parts.length) {
		case 0:
			return shortForm ? `0${UNIT_ALIASES[end][0]}` : `0 ${UNIT_PLURALS[end]}`;
		case 1:
			return parts[0];
		default:
			const last = parts.pop();
			return parts.join(separator) + lastSeparator + last;
	}
}

function createAge(
	now = Date.now(),
	invalidDatePlaceholder = 'N/A',
	formatOptions = {}
) {
	if (now instanceof Date) now = now.getTime();
	return function (dateInput) {
		const ts = Date.parse(dateInput);
		if (Number.isNaN(ts)) return invalidDatePlaceholder;
		return format(now - ts, formatOptions) ?? invalidDatePlaceholder;
	};
}

export default {
	parse,
	format,
	createAge,
};
