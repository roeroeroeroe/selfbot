// prettier-ignore
import {
	SRGB_OETF_THRESHOLD,
	SRGB_OETF_A,
	SRGB_OETF_B,
	SRGB_OETF_EXPONENT,
	INV_M_XR, INV_M_XG, INV_M_XB,
	INV_M_YR, INV_M_YG, INV_M_YB,
	INV_M_ZR, INV_M_ZG, INV_M_ZB,
	Xn_D65, Yn_D65, Zn_D65,
	LAB_EPSILON,
	LAB_KAPPA
} from '../constants.js';
import { rgbToHex, rgbToHsl } from './rgb.js';
// prettier-ignore
export function isValidXyz(XYZ) {
	if (typeof XYZ !== 'object' || XYZ === null) return false;
	const { X, Y, Z } = XYZ;
	return (
		X === +X && Y === +Y && Z === +Z &&
		X >= 0 && X <= Xn_D65 &&
		Y >= 0 && Y <= Yn_D65 &&
		Z >= 0 && Z <= Zn_D65
	);
}

export function xyzToHex(XYZ, validated = false) {
	if (!validated && !isValidXyz(XYZ)) return null;
	return rgbToHex(xyzToRgb(XYZ, true), true);
}

export function oetfSRGB(L) {
	if (L <= 0) return 0;
	if (L < SRGB_OETF_THRESHOLD) return 12.92 * L;
	return SRGB_OETF_A * L ** SRGB_OETF_EXPONENT - SRGB_OETF_B;
}

export function xyzToRgb(XYZ, validated = false) {
	if (!validated && !isValidXyz(XYZ)) return null;

	const { X, Y, Z } = XYZ;
	const R = oetfSRGB(INV_M_XR * X + INV_M_XG * Y + INV_M_XB * Z);
	const G = oetfSRGB(INV_M_YR * X + INV_M_YG * Y + INV_M_YB * Z);
	const B = oetfSRGB(INV_M_ZR * X + INV_M_ZG * Y + INV_M_ZB * Z);

	return {
		R: Math.min(255, Math.max(0, Math.round(R * 255))),
		G: Math.min(255, Math.max(0, Math.round(G * 255))),
		B: Math.min(255, Math.max(0, Math.round(B * 255))),
	};
}

export function xyzToHsl(XYZ, validated = false) {
	if (!validated && !isValidXyz(XYZ)) return null;
	return rgbToHsl(xyzToRgb(XYZ, true), true);
}

export function xyzToLab(XYZ, validated = false) {
	if (!validated && !isValidXyz(XYZ)) return null;
	const { X, Y, Z } = XYZ;

	const xBar = X / Xn_D65;
	const yBar = Y / Yn_D65;
	const zBar = Z / Zn_D65;

	const fx =
		xBar > LAB_EPSILON ? Math.cbrt(xBar) : (LAB_KAPPA * xBar + 16) / 116;
	const fy =
		yBar > LAB_EPSILON ? Math.cbrt(yBar) : (LAB_KAPPA * yBar + 16) / 116;
	const fz =
		zBar > LAB_EPSILON ? Math.cbrt(zBar) : (LAB_KAPPA * zBar + 16) / 116;

	return {
		L: 116 * fy - 16,
		a: 500 * (fx - fy),
		b: 200 * (fy - fz),
	};
}

export default {
	isValid: isValidXyz,
	toHex: xyzToHex,
	toRgb: xyzToRgb,
	toHsl: xyzToHsl,
	toLab: xyzToLab,
};
