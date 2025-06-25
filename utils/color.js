import colors from '../data/color_names.json' with { type: 'json' };
import logger from '../services/logger.js';

const HASH_CHARCODE = 35;
const INVALID_HEX = 0xff;
const BASE16_CHARSET = '0123456789abcdef';

const ASCII_TO_HEX = new Uint8Array(128).fill(INVALID_HEX);
for (let i = 48; i < 58; i++) ASCII_TO_HEX[i] = i - 48;
for (let i = 65; i < 71; i++) ASCII_TO_HEX[i] = i - 55;
for (let i = 97; i < 103; i++) ASCII_TO_HEX[i] = i - 87;

const BYTE_TO_HEX_STRING = new Array(256);
for (let i = 0; i < 256; i++)
	BYTE_TO_HEX_STRING[i] = BASE16_CHARSET[i >> 4] + BASE16_CHARSET[i & 0xf];

const SRGB_BYTE_TO_LINEAR = new Float64Array(256);
// sRGB <= 0.04045 (~10.3 in 8-bit)
for (let i = 0; i < 11; i++) SRGB_BYTE_TO_LINEAR[i] = i / 255 / 12.92;
for (let i = 11; i < 256; i++)
	SRGB_BYTE_TO_LINEAR[i] = ((i / 255 + 0.055) / 1.055) ** 2.4;

// prettier-ignore
// illuminant=D65, observer=2 deg
const M_XR = 0.4124564, M_XG = 0.3575761, M_XB = 0.1804375,
      M_YR = 0.2126729, M_YG = 0.7151522, M_YB = 0.072175,
      M_ZR = 0.0193339, M_ZG = 0.119192,  M_ZB = 0.9503041;
const Xn_D65 = 0.95047;
const Yn_D65 = 1.0;
const Zn_D65 = 1.08883;
const K_L = 1.0;
const K_C = 1.0;
const K_H = 1.0;
const POWER_25_TO_7 = 25 ** 7;
const LAB_EPSILON = 0.008856;
const LAB_KAPPA = 903.3;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const points = new Array(colors.length);
const pointIndices = new Uint16Array(colors.length);
const hexToPointIndex = new Map();

for (let i = 0; i < colors.length; pointIndices[i] = i++) {
	const c = colors[i];
	const lab = rgbToLab(hexToRgb(c.hex, true, true), true);
	points[i] = { L: lab.L, a: lab.a, b: lab.b, name: c.name };
	hexToPointIndex.set(c.hex, i);
}

function partition(distances, indices, left, right, pivotIndex) {
	const pivotDistance = distances[pivotIndex];
	let tempD = distances[pivotIndex];
	distances[pivotIndex] = distances[right];
	distances[right] = tempD;
	let tempI = indices[pivotIndex];
	indices[pivotIndex] = indices[right];
	indices[right] = tempI;
	let write = left;
	for (let i = left; i < right; i++)
		if (distances[i] < pivotDistance) {
			tempD = distances[i];
			distances[i] = distances[write];
			distances[write] = tempD;
			tempI = indices[i];
			indices[i] = indices[write];
			indices[write++] = tempI;
		}
	tempD = distances[write];
	distances[write] = distances[right];
	distances[right] = tempD;
	tempI = indices[write];
	indices[write] = indices[right];
	indices[right] = tempI;
	return write;
}

function quickSelect(distances, indices, left, right, k) {
	for (;;) {
		if (left === right) return;
		const mid = left + ((right - left) >>> 1);
		let pivotIndex = mid;
		if (distances[left] > distances[mid]) {
			if (distances[mid] > distances[right]) pivotIndex = mid;
			else if (distances[left] > distances[right]) pivotIndex = right;
			else pivotIndex = left;
		} else {
			if (distances[left] > distances[right]) pivotIndex = left;
			else if (distances[mid] > distances[right]) pivotIndex = right;
			else pivotIndex = mid;
		}
		const pivotPos = partition(distances, indices, left, right, pivotIndex);
		if (k === pivotPos) return;
		else if (k < pivotPos) right = pivotPos - 1;
		else left = pivotPos + 1;
	}
}

