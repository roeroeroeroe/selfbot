import colors from '../data/color_names.json' with { type: 'json' };
import logger from '../services/logger.js';

const HASH_CHARCODE = 35;
const INVALID_HEX = 0xff;
const BASE16_CHARSET = '0123456789abcdef';

const ASCII_TO_HEX = new Uint8Array(128).fill(INVALID_HEX);
for (let i = 48; i <= 57; i++) ASCII_TO_HEX[i] = i - 48;
for (let i = 65; i <= 70; i++) ASCII_TO_HEX[i] = i - 55;
for (let i = 97; i <= 102; i++) ASCII_TO_HEX[i] = i - 87;

const BYTE_TO_HEX_STRING = new Array(256);
for (let i = 0; i < 256; i++)
	BYTE_TO_HEX_STRING[i] = BASE16_CHARSET[i >> 4] + BASE16_CHARSET[i & 0xf];

const SRGB_THRESHOLD = 0.04045;
const SRGB_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_GAMMA = 1.055;
const SRGB_EXPONENT = 2.4;
// prettier-ignore
// illuminant=D65, observer=2 deg
const R_TO_X_COEFF = 0.4124564, G_TO_X_COEFF = 0.3575761, B_TO_X_COEFF = 0.1804375,
      R_TO_Y_COEFF = 0.2126729, G_TO_Y_COEFF = 0.7151522, B_TO_Y_COEFF = 0.072175,
      R_TO_Z_COEFF = 0.0193339, G_TO_Z_COEFF = 0.119192,  B_TO_Z_COEFF = 0.9503041;
const D65_Xn = 0.95047;
const D65_Yn = 1.0;
const D65_Zn = 1.08883;
const POWER_25_TO_7 = 25 ** 7;
const LAB_EPSILON = 0.008856;
const LAB_KAPPA = 903.3;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const points = new Array(colors.length);
const pointIndices = new Uint32Array(colors.length);
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
const vpTreeRoot = (function buildVpTree(indices) {
	if (!indices.length) return null;
	const pivot = indices[0];
	if (indices.length === 1)
		return { index: pivot, radius: 0, inner: null, outer: null };

	const otherCount = indices.length - 1;
	const remaining = new Array(otherCount);
	const distances = new Array(otherCount);

	const center = points[pivot];
	for (let i = 1; i < indices.length; i++) {
		const index = indices[i];
		remaining[i - 1] = index;
		distances[i - 1] = deltaE00(center, points[index]);
	}

	const mid = otherCount >>> 1;
	quickSelect(distances, remaining, 0, otherCount - 1, mid);
	const radius = distances[mid];

	let closerCount = 0;
	for (let i = 0; i < otherCount; i++)
		if (distances[i] <= radius) closerCount++;

	const closer = new Array(closerCount);
	const farther = new Array(otherCount - closerCount);
	for (let i = 0, ci = 0, fi = 0; i < otherCount; i++)
		if (distances[i] <= radius) closer[ci++] = remaining[i];
		else farther[fi++] = remaining[i];

	return {
		index: pivot,
		radius: radius,
		inner: buildVpTree(closer),
		outer: buildVpTree(farther),
	};
})(pointIndices);
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

	let nearer = null,
		farther = null;
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

function srgbToLinear(channel) {
	return channel <= SRGB_THRESHOLD
		? channel / SRGB_SLOPE
		: ((channel + SRGB_OFFSET) / SRGB_GAMMA) ** SRGB_EXPONENT;
}

function huePrime(ap, b) {
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

	const h1p = huePrime(a1p, b1);
	const h2p = huePrime(a2p, b2);

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

	const deltaL_SL = deltaLp / SL; // kL=1
	const deltaC_SC = deltaCp / SC; // kC=1
	const deltaH_SH = deltaHp / SH; // kH=1

	return Math.sqrt(
		deltaL_SL ** 2 +
			deltaC_SC ** 2 +
			deltaH_SH ** 2 +
			RT * deltaC_SC * deltaH_SH
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

function hexToName(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	const index = hexToPointIndex.get(hex);
	if (index !== undefined) return points[index].name;
	const lab = rgbToLab(hexToRgb(hex, true, true), true);
	return points[vpNearest(vpTreeRoot, lab).index].name;
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
		: points[vpNearest(vpTreeRoot, rgbToLab(rgb, true)).index].name;
}

function rgbToHex(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	return (
		BYTE_TO_HEX_STRING[rgb.r] +
		BYTE_TO_HEX_STRING[rgb.g] +
		BYTE_TO_HEX_STRING[rgb.b]
	);
}

function rgbToLab(rgb, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	const R = srgbToLinear(rgb.r / 255);
	const G = srgbToLinear(rgb.g / 255);
	const B = srgbToLinear(rgb.b / 255);

	const X = R * R_TO_X_COEFF + G * G_TO_X_COEFF + B * B_TO_X_COEFF;
	const Y = R * R_TO_Y_COEFF + G * G_TO_Y_COEFF + B * B_TO_Y_COEFF;
	const Z = R * R_TO_Z_COEFF + G * G_TO_Z_COEFF + B * B_TO_Z_COEFF;

	const xBar = X / D65_Xn;
	const yBar = Y / D65_Yn;
	const zBar = Z / D65_Zn;

	const fx =
		xBar > LAB_EPSILON ? Math.cbrt(xBar) : (LAB_KAPPA * xBar + 16) / 116;
	const fy =
		yBar > LAB_EPSILON ? Math.cbrt(yBar) : (LAB_KAPPA * yBar + 16) / 116;
	const fz =
		zBar > LAB_EPSILON ? Math.cbrt(zBar) : (LAB_KAPPA * zBar + 16) / 116;

	return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function getColor(hexOrRgb) {
	if (isValidHex(hexOrRgb)) {
		const color = { hex: normalizeHex(hexOrRgb) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexToRgb(color.hex, true, true);
		color.lab = rgbToLab(color.rgb, true);
		const index = hexToPointIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: points[vpNearest(vpTreeRoot, color.lab).index].name;
		return color;
	}
	if (isValidRgb(hexOrRgb)) {
		const color = { hex: rgbToHex(hexOrRgb, true) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexOrRgb;
		color.lab = rgbToLab(hexOrRgb, true);
		const index = hexToPointIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: points[vpNearest(vpTreeRoot, color.lab).index].name;
		return color;
	}

	return null;
}

export default {
	isValidHex,
	isValidRgb,
	hexToName,
	hexToRgb,
	hexToLab,
	hexToShorthand,
	rgbToName,
	rgbToHex,
	rgbToLab,
	get: getColor,
};
