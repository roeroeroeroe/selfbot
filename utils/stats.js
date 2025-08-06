const MEDIAN_SORT_THRESHOLD = 1000;

const identity = x => x;

function isValidArray(arr) {
	return (Array.isArray(arr) || ArrayBuffer.isView(arr)) && arr.length > 0;
}

function getSum(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	let sum = 0;
	for (let i = 0; i < arr.length; sum += accessor(arr[i++]));
	return sum;
}

function getMean(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	return getSum(arr, accessor) / arr.length;
}

function getMinMax(arr, accessor = identity) {
	if (!isValidArray(arr)) return [null, null];
	let min = accessor(arr[0]),
		max = min;
	for (let i = 1; i < arr.length; i++) {
		const v = accessor(arr[i]);
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return [min, max];
}

function getMin(arr, accessor = identity) {
	return getMinMax(arr, accessor)?.[0] ?? null;
}

function getMax(arr, accessor = identity) {
	return getMinMax(arr, accessor)?.[1] ?? null;
}

function getRange(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	const [min, max] = getMinMax(arr, accessor);
	return max - min;
}

function getPopulationVariance(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	let mean = accessor(arr[0]),
		M2 = 0;
	for (let i = 1; i < arr.length; i++) {
		const v = accessor(arr[i]);
		const delta = v - mean;
		mean += delta / (i + 1);
		M2 += delta * (v - mean);
	}
	return M2 / arr.length;
}

function getSampleVariance(arr, accessor = identity) {
	if (!isValidArray(arr) || arr.length < 2) return null;
	const variance = getPopulationVariance(arr, accessor);
	return variance === null ? null : variance * (arr.length / (arr.length - 1));
}

function getPopulationStdDev(arr, accessor = identity) {
	const variance = getPopulationVariance(arr, accessor);
	return variance === null ? null : Math.sqrt(variance);
}

function getSampleStdDev(arr, accessor = identity) {
	const variance = getSampleVariance(arr, accessor);
	return variance === null ? null : Math.sqrt(variance);
}

function quickSelect(arr, k, accessor = identity) {
	let left = 0,
		right = arr.length - 1;
	for (let temp; ; ) {
		if (left === right) return accessor(arr[left]);
		const mid = left + ((right - left) >>> 1);
		const vL = accessor(arr[left]),
			vM = accessor(arr[mid]),
			vR = accessor(arr[right]);
		let pivotIndex;
		if (vL > vM) {
			if (vM > vR) pivotIndex = mid;
			else if (vL > vR) pivotIndex = right;
			else pivotIndex = left;
		} else {
			if (vL > vR) pivotIndex = left;
			else if (vM > vR) pivotIndex = right;
			else pivotIndex = mid;
		}
		const pivotValue = accessor(arr[pivotIndex]);
		temp = arr[pivotIndex];
		arr[pivotIndex] = arr[right];
		arr[right] = temp;
		let store = left;
		for (let i = left; i < right; i++)
			if (accessor(arr[i]) < pivotValue) {
				temp = arr[i];
				arr[i] = arr[store];
				arr[store++] = temp;
			}
		temp = arr[store];
		arr[store] = arr[right];
		arr[right] = temp;
		if (k === store) return accessor(arr[k]);
		else if (k < store) right = store - 1;
		else left = store + 1;
	}
}

function getMedian(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	const copy = arr.slice(),
		len = copy.length,
		mid = len >>> 1;

	if (len <= MEDIAN_SORT_THRESHOLD) {
		copy.sort((a, b) => accessor(a) - accessor(b));
		if (len & 1) return accessor(copy[mid]);
		return (accessor(copy[mid - 1]) + accessor(copy[mid])) / 2;
	}
	if (len & 1) return quickSelect(copy, mid, accessor);
	return (
		(quickSelect(copy, mid - 1, accessor) + quickSelect(copy, mid, accessor)) /
		2
	);
}

function getMode(arr, accessor = identity) {
	if (!isValidArray(arr)) return null;
	const freq = new Map(),
		half = arr.length >>> 1;
	let mode = accessor(arr[0]),
		maxCount = 1;
	for (let i = 0; i < arr.length; i++) {
		const v = accessor(arr[i]);
		const c = (freq.get(v) || 0) + 1;
		freq.set(v, c);
		if (c > maxCount) {
			if (c > half) return v;
			maxCount = c;
			mode = v;
		}
	}
	return maxCount === 1 ? null : mode;
}

export default {
	sum: getSum,
	mean: getMean,
	minMax: getMinMax,
	min: getMin,
	max: getMax,
	range: getRange,
	variance: {
		population: getPopulationVariance,
		sample: getSampleVariance,
	},
	stdDev: {
		population: getPopulationStdDev,
		sample: getSampleStdDev,
	},
	median: getMedian,
	mode: getMode,
};