const t0 = performance.now();
const vpTree = (function buildVpTree(indices, start, end, iBuf, dBuf) {
	if (start >= end) return null;
	const pivotIndex = indices[start];
	const count = end - start;
	if (count === 1)
		return { index: pivotIndex, radius: 0, inner: null, outer: null };

	const center = points[pivotIndex];
	for (let si = start + 1, bi = 0; si < end; si++, bi++) {
		const index = indices[si];
		iBuf[bi] = index;
		dBuf[bi] = deltaE00(center, points[index]);
	}

	const mid = (count - 1) >>> 1;
	quickSelect(dBuf, iBuf, 0, count - 2, mid);
	const radius = dBuf[mid];

	let iPtr = start + 1,
		oPtr = end - 1;
	for (let i = 0; i < count - 1; i++)
		if (dBuf[i] <= radius) indices[iPtr++] = iBuf[i];
		else indices[oPtr--] = iBuf[i];

	return {
		index: pivotIndex,
		radius,
		inner: buildVpTree(indices, start + 1, iPtr, iBuf, dBuf),
		outer: buildVpTree(indices, iPtr, end, iBuf, dBuf),
	};
})(
	pointIndices,
	0,
	colors.length,
	new Uint16Array(colors.length),
	new Float64Array(colors.length)
);
const t1 = performance.now();
logger.debug(
	`[COLOR] built VP tree in ${(t1 - t0).toFixed(3)}ms`,
	`(${pointIndices.length} indices)`
);

function vpNearest(node, target, best = { distance: Infinity, index: -1 }) {
	if (node === null) return best;

	const dVp = deltaE00(target, points[node.index]);
	if (dVp < best.distance) {
		best.distance = dVp;
		best.index = node.index;
	}

	let nearer, farther;
	if (dVp <= node.radius) {
		nearer = node.inner;
		farther = node.outer;
	} else {
		nearer = node.outer;
		farther = node.inner;
	}

	best = vpNearest(nearer, target, best);
	if (Math.abs(dVp - node.radius) <= best.distance)
		best = vpNearest(farther, target, best);

	return best;
}

function hPrime(ap, b) {
	if (!ap && !b) return 0;
	let h = Math.atan2(b, ap) * RAD_TO_DEG;
	if (h < 0) h += 360;
	return h;
}

function deltaE00(Lab1, Lab2) {
	const { L: L1, a: a1, b: b1 } = Lab1;
	const { L: L2, a: a2, b: b2 } = Lab2;

	const C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
	const C2 = Math.sqrt(a2 ** 2 + b2 ** 2);
	const Cbar7 = ((C1 + C2) / 2) ** 7;

	const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POWER_25_TO_7)));

	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.sqrt(a1p ** 2 + b1 ** 2);
	const C2p = Math.sqrt(a2p ** 2 + b2 ** 2);

	const h1p = hPrime(a1p, b1);
	const h2p = hPrime(a2p, b2);

	const deltaLp = L2 - L1;
	const deltaCp = C2p - C1p;

	let deltaHp;
	if (!C1p || !C2p) deltaHp = 0;
	else {
		let dh = h2p - h1p;
		if (Math.abs(dh) > 180) {
			if (dh > 180) dh -= 360;
			else dh += 360;
		}
		deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * DEG_TO_RAD) / 2);
	}
	const Lbarp = (L1 + L2) / 2;
	const Cbarp = (C1p + C2p) / 2;

	let hbarp;
	if (!C1p || !C2p) hbarp = h1p + h2p;
	else {
		let sumH = h1p + h2p;
		if (Math.abs(h1p - h2p) > 180) {
			if (sumH < 360) sumH += 360;
			else sumH -= 360;
		}
		hbarp = sumH / 2;
	}

	const T =
		1 -
		0.17 * Math.cos((hbarp - 30) * DEG_TO_RAD) +
		0.24 * Math.cos(2 * hbarp * DEG_TO_RAD) +
		0.32 * Math.cos((3 * hbarp + 6) * DEG_TO_RAD) -
		0.2 * Math.cos((4 * hbarp - 63) * DEG_TO_RAD);

	const deltaTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
	const Cbarp7 = Cbarp ** 7;
	const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POWER_25_TO_7));
	const RT = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * RC;

	const SL =
		1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
	const SC = 1 + 0.045 * Cbarp;
	const SH = 1 + 0.015 * Cbarp * T;

	const deltaLp_SL = deltaLp / (K_L * SL);
	const deltaCp_SC = deltaCp / (K_C * SC);
	const deltaHp_SH = deltaHp / (K_H * SH);

	return Math.sqrt(
		deltaLp_SL ** 2 +
			deltaCp_SC ** 2 +
			deltaHp_SH ** 2 +
			RT * deltaCp_SC * deltaHp_SH
	);
}

function normalizeHex(hex) {
	hex = (
		hex.charCodeAt(0) === HASH_CHARCODE ? hex.slice(1) : hex
	).toLowerCase();
	return hex.length === 6
		? hex
		: hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
}

