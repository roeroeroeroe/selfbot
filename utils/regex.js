import logger from '../services/logger.js';

const patterns = {
	invisChars:
		/[\u034f\u2800\u{E0000}\u180e\ufeff\u2000-\u200d\u206D\uDC00\uDB40]/gu,
	username: /^(?!_)\w{1,25}$/,
	id: /^[1-9]\d*$/,
	wordSplit: /[^\p{L}]+/u,
};

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

	construct,
};
