import utils from '../../utils/index.js';
import globalFlags from './global_flags.js';

const FLAG_TYPES = [
	'string',
	'boolean',
	'int',
	'float',
	'duration',
	'url',
	'username',
];
const BOOLEAN_TRUE_VALUES = new Set(['t', 'true', '1']);
const BOOLEAN_FALSE_VALUES = new Set(['f', 'false', '0']);
// prettier-ignore
function makeConverter(type) {
	switch (type) {
		case 'boolean':
			return v => {
				if (v === null || v === undefined ||
				    BOOLEAN_TRUE_VALUES.has(v))
					return [true, null];
				if (BOOLEAN_FALSE_VALUES.has(v))
					return [false, null];
				// should only be reachable with --flag=value syntax
				return [null, 'invalid boolean'];
			};
		case 'int':
			return v => {
				if (v === null || v === undefined)
					return [null, 'not an integer'];
				const n = Number(v);
				if (!Number.isInteger(n))
					return [null, 'not an integer'];
				return [n, null];
			};
		case 'float':
			return v => {
				if (v === null || v === undefined)
					return [null, 'not a number'];
				const n = parseFloat(v);
				if (Number.isNaN(n))
					return [null, 'not a number'];
				return [n, null];
			};
		case 'duration':
			return v => {
				const n = utils.duration.parse(v);
				if (n === null)
					return [null, 'invalid duration'];
				return [n, null];
			};
		case 'url':
			return v => {
				if (!utils.isValidHttpUrl(v))
					return [null, 'invalid url'];
				return [v, null];
			};
		case 'username':
			return v => {
				if (!v || !utils.regex.patterns.username.test(v))
					return [null, 'invalid username'];
				return [v.toLowerCase(), null];
			};
		default:
			return v => {
				if (v === null || v === undefined)
					return ['', null];
				return [v, null];
			};
	}
}
// prettier-ignore
function createParser(schema) {
	const flags          = new Map();
	const aliasesMap     = new Map();
	const requiredList   = [];
	const validateList   = [];
	const defaultOptions = {};

	for (const flag of [...globalFlags.GLOBAL_FLAGS_SCHEMA, ...schema]) {
		if (!flag || typeof flag !== 'object')
			throw new Error('flag must be an object');
		if (typeof flag.name !== 'string' || !flag.name ||
		    /\s/.test(flag.name))
			throw new Error("'name' must be a non-empty string with no spaces");
		if (!FLAG_TYPES.includes(flag.type))
			throw new Error(`'type' for flag "${flag.name}" must be one of: ` +
			                FLAG_TYPES.join(', '));
		if (typeof flag.required !== 'boolean')
			throw new Error(`'required' for flag "${flag.name}" must be a boolean`);
		if (typeof flag.description !== 'string')
			throw new Error(`'description' for flag "${flag.name}" must be a string`);

		flag.converter = makeConverter(flag.type);

		if (flag.defaultValue !== null) {
			const [v, err] = flag.converter(String(flag.defaultValue));
			if (err)
				throw new Error(`'defaultValue' for flag "${flag.name}" must be ` +
				                `a valid ${flag.type}: ${err}`);
			flag.defaultValue = v;
		}
		if (flag.validator && typeof flag.validator !== 'function')
			throw new Error(`'validator' for flag "${flag.name}" must be a function`);
		if (!Array.isArray(flag.aliases) || flag.aliases.length !== 2 ||
		    !flag.aliases.every(a => a === null || typeof a === 'string') ||
		    flag.aliases.every(a => a === null))
			throw new Error(`'aliases' for flag "${flag.name}" must be ` +
			                'an array of 1 or 2 strings (null for unused short/long form)');

		const [short, long] = flag.aliases;
		const displayParts = [];
		if (short !== null) {
			if (short.length !== 1)
				throw new Error(`short option for "${flag.name}" must be a single character`);
			if (aliasesMap.has(short))
				throw new Error(`short option for flag "${flag.name}" ` +
				                `conflicts with flag "${aliasesMap.get(short).name}"`);
			aliasesMap.set(short, flag);
			displayParts.push(`-${short}`);
		}
		if (long !== null) {
			if (long.length < 2)
				throw new Error(`long option for flag "${flag.name}" ` +
				                'must be at least 2 characters long');
			if (/\s/.test(long))
				throw new Error(`long option for flag "${flag.name}" ` +
				                'must be a string with no spaces');
			if (aliasesMap.has(long))
				throw new Error(`long option for flag "${flag.name}" ` +
				                `conflicts with flag "${aliasesMap.get(long).name}"`);
			aliasesMap.set(long, flag);
			displayParts.push(`--${long}`);
		}
		flag.aliasDisplay = displayParts.join(', ');
		flag.validator = typeof flag.validator === 'function' ? flag.validator : null;
		defaultOptions[flag.name] = flag.defaultValue;
		flags.set(flag.name, flag);
		if (flag.required)
			requiredList.push(flag);
		if (flag.validator)
			validateList.push(flag);
	}

	const options       = Object.assign({}, defaultOptions);
	const providedFlags = Object.create(null);
	const errors        = [];
	const rest          = [];

	function parse(argv) {
		for (const k in defaultOptions) options[k] = defaultOptions[k];
		for (const k in providedFlags) providedFlags[k] = false;
		errors.length = rest.length = 0;

		const argc = argv.length;
		let i = 0;
		function setv(flag, inlineValue = null, getNext = true) {
			let rawValue = inlineValue;
			if (getNext && inlineValue === null && i < argc)
				if (flag.type === 'boolean') {
					const v = argv[i];
					if (BOOLEAN_TRUE_VALUES.has(v) ||
					    BOOLEAN_FALSE_VALUES.has(v))
						rawValue = argv[i++];
				} else {
					const next = argv[i];
					if (next[0] !== '-' ||
					    !aliasesMap.has(next.slice(next[1] === '-' ? 2 : 1)))
						rawValue = argv[i++];
				}

			providedFlags[flag.name] = true;
			const [v, err] = flag.converter(rawValue);
			if (err)
				errors.push(`${flag.aliasDisplay}: ${err}`);
			options[flag.name] = v === null ? flag.defaultValue : v;
		}

		while (i < argc) {
			const arg = argv[i++];
			if (arg[0] !== '-' || arg.length === 1) {
				rest.push(arg);
				continue;
			}
			if (arg[1] === '-') {
				if (arg.length === 2) {
					while (i < argc) rest.push(argv[i++]);
					break;
				}
				const eqIndex = arg.indexOf('=');
				if (eqIndex !== -1) {
					const k = arg.slice(2, eqIndex);
					if (k.length > 1) {
						const flag = aliasesMap.get(k);
						if (flag)
							setv(flag, arg.slice(eqIndex + 1) || null);
						else
							rest.push(arg);
					} else
						rest.push(arg);
				} else {
					const k = arg.slice(2);
					if (k.length > 1) {
						const flag = aliasesMap.get(k);
						if (flag)
							setv(flag);
						else
							rest.push(arg);
					} else
						rest.push(arg);
				}
				continue;
			}
			for (let j = 1; j < arg.length; j++) {
				const k = arg[j];
				const flag = aliasesMap.get(k);
				if (flag)
					setv(flag, null, j === arg.length - 1);
				else {
					rest.push(j === 1 ? arg : arg.slice(j));
					break;
				}
			}
		}
		for (i = 0; i < requiredList.length; i++) {
			const f = requiredList[i];
			if (!providedFlags[f.name])
				errors.push(`flag "${f.name}" (${f.aliasDisplay}) is required`);
		}
		for (i = 0; i < validateList.length; i++) {
			const f = validateList[i];
			if (providedFlags[f.name] && !f.validator(options[f.name]))
				errors.push(`flag "${f.name}" (${f.aliasDisplay}) failed validation`);
		}
		return { options, rest, errors };
	}

	return { flags: Array.from(flags.values()), parse };
}

export default {
	FLAG_TYPES,

	createParser,
};
