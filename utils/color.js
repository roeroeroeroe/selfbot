import colors from '../data/color_names.json' with { type: 'json' };

const HASH_CHARCODE = 35;

const HEX_VAL = new Uint8Array(128); // ascii to hex
for (let i = 48; i <= 57; i++) HEX_VAL[i] = i - 48; // '0'-'9' -> 0-9
for (let i = 65; i <= 70; i++) HEX_VAL[i] = i - 55; // 'A'-'F' -> 10-15
for (let i = 97; i <= 102; i++) HEX_VAL[i] = i - 87; // 'a'-'f' -> 10-15

const points = new Array(colors.length);
const indices = new Uint32Array(colors.length);
const hexToIndex = new Map();

for (let i = 0; i < colors.length; indices[i] = i++) {
	const c = colors[i];
	const rgb = hexToRgb(c.hex, true, true);
	points[i] = { r: rgb.r, g: rgb.g, b: rgb.b, name: c.name };
	hexToIndex.set(c.hex, i);
}

function partition(arr, low, high, pivotIndex, axis) {
	const pivotValue = points[arr[pivotIndex]][axis];
	[arr[pivotIndex], arr[high - 1]] = [arr[high - 1], arr[pivotIndex]];
	let store = low;
	for (let i = low; i < high - 1; i++)
		if (points[arr[i]][axis] < pivotValue) {
			[arr[i], arr[store]] = [arr[store], arr[i]];
			store++;
		}
	[arr[store], arr[high - 1]] = [arr[high - 1], arr[store]];
	return store;
}

function quickSelect(arr, low, high, k, axis) {
	for (;;) {
		if (low + 1 >= high) return;
		const pivotIndex = low + ((high - low) >>> 1);
		const pivotPos = partition(arr, low, high, pivotIndex, axis);
		if (k === pivotPos) return;
		else if (k < pivotPos) high = pivotPos;
		else low = pivotPos + 1;
	}
}

const kdTreeRoot = (function buildKdTree(arr, low, high, depth) {
	if (low >= high) return;
	const axis = ['r', 'g', 'b'][depth % 3];
	const mid = low + ((high - low) >>> 1);

	quickSelect(arr, low, high, mid, axis);

	return {
		point: points[arr[mid]],
		axis,
		left: buildKdTree(arr, low, mid, depth + 1),
		right: buildKdTree(arr, mid + 1, high, depth + 1),
	};
})(indices, 0, indices.length, 0);

function kdNearest(node, target, best = { distance: Infinity, node: null }) {
	if (!node) return best;
	const distance =
		(node.point.r - target.r) ** 2 +
		(node.point.g - target.g) ** 2 +
		(node.point.b - target.b) ** 2;
	if (distance < best.distance) {
		best.distance = distance;
		best.node = node;
		if (!distance) return best;
	}

	const diff = target[node.axis] - node.point[node.axis];
	let nearerNode, fartherNode;
	if (diff < 0) {
		nearerNode = node.left;
		fartherNode = node.right;
	} else {
		nearerNode = node.right;
		fartherNode = node.left;
	}

	best = kdNearest(nearerNode, target, best);
	if (diff ** 2 < best.distance) best = kdNearest(fartherNode, target, best);

	return best;
}
// prettier-ignore
function isValidHex(hex) {
	if (typeof hex !== 'string') return false;
	let i = hex.charCodeAt(0) === HASH_CHARCODE ? 1 : 0;
	const len = hex.length - i;
	if (len !== 3 && len !== 6) return false;

	for (; i < hex.length; i++) {
		const c = hex.charCodeAt(i);
		if (!HEX_VAL[c] && c !== 48) return false;
	}
	return true;
}
// prettier-ignore
function isValidRgb(rgb) {
	if (typeof rgb !== 'object' || rgb === null) return false;
	const { r, g, b } = rgb;
	return (
		r === (r | 0) && r >= 0 && r <= 255 &&
		g === (g | 0) && g >= 0 && g <= 255 &&
		b === (b | 0) && b >= 0 && b <= 255
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

function hexToName(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	const index = hexToIndex.get(hex);
	if (index !== undefined) return points[index].name;

	return kdNearest(kdTreeRoot, hexToRgb(hex, true, true)).node.point.name;
}
// prettier-ignore
function hexToRgb(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return {
		r: (HEX_VAL[hex.charCodeAt(0)] << 4) | HEX_VAL[hex.charCodeAt(1)],
		g: (HEX_VAL[hex.charCodeAt(2)] << 4) | HEX_VAL[hex.charCodeAt(3)],
		b: (HEX_VAL[hex.charCodeAt(4)] << 4) | HEX_VAL[hex.charCodeAt(5)],
	};
}

function hexToShorthand(hex, validated = false, normalized = false) {
	if (!validated && !isValidHex(hex)) return null;
	if (!normalized) hex = normalizeHex(hex);
	return hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]
		? hex[0] + hex[2] + hex[4]
		: null;
}

function rgbToName(rgb = {}, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	return kdNearest(kdTreeRoot, rgb).node.point.name;
}

function rgbToHex(rgb = {}, validated = false) {
	if (!validated && !isValidRgb(rgb)) return null;
	const { r, g, b } = rgb;
	return ((r << 16) | (g << 8) | b | 0x1000000).toString(16).slice(1);
}

function getColor(hexOrRgb) {
	if (isValidHex(hexOrRgb)) {
		const color = { hex: normalizeHex(hexOrRgb) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexToRgb(color.hex, true, true);
		const index = hexToIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: kdNearest(kdTreeRoot, color.rgb).node.point.name;
		return color;
	}
	if (isValidRgb(hexOrRgb)) {
		const color = { hex: rgbToHex(hexOrRgb, true) };
		color.shorthandHex = hexToShorthand(color.hex, true, true);
		color.rgb = hexOrRgb;
		const index = hexToIndex.get(color.hex);
		color.name =
			index !== undefined
				? points[index].name
				: kdNearest(kdTreeRoot, hexOrRgb).node.point.name;
		return color;
	}

	return null;
}

export default {
	hexToName,
	hexToRgb,
	hexToShorthand,
	rgbToName,
	rgbToHex,
	get: getColor,
};
