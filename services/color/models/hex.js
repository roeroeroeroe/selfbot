import { HASH_CHARCODE, ASCII_TO_HEX, INVALID_HEX } from '../constants.js';
import { rgbToHsl, rgbToXyz, rgbToLab } from './rgb.js';

export function normalizeHex(hex, validated = false) {
	if (!validated && !isValidHex(hex)) return null;
	hex = (
		hex.charCodeAt(0) === HASH_CHARCODE ? hex.slice(1) : hex
	).toLowerCase();
	return hex.length === 6
		? hex
		: hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
}

export function isValidHex(hex) {
	if (typeof hex !== 'string') return false;
	let i = hex.charCodeAt(0) === HASH_CHARCODE ? 1 : 0;
	const len = hex.length - i;
	if (len !== 3 && len !== 6) return false;
	for (let cc; i < hex.length; i++)
		if ((cc = hex.charCodeAt(i)) >= 128 || ASCII_TO_HEX[cc] === INVALID_HEX)
			return false;
	return true;
}

export function hexToShorthand(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex, true);
	return hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]
		? hex[0] + hex[2] + hex[4]
		: null;
}

export function hexToRgb(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex, true);
	return {
		R: (ASCII_TO_HEX[hex.charCodeAt(0)] << 4) | ASCII_TO_HEX[hex.charCodeAt(1)],
		G: (ASCII_TO_HEX[hex.charCodeAt(2)] << 4) | ASCII_TO_HEX[hex.charCodeAt(3)],
		B: (ASCII_TO_HEX[hex.charCodeAt(4)] << 4) | ASCII_TO_HEX[hex.charCodeAt(5)],
	};
}

export function hexToHsl(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex, true);
	return rgbToHsl(hexToRgb(hex, true, true), true);
}

export function hexToXyz(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex, true);
	return rgbToXyz(hexToRgb(hex, true, true), true);
}

export function hexToLab(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex, true);
	return rgbToLab(hexToRgb(hex, true, true), true);
}

export default {
	normalize: normalizeHex,
	isValid: isValidHex,
	toShorthand: hexToShorthand,
	toRgb: hexToRgb,
	toHsl: hexToHsl,
	toXyz: hexToXyz,
	toLab: hexToLab,
};
