import utils from '../../utils/index.js';
import { BOOLEAN_TRUE_VALUES, BOOLEAN_FALSE_VALUES } from './constants.js';

export default {
	boolean: v => {
		if (v === null || BOOLEAN_TRUE_VALUES.has(v)) return [true, null];
		if (BOOLEAN_FALSE_VALUES.has(v)) return [false, null];
		return [null, 'invalid boolean'];
	},
	int: v => {
		if (v === null) return [null, 'not an integer'];
		const n = Number((v = v.trim()));
		if (!Number.isInteger(n)) return [null, 'not an integer'];
		return [n, null];
	},
	float: v => {
		if (v === null) return [null, 'not a number'];
		const n = parseFloat((v = v.trim()));
		if (Number.isNaN(n)) return [null, 'not a number'];
		return [n, null];
	},
	duration: v => {
		if (v === null) return [null, 'invalid duration'];
		const n = utils.duration.parse((v = v.trim()));
		if (n === null) return [null, 'invalid duration'];
		return [n, null];
	},
	url: v => {
		if (v === null || !utils.isValidHttpUrl((v = v.trim())))
			return [null, 'invalid url'];
		return [v, null];
	},
	username: v => {
		if (v === null || !(v = v.trim())) return [null, 'invalid username'];
		const firstChar = v[0];
		if (firstChar === '@' || firstChar === '#') {
			if (v.length === 1) return [null, 'invalid username'];
			v = v.slice(1);
		}
		if (!utils.regex.patterns.username.test(v))
			return [null, 'invalid username'];
		return [v.toLowerCase(), null];
	},
	string: v => {
		if (v === null) return ['', null];
		return [v, null];
	},
};
