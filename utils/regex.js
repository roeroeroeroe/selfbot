import logger from '../services/logger.js';

const tosPatterns = ['racism', 'age', 'homophobia'];

const patterns = {
	invisChars:
		/[\u034f\u2800\u{E0000}\u180e\ufeff\u2000-\u200d\u206D\uDC00\uDB40]/gu,
	racism:
		/(?:(?:\b(?<![-=\.])|monka)(?:[Nnñ]|[Ii7]V)|[\/|]\\[\/|])[\s\.]*?[liI1y!j\/|]+[\s\.]*?(?:[GgbB6934Q🅱qğĜƃ၅5\*][\s\.]*?){2,}(?!arcS|l|Ktlw|ylul|ie217|64|\d? ?times)/i,
	age: /(?:(?:i|my age)\s*['’]?\s*(?:am|'m|m| is)\s*(?:under\s*)?(?:less\s*than\s*)?\s*(1[0-4]|([1-9]$|([1-9]\s?(yo|years|years\s old)))|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)($|\s?(yo|years|years\s old))))/i,
	homophobia: /(\s|^)f\s*[ag@а]\s*(g|8)(o|0)*t*/i,
	username: /^(?!_)\w{1,25}$/,
	id: /^[1-9]\d*$/,
};

function checkMessage(str) {
	for (const p of tosPatterns) if (patterns[p].test(str)) return p;
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

export default {
	patterns,

	checkMessage,
	construct,
};
