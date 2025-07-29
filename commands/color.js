import StringMatcher from '../services/string_matcher.js';
import colors from '../data/color_names.json' with { type: 'json' };
import logger from '../services/logger.js';
import utils from '../utils/index.js';
import color from '../services/color/index.js';

const XYZ_PRECISION = 4;
const LAB_PRECISION = 2;
const DELTA_E00_PRECISION = 2;

const DELTA_E00_THRESHOLDS = [
	[1.0, 'not perceptible by the human eye'],
	[2.0, 'perceptible through close observation'],
	[10.0, 'perceptible at a glance'],
	[49.0, 'noticeably different but still visually related'],
	[Infinity, 'opposite/complementary colors'],
];

const nameToHex = new Map();
for (let i = 0; i < colors.length; i++) {
	const c = colors[i];
	nameToHex.set(c.name.toLowerCase(), c.hex);
}

const colorNameMatcher = new StringMatcher([...nameToHex.keys()]);

const colorModels = {
	name: {
		label: 'name',
		description: 'color name, e.g., "red"',
		parse: args => nameToHex.get(args.join(' ').toLowerCase()),
		validate: nameInput => !!nameInput,
		format: formatName,
	},
	hex: {
		label: 'hex',
		description: '"#ff0000", "ff0000" or "f00"',
		parse: args => args[0],
		validate: color.hex.isValid,
		format: formatHex,
	},
	rgb: {
		label: 'RGB',
		description: 'R, G, B each in [0, 255]',
		parse: args =>
			args.length < 3 ? null : { R: +args[0], G: +args[1], B: +args[2] },
		validate: color.rgb.isValid,
		format: formatRgb,
	},
	hsl: {
		label: 'HSL',
		description: 'Hue in [0, 360), Saturation, Lightness in [0, 1]',
		parse: args =>
			args.length < 3 ? null : { H: +args[0], S: +args[1], L: +args[2] },
		validate: color.hsl.isValid,
		format: formatHsl,
	},
	xyz: {
		label: 'XYZ',
		description:
			'X, Y, Z each range from 0 to their respective reference white values: ' +
			`${color.Xn_D65}, ${color.Yn_D65}, ${color.Zn_D65}`,
		parse: args =>
			args.length < 3 ? null : { X: +args[0], Y: +args[1], Z: +args[2] },
		validate: color.xyz.isValid,
		format: formatXyz,
	},
	lab: {
		label: 'Lab',
		description: 'L in [0, 100], a, b are real numbers',
		parse: args =>
			args.length < 3 ? null : { L: +args[0], a: +args[1], b: +args[2] },
		validate: color.lab.isValid,
		format: formatLab,
	},
};

const validColorModels = Object.keys(colorModels);
const validOutputColorModels = ['all', ...validColorModels];

