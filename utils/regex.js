import logger from '../services/logger.js';

const tosPatterns = ['racism', 'age', 'homophobia'];

const patterns = {
	invisChars:
		/[\u034f\u2800\u{E0000}\u180e\ufeff\u2000-\u200d\u206D\uDC00\uDB40]/gu,
	racism:
		/(?:(?:\b(?<![-=\.])|monka)(?:[Nnñ]|[Ii7]V)|[\/|]\\[\/|])[\s\.]*?[liI1y!j\/|]+[\s\.]*?(?:[GgbB6934Q🅱qğĜƃ၅5\*][\s\.]*?){2,}(?!arcS|l|Ktlw|ylul|ie217|64|\d? ?times)/i,
	age: /\b(?:i\s*(?:am|'m|’m|m|is)|my\s*age\s*(?:is|['’]?\s*m)?)\s*(?:under\s*)?(?:less\s*than\s*)?(?:(?:1[0-4]|[1-9])\s*(?:yo|years\s*old|years)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)(?:\s*(?:yo|years\s*old|years)?)?)\b/i,
	homophobia: /\b(\W|_)?f+\s*[aа@]+\s*(g|8)+/i,
	username: /^(?!_)\w{1,25}$/,
	id: /^[1-9]\d*$/,
};

function checkMessage(str) {
	for (const p of tosPatterns) {
		const pattern = patterns[p];
		pattern.lastIndex = 0;
		const match = pattern.exec(str);
		if (match) return { pattern: p, match };
	}
	return null;
}

function construct(str) {
	if (typeof str !== 'string' || !str || str[0] !== '/') return null;
	const lastSlash = str.lastIndexOf('/');
	if (lastSlash <= 1) return null;

	try {
		return new RegExp(str.slice(1, lastSlash), str.slice(lastSlash + 1));
	} catch (err) {
		logger.debug(`[REGEX] error creating RegExp from "${str}":`, err);
		return null;
	}
}

function pointer(match, prefix = '') {
	if (
		!match ||
		typeof match.index !== 'number' ||
		typeof match.input !== 'string' ||
		match[0] === null ||
		match[0] === undefined
	)
		throw new Error('expected a RegExp match');

	const pointerLine =
		' '.repeat(prefix.length + match.index) +
		'^' +
		'~'.repeat(Math.max(0, match[0].length - 1));

	return `${prefix}${match.input}\n${pointerLine}`;
}

export default {
	patterns,

	checkMessage,
	construct,
	pointer,
};
