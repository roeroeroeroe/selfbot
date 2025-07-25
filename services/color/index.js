import colors from '../../data/color_names.json' with { type: 'json' };
import * as constants from './constants.js';
import vpTree from './vp_tree.js';
import deltaE00 from './deltaE00.js';
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

const points = new Array(colors.length);
const pointIndices = new Uint16Array(colors.length);
const hexToPointIndex = new Map();

for (let i = 0; i < colors.length; pointIndices[i] = i++) {
	const c = colors[i];
	const { L, a, b } = models.rgb.toLab(
		models.hex.toRgb(c.hex, true, true),
		true
	);
	points[i] = { L, a, b, name: c.name };
	hexToPointIndex.set(c.hex, i);
}

const t0 = performance.now();
const tree = vpTree.build(
	points,
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
	if (!color.RGB) color.RGB = models.hex.toRgb(color.hex, true, true);
	if (!color.HSL) color.HSL = models.rgb.toHsl(color.RGB, true);
	if (!color.XYZ) color.XYZ = models.rgb.toXyz(color.RGB, true);
	if (!color.Lab) color.Lab = models.xyz.toLab(color.XYZ, true);

	const index = hexToPointIndex.get(color.hex);
	if (index !== undefined) color.nearest = { ...points[index], distance: 0 };
	else {
		const { index: nearestIndex, distance } = vpTree.nearest(
			tree,
			points,
			color.Lab
		);
		color.nearest = { ...points[nearestIndex], distance };
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
	deltaE00: (Lab1, Lab2) =>
		// the internal implementation skips input validation for performance
		models.lab.isValid(Lab1) && models.lab.isValid(Lab2)
			? deltaE00(Lab1, Lab2)
			: null,
	get: getColor,
};
