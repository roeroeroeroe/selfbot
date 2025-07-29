import logger from './logger.js';
// prettier-ignore
export default class StringMatcher {
	static #MAX_UINT8  = (1 << 8) - 1;
	static #MAX_UINT16 = (1 << 16) - 1;

	static #DEFAULT_LENGTH_TOLERANCE    = 2;
	static #DEFAULT_CANDIDATE_FACTOR    = 0.1;
	static #DEFAULT_EARLY_EXIT_DISTANCE = 1;

	static #MIN_CANDIDATES = 50;

	#strings;
	#originalStrings;
	#lengthBuckets;
	#minLength;
	#maxLength;

	#caseSensitive;
	#lengthTolerance;
	#maxCandidateCount;
	#earlyExitDistance;

	#dpBuffer;
	#dpCols;
	#prevPrevRow;
	#prevRow;
	#currRow;

	/**
	 * @param {string[]} strings An array of strings to match against
	 * @param {Object} [options]
	 * @param {boolean} [options.caseSensitive]
	 * @param {number} [options.lengthTolerance]
	 * @param {number} [options.maxCandidateCount]
	 * Overrides `candidateFactor` if set. Always clamped to
	 * min(`strings.length`, max(50, `maxCandidateCount`))
	 * @param {number} [options.candidateFactor]
	 * @param {number} [options.earlyExitDistance]
	 */
	constructor(strings, options = {}) {
		if (!Array.isArray(strings) || !strings.length)
			throw new Error('must be a non-empty array');
		const {
			caseSensitive = true,
			lengthTolerance = StringMatcher.#DEFAULT_LENGTH_TOLERANCE,
			earlyExitDistance = StringMatcher.#DEFAULT_EARLY_EXIT_DISTANCE,
		} = options;
		let { maxCandidateCount, candidateFactor } = options;

		this.#validateLengthTolerance(lengthTolerance);
		if (maxCandidateCount !== undefined)
			this.#validateMaxCandidateCount(maxCandidateCount);
		if (candidateFactor !== undefined)
			this.#validateCandidateFactor(candidateFactor);
		this.#validateEarlyExitDistance(earlyExitDistance);

		this.#strings = strings.slice();
		if (!caseSensitive)
			this.#originalStrings = new Map();
		this.#lengthBuckets = new Map();

		let minLength = Infinity, maxLength = -Infinity, write = 0;
		for (let read = 0; read < this.#strings.length; read++) {
			const str = this.#strings[read];
			if (typeof str !== 'string' || !str)
				continue;
			const len = str.length;
			if (len < minLength)
				minLength = len;
			if (len > maxLength)
				maxLength = len;
			if (!this.#lengthBuckets.has(len))
				this.#lengthBuckets.set(len, [write]);
			else
				this.#lengthBuckets.get(len).push(write);
			if (caseSensitive)
				this.#strings[write] = str;
			else {
				const lowercased = (this.#strings[write] = str.toLowerCase());
				if (lowercased !== str) {
					const duplicate = this.#originalStrings.get(lowercased);
					if (duplicate)
						logger.warning('[StringMatcher] lowercase string',
						               'collision, overwriting',
						               `"${duplicate}" with "${str}"`);
					this.#originalStrings.set(lowercased, str);
				}
			}
			write++;
		}
		if (!write)
			throw new Error('all strings are empty');

		this.#strings.length = write;
		this.#minLength      = minLength;
		this.#maxLength      = maxLength;

		maxCandidateCount ??= Math.round(
			write * (candidateFactor ?? StringMatcher.#DEFAULT_CANDIDATE_FACTOR)
		);
		maxCandidateCount = Math.min(
			write, Math.max(StringMatcher.#MIN_CANDIDATES, maxCandidateCount)
		);

		this.#caseSensitive     = caseSensitive;
		this.#lengthTolerance   = lengthTolerance;
		this.#maxCandidateCount = maxCandidateCount;
		this.#earlyExitDistance = earlyExitDistance;

		this.#initDpBuffer(maxLength + 1);
	}

	#validateLengthTolerance(lengthTolerance) {
		if (lengthTolerance !== Number.POSITIVE_INFINITY &&
		    (!Number.isInteger(lengthTolerance) || lengthTolerance < 0))
			throw new Error('lengthTolerance must be a non-negative ' +
			                'integer or Infinity');
	}

	#validateMaxCandidateCount(maxCandidateCount) {
		if (maxCandidateCount !== Number.POSITIVE_INFINITY &&
		    (!Number.isInteger(maxCandidateCount) || maxCandidateCount <= 0))
			throw new Error('maxCandidateCount must be a positive integer');
	}

	#validateCandidateFactor(f) {
		if (!Number.isFinite(f) || f <= 0 || f > 1)
			throw new Error('candidateFactor must be in (0, 1]');
	}

	#validateEarlyExitDistance(earlyExitDistance) {
		if (!Number.isInteger(earlyExitDistance) || earlyExitDistance <= 0)
			throw new Error('earlyExitDistance must be a positive integer');
	}

