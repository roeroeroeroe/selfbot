import StringMatcher from '../services/string_matcher.js';
import config from '../config.json' with { type: 'json' };
import colors from '../data/color_names.json' with { type: 'json' };
import twitch from '../services/twitch/index.js';
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

const FULL_BLOCK = '█';
const DEFAULT_SWATCH_WIDTH = 5;
const DEFAULT_CHAT_COLOR_APPLY_DELAY_MS = 1000;

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
	lock: 'GLOBAL',
	exclusiveFlagGroups: [
		['fromModel', 'distanceBetween'],
		['toModel', 'distanceBetween'],
		['distanceBetween', 'updateChatColor'],
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
		{
			name: 'updateChatColor',
			short: 'u',
			long: 'update',
			type: 'boolean',
			defaultValue: false,
			required: false,
			description: 'set as chatColor (requires Prime/Turbo)',
		},
		{
			name: 'swatchWidth',
			short: 'w',
			long: 'swatch-width',
			type: 'int',
			defaultValue: DEFAULT_SWATCH_WIDTH,
			required: false,
			description: `swatch width (default: ${DEFAULT_SWATCH_WIDTH}, min: 1, max: 100)`,
			validator: v => v >= 1 && v <= 100,
		},
		{
			name: 'applyDelay',
			short: 'D',
			long: 'apply-delay',
			type: 'duration',
			defaultValue: DEFAULT_CHAT_COLOR_APPLY_DELAY_MS,
			required: false,
			description:
				'time to wait for the chatColor update to apply before sending the message ' +
				`(default: ${DEFAULT_CHAT_COLOR_APPLY_DELAY_MS}, min: 750ms, max: 3s)`,
			validator: v => v >= 750 && v <= 3000,
		},
		{
			name: 'force',
			short: null,
			long: 'force',
			type: 'boolean',
			defaultValue: false,
			required: false,
			description:
				'skip Prime/Turbo status check and try to change chatColor anyway',
		},
	],
	execute: async msg => {
		if (msg.commandFlags.distanceBetween.length) {
			const [hex1, hex2] = msg.commandFlags.distanceBetween;
			const [Lab1, Lab2] = [
				color.hex.toLab(hex1, true),
				color.hex.toLab(hex2, true),
			];
			const deltaE00 = color.CIEDE2000(Lab1, Lab2);
			if (deltaE00 === null) {
				logger.warning('hexToLab failed for valid hex:', !Lab1 ? hex1 : hex2);
				return { text: 'Lab conversion failed', mention: true };
			}
			return { text: formatDeltaE00(deltaE00), mention: true };
		}

		let { fromModel, toModel } = msg.commandFlags;
		toModel = toModel.toLowerCase();
		const formatColorData =
			toModel === 'all' ? formatAll : colorModels[toModel].format;

		let response, colorData;
		if (!msg.args.length) {
			colorData = color.get({
				R: (Math.random() * 256) | 0,
				G: (Math.random() * 256) | 0,
				B: (Math.random() * 256) | 0,
			});
			response = `(random) ${formatColorData(colorData)}`;
		} else {
			fromModel = fromModel.toLowerCase();
			const model = colorModels[fromModel];

			const colorInput = model.parse(msg.args);
			if (!colorInput && fromModel === 'name') {
				const nameInput = msg.args.join(' ').toLowerCase();
				let errResponse = `unknown color: "${nameInput}"`;
				const closestName = colorNameMatcher.getClosest(nameInput);
				if (closestName) errResponse += `, most similar name: ${closestName}`;
				return { text: errResponse, mention: true };
			}
			if (!model.validate(colorInput))
				return {
					text: `invalid ${model.label} input (${model.description})`,
					mention: true,
				};

			colorData = color.get(colorInput);
			if (!colorData) {
				logger.warning('failed to get color:', colorInput);
				return { text: 'failed to get color', mention: true };
			}
			response = formatColorData(colorData);
		}

		const { updateChatColor, swatchWidth, applyDelay, force } =
			msg.commandFlags;

		if (!updateChatColor) return { text: response, mention: true };

		if (!force)
			try {
				if (!(await twitch.gql.user.getSelfHasPrimeOrTurbo()))
					return {
						text: 'Prime or Turbo is required to change the chat color',
						mention: true,
					};
			} catch (err) {
				logger.error('error getting Prime/Turbo status:', err);
				return { text: 'error getting Prime/Turbo status', mention: true };
			}

		let currentChatColor;
		if (msg.senderUserID === config.bot.id) currentChatColor = msg.colorRaw;
		else
			try {
				currentChatColor = await twitch.gql.user.getSelfChatColor();
			} catch (err) {
				logger.error('error getting own chat color:', err);
				return { text: 'error getting current chat color', mention: true };
			}
		if (currentChatColor)
			currentChatColor = color.hex.normalize(currentChatColor);

		if (currentChatColor !== colorData.hex) {
			try {
				const res = await twitch.gql.user.updateChatColor('#' + colorData.hex);
				const errCode = res.updateChatColorV2.error?.code;
				if (errCode) {
					const errMessage = `error updating chat color: ${errCode}`;
					logger.error(errMessage);
					return { text: errMessage, mention: true };
				}
			} catch (err) {
				logger.error('error updating chat color:', err);
				return { text: 'error updating chat color', mention: true };
			}
			await utils.sleep(applyDelay);
		}

		response = `${FULL_BLOCK.repeat(swatchWidth)} ${response}`;
		return { text: response, mention: true, action: true };
	},
};

function formatName(colorData) {
	const { name: nearestColorName, distance } = colorData.nearest;
	return distance
		? `${nearestColorName} (${formatDeltaE00(distance)})`
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

function formatDeltaE00(deltaE00) {
	let description;
	for (let i = 0; i < DELTA_E00_THRESHOLDS.length; i++)
		if (deltaE00 <= DELTA_E00_THRESHOLDS[i][0]) {
			description = DELTA_E00_THRESHOLDS[i][1];
			break;
		}
	return `ΔE₀₀: ${deltaE00.toFixed(DELTA_E00_PRECISION)} -- ${description}`;
}
