import utils from '../../utils/index.js';
import globalFlags from './global_flags.js';

const FLAG_TYPES = ['string', 'boolean', 'number', 'duration', 'url'];

function init(schema) {
	const flags = {};
	const aliasesMap = {};

	// prettier-ignore
	for (const flag of [...globalFlags.GLOBAL_FLAGS_SCHEMA, ...schema]) {
		if (flag === null || typeof flag !== 'object')
			throw new Error('flag must be an object');
		if (typeof flag.name !== 'string' || flag.name === '' || /\s/.test(flag.name))
			throw new Error('flag name must be a string with no spaces');
		if (typeof flag.type !== 'string' || !FLAG_TYPES.includes(flag.type))
			throw new Error(`type for flag "${flag.name}" must be one of ${FLAG_TYPES.join(', ')}`);
		if (typeof flag.required !== 'boolean')
			throw new Error(`'required' for flag "${flag.name}" must be a boolean`);
		if (typeof flag.description !== 'string')
			throw new Error(`description for flag "${flag.name}" must be a string`);

		if (
			flag.defaultValue !== null &&
			flag.type !== 'duration' &&
			flag.type !== 'url' &&
			typeof flag.defaultValue !== flag.type
		)
			throw new Error(`default value for flag "${flag.name}" must be a ${flag.type}`);

		if (flag.validator && typeof flag.validator !== 'function')
			throw new Error(`validator for flag "${flag.name}" must be a function`);

		if (
			!Array.isArray(flag.aliases) ||
			!flag.aliases.length ||
			flag.aliases.length > 2 ||
			flag.aliases.every(a => typeof a !== 'string' && a !== null)
		)
			throw new Error(`aliases for flag "${flag.name}" must be an array of 1 or 2 strings (or null for unused short/long forms)`);

		const [short, long] = flag.aliases;
		if (short !== null) {
			if (typeof short !== 'string' || short.length !== 1)
				throw new Error(`short option for flag "${flag.name}" must be a single character`);
			if (aliasesMap[short])
				throw new Error(`short option for flag "${flag.name}" conflicts with flag "${aliasesMap[short]}"`);

			aliasesMap[short] = flag.name;
		}

		if (long !== null) {
			if (typeof long !== 'string' || long.length < 2)
				throw new Error(`long option for flag "${flag.name}" must be at least 2 characters long`);
			if (/\s/.test(long))
				throw new Error(`long option for flag "${flag.name}" must be a string with no spaces`);
			if (aliasesMap[long])
				throw new Error(`long option for flag "${flag.name}" conflicts with flag "${aliasesMap[long]}"`);

			aliasesMap[long] = flag.name;
		}

		flags[flag.name] = flag;
	}

	return { flags, aliasesMap };
}

const converters = {
	boolean: v => (v === 'false' ? false : true),
	number: v => {
		const n = parseFloat(v);
		return Number.isNaN(n) ? flag.defaultValue : n;
	},
	duration: v => {
		try {
			return utils.duration.parse(v);
		} catch (err) {
			throw new Error(`invalid duration: ${err.message}`);
		}
	},
	url: v => {
		if (!utils.regex.patterns.url.test(v)) throw new Error('invalid url');
		return v;
	},
};

function vconv(flag, v) {
	if (v === null)
		return [flag.type === 'boolean' ? true : flag.defaultValue, null];

	try {
		return converters[flag.type] ? [converters[flag.type](v), null] : [v, null];
	} catch (err) {
		return [
			null,
			`invalid ${flag.type} for flag "${flag.name}": ${err.message}`,
		];
	}
}

function parse(argv, flagData) {
	const { flags, aliasesMap } = flagData;
	const options = {};
	for (const k in flags) options[k] = flags[k].defaultValue;
	const providedFlags = {};
	const rest = [];
	const errors = [];

	let i = 0,
		argc = argv.length;
	function getv(k) {
		const flag = flags[aliasesMap[k]];
		if (
			i + 1 >= argc ||
			(argv[i + 1][0] === '-' && aliasesMap[argv[i + 1].replace(/^-+/, '')])
		)
			return vconv(flag, null);
		if (flag.type === 'boolean')
			return argv[i + 1] === 'false' || argv[i + 1] === 'true'
				? vconv(flag, argv[++i])
				: vconv(flag, null);
		return vconv(flag, argv[++i]);
	}

	function setv(k, res) {
		if (res[1]) errors.push(res[1]);
		providedFlags[aliasesMap[k]] = true;
		options[aliasesMap[k]] = res[0];
	}

	for (; i < argc; i++) {
		const arg = argv[i];
		if (arg[0] !== '-' || arg.length === 1) {
			rest.push(arg);
			continue;
		}
		if (arg[1] === '-') {
			if (arg.length === 2) {
				while (++i < argc) rest.push(argv[i]);
				break;
			}
			const eqIndex = arg.indexOf('=');
			if (eqIndex !== -1) {
				const k = arg.slice(2, eqIndex);
				if (k.length > 1 && aliasesMap[k])
					setv(k, vconv(flags[aliasesMap[k]], arg.slice(eqIndex + 1)));
				else rest.push(arg);
			} else {
				const k = arg.slice(2);
				if (k.length > 1 && aliasesMap[k]) setv(k, getv(k));
				else rest.push(arg);
			}
			continue;
		}
		for (let j = 1, n = arg.length; j < n; j++)
			if (aliasesMap[arg[j]])
				setv(
					arg[j],
					j === n - 1 ? getv(arg[j]) : vconv(flags[aliasesMap[arg[j]]], null)
				);
			else {
				rest.push(j === 1 ? arg : arg.slice(j));
				break;
			}
	}

	for (const k in flags) {
		const flag = flags[k];
		if (flag.required && !providedFlags[k]) {
			const optsParts = [];
			if (flag.aliases[0]) optsParts.push(`-${flag.aliases[0]}`);
			if (flag.aliases[1]) optsParts.push(`--${flag.aliases[1]}`);
			errors.push(
				`flag "${flag.name}" (${optsParts.join(', ')}) is required but not provided`
			);
		} else if (
			typeof flag.validator === 'function' &&
			options[k] !== flag.defaultValue &&
			!flag.validator(options[k])
		)
			errors.push(`flag "${flag.name}" did not pass validation`);
	}

	return { options, rest, errors };
}

export default {
	FLAG_TYPES,

	init,
	parse,
};
