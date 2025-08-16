import CIEDE2000 from './ciede2000.js';
import logger from '../logger.js';

export default class VPTree {
	#labData;
	#pivotIndices;
	#radii;
	#childIds;
	#rootId;

	constructor(labData) {
		const N = labData.length / 3;

		let IndexArray;
		if (N <= 0xff) IndexArray = Uint8Array;
		else if (N <= 0xffff) IndexArray = Uint16Array;
		else IndexArray = Uint32Array;

		// IDs 0..N-1, hence <= 128/32768
		let IdArray;
		if (N <= 128) IdArray = Int8Array;
		else if (N <= 32768) IdArray = Int16Array;
		else IdArray = Int32Array;

		this.#labData = labData;
		this.#pivotIndices = new IndexArray(N);
		this.#radii = new Float64Array(N);
		this.#childIds = new IdArray(N * 2).fill(-1);

		if (!N) {
			this.#rootId = -1;
			return;
		}

		const indices = new IndexArray(N);
		for (let i = 0; i < N; i++) indices[i] = i;

		const iBuf = new IndexArray(N - 1),
			dBuf = new Float64Array(N - 1);

		let nodeIdCounter = 0;
		const build = (start, end) => {
			if (start >= end) return -1;

			const nodeId = nodeIdCounter++;
			const pivotIndex = (this.#pivotIndices[nodeId] = indices[start]);

			const count = end - start;
			if (count === 1) {
				this.#radii[nodeId] = 0;
				return nodeId;
			}

			const pivotOffset = pivotIndex * 3;
			const centerL = labData[pivotOffset],
				centerA = labData[pivotOffset + 1],
				centerB = labData[pivotOffset + 2];

			for (let si = start + 1, bi = 0; si < end; si++, bi++) {
				const index = indices[si];
				const pointOffset = index * 3;
				iBuf[bi] = index;
				dBuf[bi] = CIEDE2000(
					centerL,
					centerA,
					centerB,
					labData[pointOffset],
					labData[pointOffset + 1],
					labData[pointOffset + 2]
				);
			}

			const mid = (count - 1) >>> 1;
			this.#quickSelect(iBuf, dBuf, 0, count - 2, mid);
			const radius = (this.#radii[nodeId] = dBuf[mid]);

			let iPtr = start + 1,
				oPtr = end - 1;
			for (let i = 0; i < count - 1; i++)
				if (dBuf[i] <= radius) indices[iPtr++] = iBuf[i];
				else indices[oPtr--] = iBuf[i];

			const childrenOffset = nodeId * 2;
			this.#childIds[childrenOffset] = build(start + 1, iPtr);
			this.#childIds[childrenOffset + 1] = build(iPtr, end);

			return nodeId;
		};

		const t0 = performance.now();
		this.#rootId = build(0, N);
		const t1 = performance.now();
		logger.debug(
			`[VPTree] built in ${(t1 - t0).toFixed(3)}ms`,
			`(${indices.length} indices)`
		);
	}

	#partition(indices, distances, left, right, pivotIndex) {
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

	#quickSelect(indices, distances, left, right, k) {
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
			pivotIndex = this.#partition(indices, distances, left, right, pivotIndex);
			if (k === pivotIndex) return;
			else if (k < pivotIndex) right = pivotIndex - 1;
			else left = pivotIndex + 1;
		}
	}

	nearest(
		target,
		nodeId = this.#rootId,
		best = { index: -1, distance: Infinity }
	) {
		if (nodeId === -1) return best;

		const pivotIndex = this.#pivotIndices[nodeId];
		const pivotIndexOffset = pivotIndex * 3;
		const distance = CIEDE2000(
			target.L,
			target.a,
			target.b,
			this.#labData[pivotIndexOffset],
			this.#labData[pivotIndexOffset + 1],
			this.#labData[pivotIndexOffset + 2]
		);

		if (distance < best.distance) {
			best.distance = distance;
			best.index = pivotIndex;
		}

		const childOffset = nodeId * 2;
		const radius = this.#radii[nodeId],
			innerId = this.#childIds[childOffset],
			outerId = this.#childIds[childOffset + 1];

		let nearer, farther;
		if (distance <= radius) {
			nearer = innerId;
			farther = outerId;
		} else {
			nearer = outerId;
			farther = innerId;
		}

		best = this.nearest(target, nearer, best);
		if (Math.abs(distance - radius) <= best.distance)
			best = this.nearest(target, farther, best);

		return best;
	}
}
