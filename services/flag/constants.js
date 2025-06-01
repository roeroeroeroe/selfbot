export const VALID_FLAG_TYPES = new Set([
	'string',
	'boolean',
	'int',
	'float',
	'duration',
	'url',
	'username',
]);
export const BOOLEAN_TRUE_VALUES = new Set(['t', 'true', '1']);
export const BOOLEAN_FALSE_VALUES = new Set(['f', 'false', '0']);
export const BOOLEAN_VALUES = new Set([
	...BOOLEAN_TRUE_VALUES,
	...BOOLEAN_FALSE_VALUES,
]);
export const DEFAULT_LIST_SEPARATOR = /\s+/;
export const VALID_LIST_SEPARATORS = new Set([',', ';', '|']);
