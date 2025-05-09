const unitPattern = /(\d+(?:\.\d+)?)(ms|mo|[ywdhms])?/g;
const durationUnits = {
	y: 31536000000,
	mo: 2592000000,
	w: 604800000,
	d: 86400000,
	h: 3600000,
	m: 60000,
	s: 1000,
	ms: 1,
};

const nonMsDurationUnits = { ...durationUnits };
delete nonMsDurationUnits.ms;

function format(ms, largest = 3, separator = ' ') {
	if (typeof ms !== 'number' || isNaN(ms) || ms <= 0) return `0${separator}s`;

	const resultParts = [];
	for (const k in nonMsDurationUnits) {
		if (resultParts.length >= largest) break;
		const v = nonMsDurationUnits[k];
		if (ms < v) continue;

		resultParts.push(Math.floor(ms / v) + k);

		if ((ms %= v) === 0) break;
	}

	return resultParts.length ? resultParts.join(separator) : `0${separator}s`;
}

function parse(str) {
	unitPattern.lastIndex = 0;
	let ms = 0,
		match = unitPattern.exec(str);
	if (!match) return null;

	do {
		if (!match[2]) return null;
		ms += +match[1] * durationUnits[match[2]];
	} while ((match = unitPattern.exec(str)));

	return ms;
}

export default {
	format,
	parse,
};
