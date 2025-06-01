const MEDIAN_SORT_THRESHOLD = 1000;

function isValidArray(arr) {
	return (Array.isArray(arr) || ArrayBuffer.isView(arr)) && arr.length > 0;
}

function getSum(arr) {
	if (!isValidArray(arr)) return null;
	let sum = 0;
	for (let i = 0; i < arr.length; sum += arr[i++]);
	return sum;
}

function getAverage(arr) {
	if (!isValidArray(arr)) return null;
	return getSum(arr) / arr.length;
}

function getMinMax(arr) {
	if (!isValidArray(arr)) return [null, null];
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
	if (!isValidArray(arr)) return null;
	let mean = arr[0],
		M2 = 0;
	for (let i = 1; i < arr.length; i++) {
		const v = arr[i];
		const delta = v - mean;
		M2 += delta * (v - (mean += delta / (i + 1)));
	}
	if (sample) return arr.length > 1 ? M2 / (arr.length - 1) : null;
	return M2 / arr.length;
}

function getStdDev(arr, sample = false) {
	const variance = getVariance(arr, sample);
	return variance === null ? null : Math.sqrt(variance);
}

function quickSelect(arr, k) {
	let left = 0,
		right = arr.length - 1;
	for (let temp; ; ) {
		if (left === right) return arr[left];
		const pivot = arr[left + ((right - left) >>> 1)];
		let i = left,
			j = right;
		while (i <= j) {
			while (arr[i] < pivot) i++;
			while (arr[j] > pivot) j--;
			if (i <= j) {
				temp = arr[i];
				arr[i++] = arr[j];
				arr[j--] = temp;
			}
		}
		if (k <= j) right = j;
		else if (k >= i) left = i;
		else return arr[k];
	}
}

function getMedian(arr) {
	if (!isValidArray(arr)) return null;
	const len = arr.length,
		mid = len >>> 1;
	if (len <= MEDIAN_SORT_THRESHOLD) {
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
	if (!isValidArray(arr)) return null;
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
	return maxCount === 1 ? null : mode;
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