function isValidHex(hex) {
	if (typeof hex !== 'string') return false;
	let i = hex.charCodeAt(0) === HASH_CHARCODE ? 1 : 0;
	const len = hex.length - i;
	if (len !== 3 && len !== 6) return false;
	for (let cc; i < hex.length; i++)
		if ((cc = hex.charCodeAt(i)) >= 128 || ASCII_TO_HEX[cc] === INVALID_HEX)
			return false;
	return true;
}
// prettier-ignore
function isValidRgb(rgb) {
	if (typeof rgb !== 'object' || rgb === null) return false;
	const { r, g, b } = rgb;
	return (
		r === (r | 0) && g === (g | 0) && b === (b | 0) &&
		r >= 0 && r <= 255 &&
		g >= 0 && g <= 255 &&
		b >= 0 && b <= 255
	);
}
// prettier-ignore
function isValidXyz(XYZ) {
	if (typeof XYZ !== 'object' || XYZ === null) return false;
	const { X, Y, Z } = XYZ;
	return (
		X === +X && Y === +Y && Z === +Z &&
		X >= 0 && X <= Xn_D65 &&
		Y >= 0 && Y <= Yn_D65 &&
		Z >= 0 && Z <= Zn_D65
	);
}

function hexToName(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	const index = hexToPointIndex.get(hex);
	if (index !== undefined) return points[index].name;
	const Lab = rgbToLab(hexToRgb(hex, true, true), true);
	return points[vpNearest(vpTree, Lab).index].name;
}

function hexToRgb(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return {
		r: (ASCII_TO_HEX[hex.charCodeAt(0)] << 4) | ASCII_TO_HEX[hex.charCodeAt(1)],
		g: (ASCII_TO_HEX[hex.charCodeAt(2)] << 4) | ASCII_TO_HEX[hex.charCodeAt(3)],
		b: (ASCII_TO_HEX[hex.charCodeAt(4)] << 4) | ASCII_TO_HEX[hex.charCodeAt(5)],
	};
}

function hexToXyz(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return rgbToXyz(hexToRgb(hex, true, true), true);
}

function hexToLab(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return rgbToLab(hexToRgb(hex, true, true), true);
}

function hexToShorthand(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]
		? hex[0] + hex[2] + hex[4]
		: null;
}

function rgbToName(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	const index = hexToPointIndex.get(rgbToHex(rgb, true));
	return index !== undefined
		? points[index].name
		: points[vpNearest(vpTree, rgbToLab(rgb, true)).index].name;
}

function rgbToHex(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	return (
		BYTE_TO_HEX_STRING[rgb.r] +
		BYTE_TO_HEX_STRING[rgb.g] +
		BYTE_TO_HEX_STRING[rgb.b]
	);
}

function rgbToXyz(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	const R = SRGB_BYTE_TO_LINEAR[rgb.r];
	const G = SRGB_BYTE_TO_LINEAR[rgb.g];
	const B = SRGB_BYTE_TO_LINEAR[rgb.b];

	return {
		X: R * M_XR + G * M_XG + B * M_XB,
		Y: R * M_YR + G * M_YG + B * M_YB,
		Z: R * M_ZR + G * M_ZG + B * M_ZB,
	};
}

function rgbToLab(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	return xyzToLab(rgbToXyz(rgb, true), true);
}

function xyzToLab(XYZ, validated = false) {
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

/**
 * @param {string | { r: number, g: number, b: number }} hexOrRgb
 * @returns {{
 *   hex: string,
 *   shorthandHex: string | null,
 *   rgb: { r: number, g: number, b: number },
 *   XYZ: { X: number, Y: number, Z: number },
 *   Lab: { L: number, a: number, b: number },
 *   name: string
 * } | null}
 */
function getColor(hexOrRgb) {
	if (isValidHex(hexOrRgb)) {
		const color = { hex: normalizeHex(hexOrRgb) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexToRgb(color.hex, true, true);
		color.XYZ = rgbToXyz(color.rgb, true);
		color.Lab = xyzToLab(color.XYZ, true);
		const index = hexToPointIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: points[vpNearest(vpTree, color.Lab).index].name;
		return color;
	}
	if (isValidRgb(hexOrRgb)) {
		const color = { hex: rgbToHex(hexOrRgb, true) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexOrRgb;
		color.XYZ = rgbToXyz(hexOrRgb, true);
		color.Lab = xyzToLab(color.XYZ, true);
		const index = hexToPointIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: points[vpNearest(vpTree, color.Lab).index].name;
		return color;
	}

	return null;
}

export default {
	isValidHex,
	isValidRgb,
	hexToName,
	hexToRgb,
	hexToXyz,
	hexToLab,
	hexToShorthand,
	rgbToName,
	rgbToHex,
	rgbToXyz,
	rgbToLab,
	xyzToLab,
	get: getColor,
};
