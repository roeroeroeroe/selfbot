import CIEDE2000 from './ciede2000.js';

function partition(distances, indices, left, right, pivotIndex) {
	const pivotDistance = distances[pivotIndex];
	let tempD = distances[pivotIndex];
	distances[pivotIndex] = distances[right];
	distances[right] = tempD;
	let tempI = indices[pivotIndex];
	indices[pivotIndex] = indices[right];
	indices[right] = tempI;
	let store = left;
	for (let i = left; i < right; i++)
		if (distances[i] < pivotDistance) {
			tempD = distances[i];
			distances[i] = distances[store];
			distances[store] = tempD;
			tempI = indices[i];
			indices[i] = indices[store];
			indices[store++] = tempI;
		}
	tempD = distances[store];
	distances[store] = distances[right];
	distances[right] = tempD;
	tempI = indices[store];
	indices[store] = indices[right];
	indices[right] = tempI;
	return store;
}

function quickSelect(distances, indices, left, right, k) {
	for (;;) {
		if (left === right) return;
		const mid = left + ((right - left) >>> 1);
		const dL = distances[left],
			dM = distances[mid],
			dR = distances[right];
		let pivotIndex = mid;
		if (dL > dM) {
			if (dM > dR) pivotIndex = mid;
			else if (dL > dR) pivotIndex = right;
			else pivotIndex = left;
		} else {
			if (dL > dR) pivotIndex = left;
			else if (dM > dR) pivotIndex = right;
			else pivotIndex = mid;
		}
		pivotIndex = partition(distances, indices, left, right, pivotIndex);
		if (k === pivotIndex) return;
		else if (k < pivotIndex) right = pivotIndex - 1;
		else left = pivotIndex + 1;
	}
}

function buildVpTree(labData, indices, start, end, iBuf, dBuf) {
	if (start >= end) return null;
	const pivotIndex = indices[start];
	const count = end - start;
	if (count === 1)
		return { index: pivotIndex, radius: 0, inner: null, outer: null };

	const offset = pivotIndex * 3;
	const centerL = labData[offset],
		centerA = labData[offset + 1],
		centerB = labData[offset + 2];
	for (let si = start + 1, bi = 0; si < end; si++, bi++) {
		const index = indices[si];
		const offset = index * 3;
		iBuf[bi] = index;
		dBuf[bi] = CIEDE2000(
			centerL,
			centerA,
			centerB,
			labData[offset],
			labData[offset + 1],
			labData[offset + 2]
		);
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
		inner: buildVpTree(labData, indices, start + 1, iPtr, iBuf, dBuf),
		outer: buildVpTree(labData, indices, iPtr, end, iBuf, dBuf),
	};
}

function vpNearest(
	node,
	labData,
	target,
	best = { distance: Infinity, index: -1 }
) {
	if (node === null) return best;

	const offset = node.index * 3;
	const dVp = CIEDE2000(
		target.L,
		target.a,
		target.b,
		labData[offset],
		labData[offset + 1],
		labData[offset + 2]
	);
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

	best = vpNearest(nearer, labData, target, best);
	if (Math.abs(dVp - node.radius) <= best.distance)
		best = vpNearest(farther, labData, target, best);

	return best;
}

export default {
	build: buildVpTree,
	nearest: vpNearest,
};
