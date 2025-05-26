const QUICKSELECT_THRESHOLD = 5000;

function isValidArray(arr) {
	return (Array.isArray(arr) || ArrayBuffer.isView(arr)) && arr.length > 0;
}

function getSum(arr) {
	if (!isValidArray(arr)) return NaN;
	let sum = 0;
	for (let i = 0; i < arr.length; sum += arr[i++]);
	return sum;
}

function getAverage(arr) {
	if (!isValidArray(arr)) return NaN;
	return getSum(arr) / arr.length;
}

function getMinMax(arr) {
	if (!isValidArray(arr)) return [NaN, NaN];
	let min = arr[0],
		max = arr[0];
	for (let i = 1; i < arr.length; i++) {
		const v = arr[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return [min, max];
}

function getMin(arr) {
	return getMinMax(arr)[0];
}

function getMax(arr) {
	return getMinMax(arr)[1];
}

function getRange(arr) {
	const [min, max] = getMinMax(arr);
	return max - min;
}

function getVariance(arr, sample = false) {
	if (!isValidArray(arr)) return NaN;
	let mean = arr[0],
		M2 = 0;
	for (let i = 1; i < arr.length; i++) {
		const v = arr[i];
		const delta = v - mean;
		M2 += delta * (v - (mean += delta / (i + 1)));
	}
	if (sample) return arr.length > 1 ? M2 / (arr.length - 1) : NaN;
	return M2 / arr.length;
}

function getStdDev(arr, sample = false) {
	const variance = getVariance(arr, sample);
	return Number.isNaN(variance) ? NaN : Math.sqrt(variance);
}

function quickSelect(arr, k) {
	let left = 0,
		right = arr.length - 1;
	for (;;) {
		if (left === right) return arr[left];
		const pivot = arr[left + ((right - left) >>> 1)];
		let i = left,
			j = right;
		while (i <= j) {
			while (arr[i] < pivot) i++;
			while (arr[j] > pivot) j--;
			if (i <= j) [arr[i++], arr[j--]] = [arr[j], arr[i]];
		}
		if (k <= j) right = j;
		else if (k >= i) left = i;
		else return arr[k];
	}
}

function getMedian(arr) {
	if (!isValidArray(arr)) return NaN;
	const len = arr.length,
		mid = len >>> 1;
	if (len <= QUICKSELECT_THRESHOLD) {
		const copy = arr.slice();
		copy.sort((a, b) => a - b);
		if (len & 1) return copy[mid];
		return (copy[mid - 1] + copy[mid]) / 2;
	}
	if (len & 1) return quickSelect(arr.slice(), mid);
	return (
		(quickSelect(arr.slice(), mid - 1) + quickSelect(arr.slice(), mid)) / 2
	);
}

function getMode(arr) {
	if (!isValidArray(arr)) return NaN;
	const freq = new Map(),
		half = arr.length >>> 1;
	let mode = arr[0],
		maxCount = 1;
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		const c = (freq.get(v) || 0) + 1;
		freq.set(v, c);
		if (c > maxCount) {
			if (c > half) return v;
			maxCount = c;
			mode = v;
		}
	}
	return maxCount === 1 ? NaN : mode;
}

export default {
	sum: getSum,
	average: getAverage,
	minMax: getMinMax,
	min: getMin,
	max: getMax,
	range: getRange,
	variance: getVariance,
	stdDev: getStdDev,
	median: getMedian,
	mode: getMode,
};
