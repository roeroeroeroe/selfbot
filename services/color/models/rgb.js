// prettier-ignore
import {
	BYTE_TO_HEX_STRING,
	SRGB_EOTF_LUT,
	M_XR, M_XG, M_XB,
	M_YR, M_YG, M_YB,
	M_ZR, M_ZG, M_ZB,
} from '../constants.js';
import { xyzToLab } from './xyz.js';
// prettier-ignore
export function isValidRgb(RGB) {
	if (typeof RGB !== 'object' || RGB === null) return false;
	const { R, G, B } = RGB;
	return (
		R === (R | 0) && G === (G | 0) && B === (B | 0) &&
		R >= 0 && R <= 255 &&
		G >= 0 && G <= 255 &&
		B >= 0 && B <= 255
	);
}

export function rgbToHex(RGB, validated = false) {
	if (!validated && !isValidRgb(RGB)) return null;
	return (
		BYTE_TO_HEX_STRING[RGB.R] +
		BYTE_TO_HEX_STRING[RGB.G] +
		BYTE_TO_HEX_STRING[RGB.B]
	);
}
// prettier-ignore
export function rgbToHsl(RGB, validated = false) {
	if (!validated && !isValidRgb(RGB)) return null;

	const R = RGB.R / 255;
	const G = RGB.G / 255;
	const B = RGB.B / 255;

	const max = Math.max(R, G, B), min = Math.min(R, G, B);
	const delta = max - min;

	const L = (max + min) / 2;
	let H = 0, S = 0;

	if (delta) {
		S = L > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		switch (max) {
			case R: H = (G - B) / delta + (G < B ? 6 : 0); break;
			case G: H = (B - R) / delta + 2; break;
			case B: H = (R - G) / delta + 4; break;
		}
		H *= 60;
	}

	return { H, S, L };
}

export function rgbToXyz(RGB, validated = false) {
	if (!validated && !isValidRgb(RGB)) return null;

	const Rlin = SRGB_EOTF_LUT[RGB.R];
	const Glin = SRGB_EOTF_LUT[RGB.G];
	const Blin = SRGB_EOTF_LUT[RGB.B];

	return {
		X: Rlin * M_XR + Glin * M_XG + Blin * M_XB,
		Y: Rlin * M_YR + Glin * M_YG + Blin * M_YB,
		Z: Rlin * M_ZR + Glin * M_ZG + Blin * M_ZB,
	};
}

export function rgbToLab(RGB, validated = false) {
	if (!validated && !isValidRgb(RGB)) return null;
	return xyzToLab(rgbToXyz(RGB, true), true);
}

export default {
	isValid: isValidRgb,
	toHex: rgbToHex,
	toHsl: rgbToHsl,
	toXyz: rgbToXyz,
	toLab: rgbToLab,
};
