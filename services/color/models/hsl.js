import { rgbToHex, rgbToXyz, rgbToLab } from './rgb.js';
// prettier-ignore
export function isValidHsl(HSL) {
	if (typeof HSL !== 'object' || HSL === null) return false;
	const { H, S, L } = HSL;
	return (
		H === +H && S === +S && L === +L &&
		H >= 0 && H < 360 &&
		S >= 0 && S <= 1 &&
		L >= 0 && L <= 1
	);
}

export function hslToHex(HSL, validated = false) {
	if (!validated && !isValidHsl(HSL)) return null;
	return rgbToHex(hslToRgb(HSL, true), true);
}
// prettier-ignore
export function hslToRgb(HSL, validated = false) {
	if (!validated && !isValidHsl(HSL)) return null;
	const { H, S, L } = HSL;

	const C = (1 - Math.abs(2 * L - 1)) * S;

	const Hp = H / 60;
	const X = C * (1 - Math.abs((Hp % 2) - 1));

	let R1 = 0, G1 = 0, B1 = 0;
	if (Hp < 1) { R1 = C; G1 = X; }
	else if (Hp < 2) { R1 = X; G1 = C; }
	else if (Hp < 3) { G1 = C; B1 = X; }
	else if (Hp < 4) { G1 = X; B1 = C; }
	else if (Hp < 5) { R1 = X; B1 = C; }
	else /* Hp < 6 */ { R1 = C; B1 = X; }

	const m = L - C / 2;

	return {
		R: Math.round((R1 + m) * 255),
		G: Math.round((G1 + m) * 255),
		B: Math.round((B1 + m) * 255),
	};
}

export function hslToXyz(HSL, validated = false) {
	if (!validated && !isValidHsl(HSL)) return null;
	return rgbToXyz(hslToRgb(HSL, true), true);
}

export function hslToLab(HSL, validated = false) {
	if (!validated && !isValidHsl(HSL)) return null;
	return rgbToLab(hslToRgb(HSL, true), true);
}

export default {
	isValid: isValidHsl,
	toHex: hslToHex,
	toRgb: hslToRgb,
	toXyz: hslToXyz,
	toLab: hslToLab,
};