export default {
	name: 'color',
	aliases: ['colour'],
	description: 'convert/name/compare colors',
	unsafe: false,
	lock: 'NONE',
	exclusiveFlagGroups: [
		['fromModel', 'distanceBetween'],
		['toModel', 'distanceBetween'],
	],
	flags: [
		{
			name: 'fromModel',
			short: 'f',
			long: 'from',
			type: 'string',
			defaultValue: 'hex',
			required: false,
			description:
				'input color model ' +
				`(default: hex, options: ${validColorModels.join(', ')})`,
			validator: v => validColorModels.includes(v.toLowerCase()),
		},
		{
			name: 'toModel',
			short: 't',
			long: 'to',
			type: 'string',
			defaultValue: 'all',
			required: false,
			description:
				'output color model ' +
				`(default: all, options: ${validOutputColorModels.join(', ')})`,
			validator: v => validOutputColorModels.includes(v.toLowerCase()),
		},
		{
			name: 'distanceBetween',
			short: 'd',
			long: 'distance',
			type: 'string',
			list: {
				unique: true,
				errorOnDuplicates: true,
				minItems: 2,
				maxItems: 2,
				itemValidator: color.hex.isValid,
			},
			defaultValue: null,
			required: false,
			description: 'get ΔE₀₀ between two hex colors (e.g., "f00 0f0")',
		},
	],
	// TODO change chatColor?
	execute: msg => {
		if (msg.commandFlags.distanceBetween.length) {
			const [hex1, hex2] = msg.commandFlags.distanceBetween;
			const [Lab1, Lab2] = [
				color.hex.toLab(hex1, true),
				color.hex.toLab(hex2, true),
			];
			const distance = color.deltaE00(Lab1, Lab2);
			if (distance === null) {
				logger.warning('hexToLab failed for valid hex:', !Lab1 ? hex1 : hex2);
				return { text: 'Lab convertion failed', mention: true };
			}
			return { text: formatDistance(distance), mention: true };
		}

		let { fromModel, toModel } = msg.commandFlags;
		toModel = toModel.toLowerCase();
		const formatColorData =
			toModel === 'all' ? formatAll : colorModels[toModel].format;

		if (!msg.args.length) {
			const colorData = color.get({
				R: (Math.random() * 256) | 0,
				G: (Math.random() * 256) | 0,
				B: (Math.random() * 256) | 0,
			});
			return { text: `(random) ${formatColorData(colorData)}`, mention: true };
		}

		const model = colorModels[(fromModel = fromModel.toLowerCase())];

		const colorInput = model.parse(msg.args);
		if (!colorInput && fromModel === 'name') {
			const nameInput = msg.args.join(' ').toLowerCase();
			let response = `unknown color: "${nameInput}"`;
			const closestName = colorNameMatcher.getClosest(nameInput);
			if (closestName) response += `, most similar name: ${closestName}`;
			return { text: response, mention: true };
		}
		if (!model.validate(colorInput))
			return {
				text: `invalid ${model.label} input (${model.description})`,
				mention: true,
			};

		const colorData = color.get(colorInput);
		if (!colorData) {
			logger.warning('failed to get color:', colorInput);
			return { text: 'failed to get color', mention: true };
		}

		return { text: formatColorData(colorData), mention: true };
	},
};

function formatName(colorData) {
	const { name: nearestColorName, distance } = colorData.nearest;
	return distance
		? `${nearestColorName} (${formatDistance(distance)})`
		: nearestColorName;
}

function formatHex(colorData) {
	return '#' + (colorData.shorthandHex ?? colorData.hex);
}

function formatRgb(colorData) {
	const {
		RGB: { R, G, B },
	} = colorData;
	return `RGB(${R}, ${G}, ${B})`;
}

function formatHsl(colorData) {
	const { HSL } = colorData;
	const H = Math.round(HSL.H);
	const S = Math.round(HSL.S * 100);
	const L = Math.round(HSL.L * 100);
	return `HSL(${H}, ${S}%, ${L}%)`;
}

function formatXyz(colorData) {
	const { XYZ } = colorData;
	const X = XYZ.X.toFixed(XYZ_PRECISION);
	const Y = XYZ.Y.toFixed(XYZ_PRECISION);
	const Z = XYZ.Z.toFixed(XYZ_PRECISION);
	return `XYZ: ${X}, ${Y}, ${Z}`;
}

function formatLab(colorData) {
	const { Lab } = colorData;
	const L = Lab.L.toFixed(LAB_PRECISION);
	const a = Lab.a.toFixed(LAB_PRECISION);
	const b = Lab.b.toFixed(LAB_PRECISION);
	return `Lab: ${L}, ${a}, ${b}`;
}

function formatAll(colorData) {
	const parts = [];
	for (const m in colorModels) parts.push(colorModels[m].format(colorData));
	return utils.format.join(parts);
}

function formatDistance(distance) {
	let description;
	for (let i = 0; i < DELTA_E00_THRESHOLDS.length; i++)
		if (distance <= DELTA_E00_THRESHOLDS[i][0]) {
			description = DELTA_E00_THRESHOLDS[i][1];
			break;
		}
	return `ΔE₀₀: ${distance.toFixed(DELTA_E00_PRECISION)} -- ${description}`;
}
