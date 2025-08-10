import globalFlags from './global_flags.js';
import converters from './converters.js';
import listConverter from './list_converter.js';
import {
	VALID_FLAG_TYPES,
	BOOLEAN_VALUES,
	DEFAULT_LIST_SEPARATOR,
	VALID_LIST_SEPARATORS,
} from './constants.js';

function buildFlagSummary(flag) {
	const parts = [flag.optionsDisplay];
	if (!flag.list) parts.push(flag.type);
	else {
		const { unique, errorOnDuplicates, separator, minItems, maxItems } =
			flag.list;
		const listDetails = [];
		if (unique)
			listDetails.push(errorOnDuplicates ? 'unique: strict' : 'unique');
		listDetails.push(`separator: ${String(separator)}`);
		if (minItems) listDetails.push(`min: ${minItems}`);
		if (maxItems !== Number.POSITIVE_INFINITY)
			listDetails.push(`max: ${maxItems}`);
		parts.push(`${flag.type}[] (${listDetails.join(', ')})`);
	}

	if (flag.required) parts.push('required');
	return parts.join(' ');
}
// prettier-ignore
function buildConflictsMap(flags, exclusiveGroups) {
	const conflicts = new Map(flags.map(f => [f.name, new Set()])),
		seenGroups = new Set();
	for (let gi = 0; gi < exclusiveGroups.length; gi++) {
		const group = exclusiveGroups[gi];
		if (!Array.isArray(group) || group.length < 2)
			throw new Error('exclusive group must contain at least 2 flags');
		const seenFlags = new Set();
		for (let i = 0, n; i < group.length; i++) {
			if (seenFlags.has(n = group[i]))
				throw new Error(`exclusive group [${group}] ` +
				                `contains duplicate flag "${n}"`);
			seenFlags.add(n);
		}
		const sorted = group.slice().sort(), key = sorted.join('\0');
		if (seenGroups.has(key))
			throw new Error('duplicate exclusive group: another group ' +
			                `contains exactly the same flags [${group}]`);
		seenGroups.add(key);
		for (let i = 0, n; i < sorted.length; i++)
			if (!conflicts.has(n = sorted[i]))
				throw new Error(`exclusive group [${group}] ` +
				                `refers to unknown flag "${n}"`);
		for (let i = 0; i < sorted.length; i++)
			for (let j = 0; j < sorted.length; j++)
				if (i !== j)
					conflicts.get(sorted[i]).add(sorted[j]);
	}
	return new Map([...conflicts.entries()].map(([n, set]) => [n, [...set]]));
}
// prettier-ignore
function createParser(schema, exclusiveGroups) {
	const flags           = new Map();
	const optionsMap      = new Map();
	const requiredFlags   = [];
	const flagsToValidate = [];
	const listFlags       = [];
	const defaultOptions  = {};

	const mergedSchema          = [...globalFlags.SCHEMA, ...schema];
	const mergedExclusiveGroups = [...globalFlags.EXCLUSIVE_GROUPS, ...exclusiveGroups];

	for (const flag of mergedSchema) {
		if (!flag || typeof flag !== 'object')
			throw new Error('flag must be an object');
		if (typeof flag.name !== 'string' || !flag.name ||
		    /\s/.test(flag.name))
			throw new Error("'name' must be a non-empty string with no spaces");
		if (!VALID_FLAG_TYPES.has(flag.type))
			throw new Error(`'type' for flag "${flag.name}" must be one of: ` +
			                [...VALID_FLAG_TYPES].join(', '));
		if (typeof flag.required !== 'boolean')
			throw new Error(`'required' for flag "${flag.name}" must be a boolean`);
		if (typeof flag.description !== 'string')
			throw new Error(`'description' for flag "${flag.name}" must be a string`);

		if (flag.list && flag.list !== null) {
			if (typeof flag.list !== 'object')
				throw new Error(`'list' for flag "${flag.name}" must be an object`);
			const {
				unique = false,
				errorOnDuplicates = false,
				separator = DEFAULT_LIST_SEPARATOR,
				minItems = 0,
				maxItems = Infinity,
				itemValidator = () => true,
			} = flag.list;
			if (typeof unique !== 'boolean')
				throw new Error(`'list.unique' for flag "${flag.name}" ` +
				                'must be a boolean');
			if (typeof errorOnDuplicates !== 'boolean')
				throw new Error(`'list.errorOnDuplicates' for flag "${flag.name}" ` +
				                'must be a boolean');
			if (errorOnDuplicates && !unique)
				throw new Error(`'list.errorOnDuplicates' for flag "${flag.name}" ` +
				                "requires 'list.unique' to be true");
			if (separator !== DEFAULT_LIST_SEPARATOR &&
				!VALID_LIST_SEPARATORS.has(separator))
				throw new Error(`'list.separator' for flag "${flag.name}" ` +
				                'must be one of: ' +
				                [...VALID_LIST_SEPARATORS].join(', '));
			if (!Number.isInteger(minItems) || minItems < 0)
				throw new Error(`'list.minItems' for flag "${flag.name}" ` +
				                'must be a non-negative integer');
			if (maxItems !== Number.POSITIVE_INFINITY &&
			    (!Number.isInteger(maxItems) || maxItems < 1))
				throw new Error(`'list.maxItems' for flag "${flag.name}" ` +
				                'must be a positive integer');
			if (typeof itemValidator !== 'function')
				throw new Error(`'list.itemValidator' for flag "${flag.name}" ` +
				                'must be a function');
			Object.assign(flag.list, { separator, minItems, maxItems, itemValidator });
			flag.converter = listConverter.create(converters[flag.type], flag.list);
			listFlags.push(flag.name);
		} else
			flag.converter = converters[flag.type];

		if (!('defaultValue' in flag))
			throw new Error(`'defaultValue' must be provided for flag "${flag.name}"`);

		if (flag.defaultValue !== null) {
			if (flag.list) {
				if (typeof flag.defaultValue !== 'string')
					throw new Error(`'defaultValue' for flag "${flag.name}" must be ` +
					                'a string');
				const [v, err] = flag.converter(flag.defaultValue);
				if (err)
					throw new Error(`'defaultValue' for flag "${flag.name}" must be ` +
				                    `a valid ${flag.type} list: ${err}`);
				flag.defaultValue = v;
			} else {
				const [v, err] = flag.converter(String(flag.defaultValue));
				if (err)
					throw new Error(`'defaultValue' for flag "${flag.name}" must be ` +
					                `a valid ${flag.type}: ${err}`);
				flag.defaultValue = v;
			}
		} else if (flag.list)
			flag.defaultValue = [];
		if (flag.validator && typeof flag.validator !== 'function')
			throw new Error(`'validator' for flag "${flag.name}" must be a function`);
		const { short, long } = flag;
		if (!short && !long)
			throw new Error("either 'short' or 'long' must be set for flag " +
			                `"${flag.name}"`);
		const displayParts = [];
		if (short) {
			if (typeof short !== 'string' || short.length !== 1)
				throw new Error(`'short' for flag "${flag.name}" must be a ` +
				                'single character');
			if (optionsMap.has(short))
				throw new Error(`'short' for flag "${flag.name}" conflicts ` +
				                `with flag "${optionsMap.get(short).name}"`);
			optionsMap.set(short, flag);
			displayParts.push(`-${short}`);
		}
		if (long) {
			if (typeof long !== 'string' || long.length < 2)
				throw new Error(`'long' for flag "${flag.name}" must be at ` +
				                'least 2 characters long');
			if (/\s/.test(long))
				throw new Error(`'long' for flag "${flag.name}" must be a ` +
				                'string with no spaces');
			if (optionsMap.has(long))
				throw new Error(`'long' for flag "${flag.name}" conflicts ` +
				                `with flag "${optionsMap.get(long).name}"`);
			optionsMap.set(long, flag);
			displayParts.push(`--${long}`);
		}
		flag.optionsDisplay = displayParts.join(', ');
		flag.summary = buildFlagSummary(flag);
		flag.validator = typeof flag.validator === 'function' ? flag.validator : null;
		defaultOptions[flag.name] = flag.defaultValue;
		flags.set(flag.name, flag);
		if (flag.required)
			requiredFlags.push(flag);
		if (flag.validator)
			flagsToValidate.push(flag);
	}

	const conflictsMap = buildConflictsMap(Array.from(flags.values()),
	                                       mergedExclusiveGroups);
	for (const flag of flags.values())
		flag.conflicts = conflictsMap.get(flag.name) || [];

	function parse(argv) {
		const options       = Object.assign({}, defaultOptions);
		const providedFlags = Object.create(null);
		const errors        = [];
		const rest          = [];

		let i = 0;
		for (; i < listFlags.length; i++) {
			const n = listFlags[i];
			options[n] = options[n].slice();
		}

		const argc = argv.length;
		function setv(flag, inlineValue = null, getNext = true) {
			for (let j = 0; j < flag.conflicts.length; j++) {
				const n = flag.conflicts[j];
				if (providedFlags[n])
					errors.push(`${flag.optionsDisplay}: cannot be used with ` +
					            `${n} (${flags.get(n).optionsDisplay})`);
			}
			let rawValue = inlineValue;
			if (getNext && inlineValue === null && i < argc)
				if (flag.type === 'boolean') {
					if (BOOLEAN_VALUES.has(argv[i]))
						rawValue = argv[i++];
				} else {
					const next = argv[i];
					if (next[0] !== '-' ||
					    !optionsMap.has(next.slice(next[1] === '-' ? 2 : 1)))
						rawValue = argv[i++];
				}

			providedFlags[flag.name] = true;
			const [v, err] = flag.converter(rawValue);
			if (err)
				errors.push(`${flag.optionsDisplay}: ${err}`);
			options[flag.name] = v;
		}

		i = 0;
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
						const flag = optionsMap.get(k);
						if (flag)
							setv(flag, arg.slice(eqIndex + 1));
						else
							rest.push(arg);
					} else
						rest.push(arg);
				} else {
					const k = arg.slice(2);
					if (k.length > 1) {
						const flag = optionsMap.get(k);
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
				const flag = optionsMap.get(k);
				if (flag)
					setv(flag, null, j === arg.length - 1);
				else {
					rest.push(j === 1 ? arg : arg.slice(j));
					break;
				}
			}
		}
		for (i = 0; i < requiredFlags.length; i++) {
			const f = requiredFlags[i];
			if (!providedFlags[f.name])
				errors.push(`${f.optionsDisplay}: flag is required`);
		}
		for (i = 0; i < flagsToValidate.length; i++) {
			const f = flagsToValidate[i];
			if (providedFlags[f.name] && !f.validator(options[f.name]))
				errors.push(`${f.optionsDisplay}: failed validation`);
		}
		return { options, rest, errors };
	}

	return {
		flags: Array.from(flags.values()),
		exclusiveGroups: mergedExclusiveGroups,
		parse,
	};
}

export default {
	create: createParser,
};
