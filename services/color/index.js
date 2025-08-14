import colors from '../../data/color_names.json' with { type: 'json' };
import * as constants from './constants.js';
import CIEDE2000 from './ciede2000.js';
import vpTree from './vp_tree.js';
import models from './models/index.js';
import logger from '../logger.js';

/** @typedef {string} Hex A lowercase 6-digit hex string */

/**
 * @typedef {Object} RGB
 * @property {number} R Red component
 * @property {number} G Green component
 * @property {number} B Blue component
 */

/**
 * @typedef {Object} HSL
 * @property {number} H Hue component (in degrees)
 * @property {number} S Saturation component
 * @property {number} L Lightness component
 */

/**
 * @typedef {Object} XYZ
 * @property {number} X X tristimulus value
 * @property {number} Y Y tristimulus value
 * @property {number} Z Z tristimulus value
 */

/**
 * @typedef {Object} Lab
 * @property {number} L Lightness
 * @property {number} a Green-Red coordinate
 * @property {number} b Blue-Yellow coordinate
 */

/**
 * @typedef {Object} NearestColor
 * @property {number} L Lightness
 * @property {number} a Green-Red coordinate
 * @property {number} b Blue-Yellow coordinate
 * @property {string} name Name of the nearest color
 * @property {number} distance ΔE₀₀ to the nearest named color
 */

const N = colors.length;
const bufLen = Math.max(0, N - 1);

let IndexArray;
if (N <= 0xff) IndexArray = Uint8Array;
else if (N <= 0xffff) IndexArray = Uint16Array;
else IndexArray = Uint32Array;

const labData = new Float64Array(N * 3);
const names = new Array(N);
const indices = new IndexArray(N);
const hexToIndex = new Map();

for (let i = 0; i < N; indices[i] = i++) {
	const c = colors[i];
	const { L, a, b } = models.rgb.toLab(
		models.hex.toRgb(c.hex, true, true),
		true
	);
	const offset = i * 3;
	labData[offset] = L;
	labData[offset + 1] = a;
	labData[offset + 2] = b;
	names[i] = c.name;
	hexToIndex.set(c.hex, i);
}

const t0 = performance.now();
const tree = vpTree.build(
	labData,
	indices,
	0,
	N,
	new IndexArray(bufLen),
	new Float64Array(bufLen)
);
const t1 = performance.now();
logger.debug(
	`[COLOR] built VP tree in ${(t1 - t0).toFixed(3)}ms`,
	`(${indices.length} indices)`
);

/**
 * @param {Hex | RGB | HSL | XYZ | Lab} colorInput
 * @returns {{
 *   hex: Hex,
 *   shorthandHex: string | null,
 *   RGB: RGB,
 *   HSL: HSL,
 *   XYZ: XYZ,
 *   Lab: Lab,
 *   nearest: NearestColor
 * } | null}
 */
function getColor(colorInput) {
	let color = null;

	if (models.hex.isValid(colorInput)) {
		color = { hex: models.hex.normalize(colorInput, true) };
		color.RGB = models.hex.toRgb(color.hex, true, true);
	} else if (models.rgb.isValid(colorInput)) {
		color = { RGB: colorInput };
		color.hex = models.rgb.toHex(color.RGB, true);
	} else if (models.hsl.isValid(colorInput)) {
		color = { HSL: colorInput };
		color.RGB = models.hsl.toRgb(color.HSL, true);
		color.hex = models.rgb.toHex(color.RGB, true);
	} else if (models.xyz.isValid(colorInput)) {
		color = { XYZ: colorInput };
		color.RGB = models.xyz.toRgb(color.XYZ, true);
		color.hex = models.rgb.toHex(color.RGB, true);
	} else if (models.lab.isValid(colorInput)) {
		color = { Lab: colorInput };
		color.RGB = models.lab.toRgb(color.Lab, true);
		color.hex = models.rgb.toHex(color.RGB, true);
	} else return color /* null */;

	color.shorthandHex = models.hex.toShorthand(color.hex, true, true);
	if (!color.HSL) color.HSL = models.rgb.toHsl(color.RGB, true);
	if (!color.XYZ) color.XYZ = models.rgb.toXyz(color.RGB, true);
	if (!color.Lab) color.Lab = models.xyz.toLab(color.XYZ, true);

	const index = hexToIndex.get(color.hex);
	if (index !== undefined) {
		const offset = index * 3;
		color.nearest = {
			L: labData[offset],
			a: labData[offset + 1],
			b: labData[offset + 2],
			name: names[index],
			distance: 0,
		};
	} else {
		const { index: nearestIndex, distance } = vpTree.nearest(
			tree,
			labData,
			color.Lab
		);
		const offset = nearestIndex * 3;
		color.nearest = {
			L: labData[offset],
			a: labData[offset + 1],
			b: labData[offset + 2],
			name: names[nearestIndex],
			distance,
		};
	}

	return color;
}

export default {
	...constants,
	...models,

	/**
	 * @param {Lab} Lab1
	 * @param {Lab} Lab2
	 * @returns {number|null}
	 */
	CIEDE2000: (Lab1, Lab2) =>
		// the internal implementation skips input validation for performance
		models.lab.isValid(Lab1) && models.lab.isValid(Lab2)
			? CIEDE2000(Lab1.L, Lab1.a, Lab1.b, Lab2.L, Lab2.a, Lab2.b)
			: null,
	get: getColor,
};
