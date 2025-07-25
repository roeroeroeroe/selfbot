// prettier-ignore
import {
	Xn_D65, Yn_D65, Zn_D65,
	LAB_EPSILON,
	LAB_KAPPA
} from '../constants.js';
import { xyzToHex, xyzToRgb, xyzToHsl } from './xyz.js';
// prettier-ignore
export function isValidLab(Lab) {
	if (typeof Lab !== 'object' || Lab === null) return false;
	const { L, a, b } = Lab;
	return (
		L === +L && a === +a && b === +b &&
		L >= 0 && L <= 100.00001 /* tolerance */
	);
}

export function labToHex(Lab, validated = false) {
	if (!validated && !isValidLab(Lab)) return null;
	return xyzToHex(labToXyz(Lab, true), true);
}

export function labToRgb(Lab, validated = false) {
	if (!validated && !isValidLab(Lab)) return null;
	return xyzToRgb(labToXyz(Lab, true), true);
}

export function labToHsl(Lab, validated = false) {
	if (!validated && !isValidLab(Lab)) return null;
	return xyzToHsl(labToXyz(Lab, true), true);
}

export function labToXyz(Lab, validated = false) {
	if (!validated && !isValidLab(Lab)) return null;
	const { L, a, b } = Lab;

	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;

	const fx3 = fx ** 3;
	const fz3 = fz ** 3;
	const fy3 = fy ** 3;

	const xr = fx3 > LAB_EPSILON ? fx3 : (116 * fx - 16) / LAB_KAPPA;
	const yr = L > LAB_KAPPA * LAB_EPSILON ? fy3 : L / LAB_KAPPA;
	const zr = fz3 > LAB_EPSILON ? fz3 : (116 * fz - 16) / LAB_KAPPA;

	return {
		X: xr * Xn_D65,
		Y: yr * Yn_D65,
		Z: zr * Zn_D65,
	};
}

export default {
	isValid: isValidLab,
	toHex: labToHex,
	toRgb: labToRgb,
	toHsl: labToHsl,
	toXyz: labToXyz,
};
