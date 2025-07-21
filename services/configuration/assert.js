import fs from 'fs';
import utils from '../../utils/index.js';

function assert(bool, message) {
	if (!bool) throw new Error(message);
}

function assertBool(v) {
	assert(typeof v === 'boolean', 'must be a boolean');
}

function assertNonEmptyString(v) {
	assert(typeof v === 'string' && v.trim(), 'must be a non-empty string');
}

function assertUsername(v) {
	assert(
		typeof v === 'string' && utils.regex.patterns.username.test(v),
		'must be a valid username'
	);
}

function assertId(v) {
	assert(
		typeof v === 'string' && utils.regex.patterns.id.test(v),
		'must be a valid ID'
	);
}

function assertNonNegativeInt(v) {
	assert(Number.isInteger(v) && v >= 0, 'must be a non-negative integer');
}

function assertIntBetween(v, a, b) {
	assert(
		Number.isInteger(v) && v >= a && v <= b,
		`must be an integer between ${a} and ${b}`
	);
}

function assertFloatBetween(v, a, b) {
	assert(
		typeof v === 'number' && !Number.isNaN(v) && v >= a && v <= b,
		`must be a float between ${a} and ${b}`
	);
}

function assertStringOneOf(v, arr) {
	assert(
		typeof v === 'string' && arr.includes(v),
		`must be one of: ${arr.join(', ')}`
	);
}

function assertHttpUrl(v) {
	assert(
		utils.isValidHttpUrl(v) && !v.endsWith('/'),
		'must be a valid http(s) URL with no trailing slashes'
	);
}

function assertExecutable(v) {
	assertNonEmptyString(v);
	try {
		fs.accessSync(v, fs.constants.X_OK);
	} catch {
		throw new Error('must be executable');
	}
}

function assertPort(v) {
	assertIntBetween(v, 1, 65535);
}

function assertUDS(v) {
	assert(process.platform !== 'win32', 'not supported on win32');
	assertNonEmptyString(v);
	let stats;
	try {
		stats = fs.statSync(v);
	} catch {
		throw new Error('must exist and be accessible');
	}
	assert(stats.isSocket(), 'must be a socket');
	try {
		fs.accessSync(v, fs.constants.R_OK | fs.constants.W_OK);
	} catch {
		throw new Error('must have read/write access permissions');
	}
}

export default {
	assert,
	bool: assertBool,
	nonEmptyString: assertNonEmptyString,
	username: assertUsername,
	id: assertId,
	nonNegativeInt: assertNonNegativeInt,
	intBetween: assertIntBetween,
	floatBetween: assertFloatBetween,
	stringOneOf: assertStringOneOf,
	httpUrl: assertHttpUrl,
	executable: assertExecutable,
	port: assertPort,
	uds: assertUDS,
};