	#initDpBuffer(cols) {
		let DpArray;
		if (cols <= StringMatcher.#MAX_UINT8)
			DpArray = Uint8Array;
		else if (cols <= StringMatcher.#MAX_UINT16)
			DpArray = Uint16Array;
		else
			DpArray = Uint32Array;
		logger.debug(`[StringMatcher] initDpBuffer: ${this.#dpCols ?? 0}`,
		             `-> ${cols} columns`);
		this.#dpBuffer = new DpArray(cols * 3);
		this.#dpCols = cols;
		this.#prevPrevRow = this.#dpBuffer.subarray(0, cols);
		this.#prevRow = this.#dpBuffer.subarray(cols, cols * 2);
		this.#currRow = this.#dpBuffer.subarray(cols * 2, cols * 3);
	}

	#OSADistance(a, b, bestDistance = Infinity) {
		const aLen = a.length,
		      bLen = b.length,
		      cols = Math.max(aLen, bLen) + 1;

		if (this.#dpCols < cols)
			this.#initDpBuffer(cols);

		for (let j = 0; j < cols; j++)
			this.#prevRow[j] = j;

		for (let i = 1; i <= aLen; i++) {
			const aC = a[i - 1];
			let rowMin = (this.#currRow[0] = i);
			for (let j = 1; j <= bLen; j++) {
				const bC = b[j - 1];
				const cost = aC === bC ? 0 : 1;

				let distance = this.#prevRow[j] + 1; // deletion
				const insertion = this.#currRow[j - 1] + 1;
				const substitution = this.#prevRow[j - 1] + cost;

				if (insertion < distance)
					distance = insertion;
				if (substitution < distance)
					distance = substitution;

				if (i > 1 && j > 1 &&
				    aC === b[j - 2] && a[i - 2] === bC) {
					const transposition = this.#prevPrevRow[j - 2] + 1;
					if (transposition < distance)
						distance = transposition;
				}

				if ((this.#currRow[j] = distance) < rowMin)
					rowMin = distance;
			}
			if (rowMin > bestDistance)
				return Infinity;
			const temp = this.#prevPrevRow;
			this.#prevPrevRow = this.#prevRow;
			this.#prevRow = this.#currRow;
			this.#currRow = temp;
		}

		return this.#prevRow[bLen];
	}

	/**
	 * @param {string} query
	 * @param {number} [maxDistance]
	 * Maximum distance allowed for a match to be considered valid
	 * @returns {string|null}
	 */
	getClosest(query, maxDistance = Infinity) {
		if (typeof query !== 'string') {
			logger.warning('[StringMatcher] getClosest: not a string:', query);
			return null;
		}
		if (!query)
			return null;
		if (maxDistance !== Number.POSITIVE_INFINITY &&
		    (!Number.isInteger(maxDistance) || maxDistance < this.#earlyExitDistance)) {
			logger.warning('[StringMatcher] getClosest: invalid maxDistance:',
			               maxDistance);
			maxDistance = Infinity;
		}

		if (!this.#caseSensitive)
			query = query.toLowerCase();

		const minLen = this.#minLength,
		      maxLen = this.#maxLength,
		      qLen   = query.length;

		let startLen;
		if (qLen < minLen)
			startLen = minLen;
		else if (qLen > maxLen)
			startLen = maxLen;
		else
			startLen = qLen;

		let tolerance =
			this.#lengthTolerance === Infinity
				? Math.max(qLen - minLen, maxLen - qLen)
				: this.#lengthTolerance;

		if (tolerance > maxDistance)
			tolerance = maxDistance;

		let bestMatch = null, bestDistance = maxDistance;
		buckets: for (let i = 0, cc = 0; i <= tolerance * 2; i++) {
			const delta  = (i + 1) >>> 1,
			      offset = i & 1 ? -delta : delta,
			      len    = startLen + offset;

			if (len < minLen || len > maxLen)
				continue;

			const minPossible = Math.abs(len - qLen);
			if (minPossible > bestDistance)
				continue;

			const bucket = this.#lengthBuckets.get(len);
			if (!bucket)
				continue;

			for (let j = 0; j < bucket.length; j++) {
				const candidate = this.#strings[bucket[j]];
				if (query === candidate)
					return this.#caseSensitive
						? candidate
						: (this.#originalStrings.get(candidate) ?? candidate);
				const distance = this.#OSADistance(
					query,
					candidate,
					bestDistance
				);
				cc++;
				if (distance < bestDistance) {
					bestMatch = candidate;
					if ((bestDistance = distance) <= this.#earlyExitDistance)
						break buckets;
					if (bestDistance < tolerance)
						tolerance = bestDistance;
					if (bestDistance === minPossible) {
						if (cc >= this.#maxCandidateCount)
							break buckets;
						continue buckets;
					}
				}
				if (cc >= this.#maxCandidateCount)
					break buckets;
			}
		}

		if (!bestMatch || bestDistance > maxDistance)
			return null;

		return this.#caseSensitive
			? bestMatch
			: (this.#originalStrings.get(bestMatch) ?? bestMatch);
	}

	get caseSensitive() { return this.#caseSensitive; }
	get lengthTolerance() { return this.#lengthTolerance; }
	get maxCandidateCount() { return this.#maxCandidateCount; }
	get earlyExitDistance() { return this.#earlyExitDistance; }

	set lengthTolerance(lengthTolerance) {
		this.#validateLengthTolerance(lengthTolerance);
		this.#lengthTolerance = lengthTolerance;
	}

	set maxCandidateCount(maxCandidateCount) {
		this.#validateMaxCandidateCount(maxCandidateCount);
		this.#maxCandidateCount =
			Math.min(this.#strings.length, maxCandidateCount);
	}

	set earlyExitDistance(earlyExitDistance) {
		this.#validateEarlyExitDistance(earlyExitDistance);
		this.#earlyExitDistance = earlyExitDistance;
	}
}
