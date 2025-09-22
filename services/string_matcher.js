import logger from './logger.js';
// prettier-ignore
export default class StringMatcher {
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
	#candidateFactor;
	#earlyExitDistance;
	#maxQueryLength;

	#isDynamicMaxCandidateCount;
	#hasUserMaxCandidateCount;

	#dynamicMaxCandidateCounts;

	#dpBuffer;
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
	 * @param {number} [options.maxQueryLength]
	 * @param {boolean} [options.dynamicMaxCandidateCount]
	 * If `true`, uses a dynamic `maxCandidateCount` per query length based on
	 * the number of strings with lengths between `qLen - tolerance` and `qLen + tolerance`.
	 * Defaults to `true` if `maxCandidateCount` is not provided
	 */
	constructor(strings, options = {}) {
		if (!Array.isArray(strings) || !strings.length)
			throw new Error('must be a non-empty array');
		const {
			caseSensitive = true,
			lengthTolerance = StringMatcher.#DEFAULT_LENGTH_TOLERANCE,
			earlyExitDistance = StringMatcher.#DEFAULT_EARLY_EXIT_DISTANCE,
			dynamicMaxCandidateCount,
		} = options;
		let { maxCandidateCount, candidateFactor, maxQueryLength } = options;

		this.#validateLengthTolerance(lengthTolerance);
		if (maxCandidateCount !== undefined)
			this.#validateMaxCandidateCount(maxCandidateCount);
		if (candidateFactor !== undefined)
			this.#validateCandidateFactor(candidateFactor);
		this.#validateEarlyExitDistance(earlyExitDistance);
		if (maxQueryLength !== undefined)
			this.#validateMaxQueryLength(maxQueryLength);

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

		this.#caseSensitive   = caseSensitive;
		this.#lengthTolerance = lengthTolerance;

		this.#candidateFactor =
			candidateFactor ?? StringMatcher.#DEFAULT_CANDIDATE_FACTOR;
		this.#hasUserMaxCandidateCount = maxCandidateCount !== undefined;
		maxCandidateCount ??= Math.round(write * this.#candidateFactor);
		this.#maxCandidateCount = Math.min(
			write, Math.max(StringMatcher.#MIN_CANDIDATES, maxCandidateCount)
		);
		this.#earlyExitDistance = earlyExitDistance;
		if (maxQueryLength === undefined) {
			if (lengthTolerance === Number.POSITIVE_INFINITY) {
				maxQueryLength =
					maxLength + StringMatcher.#DEFAULT_LENGTH_TOLERANCE;
				logger.warning('[StringMatcher] lengthTolerance=Infinity,',
				               'but maxQueryLength was not provided;',
				               `setting maxQueryLength to ${maxQueryLength}`);
			} else
				maxQueryLength = maxLength + lengthTolerance;
		}
		this.#maxQueryLength = maxQueryLength;

		if (dynamicMaxCandidateCount !== undefined)
			this.#isDynamicMaxCandidateCount = dynamicMaxCandidateCount;
		else
			this.#isDynamicMaxCandidateCount = !this.#hasUserMaxCandidateCount;
		if (this.#isDynamicMaxCandidateCount)
			this.#buildDynamicMaxCandidateCounts();

		const maxDistance = Math.max(maxQueryLength, maxLength);
		let DpArray;
		if (maxDistance <= 0xff)
			DpArray = Uint8Array;
		else if (maxDistance <= 0xffff)
			DpArray = Uint16Array;
		else
			DpArray = Uint32Array;
		const cols = maxLength + 1;
		this.#dpBuffer    = new DpArray(cols * 3);
		this.#prevPrevRow = this.#dpBuffer.subarray(0, cols);
		this.#prevRow     = this.#dpBuffer.subarray(cols, cols * 2);
		this.#currRow     = this.#dpBuffer.subarray(cols * 2, cols * 3);
	}

	#buildDynamicMaxCandidateCounts() {
		const N = this.#strings.length;

		const maxCandidateCount = this.#hasUserMaxCandidateCount
			? this.#maxCandidateCount
			: N;

		const lenRange = this.#maxLength - this.#minLength + 1;
		const counts = new Uint32Array(lenRange);
		for (const [len, bucket] of this.#lengthBuckets)
			counts[len - this.#minLength] = bucket.length;
		const prefix = new Uint32Array(lenRange + 1);
		for (let i = 0; i < lenRange; i++)
			prefix[i + 1] = prefix[i] + counts[i];

		let MaxCandidateCountArray;
		if (maxCandidateCount <= 0xff)
			MaxCandidateCountArray = Uint8Array;
		else if (maxCandidateCount <= 0xffff)
			MaxCandidateCountArray = Uint16Array;
		else
			MaxCandidateCountArray = Uint32Array;

		const dynMaxCC = new MaxCandidateCountArray(this.#maxQueryLength + 1);

		for (let qLen = 0; qLen <= this.#maxQueryLength; qLen++) {
			const tolerance =
				this.#lengthTolerance === Number.POSITIVE_INFINITY
					? Math.max(qLen - this.#minLength, this.#maxLength - qLen)
					: this.#lengthTolerance;

			let poolStart = qLen - tolerance,
			    poolEnd   = qLen + tolerance;

			if (poolStart < this.#minLength)
				poolStart = this.#minLength;
			if (poolEnd > this.#maxLength)
				poolEnd = this.#maxLength;

			if (poolStart > poolEnd) {
				dynMaxCC[qLen] = 0;
				continue;
			}

			const startIndex = poolStart - this.#minLength,
			      endIndex   = poolEnd - this.#minLength,
			      poolSize   = prefix[endIndex + 1] - prefix[startIndex];

			if (!poolSize) {
				dynMaxCC[qLen] = 0;
				continue;
			}

			let dyn = Math.round(poolSize * this.#candidateFactor);
			if (dyn < 1)
				dyn = 1;
			if (dyn > poolSize)
				dyn = poolSize;
			if (dyn > maxCandidateCount)
				dyn = maxCandidateCount;

			dynMaxCC[qLen] = dyn;
		}

		this.#dynamicMaxCandidateCounts = dynMaxCC;
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

	#validateMaxQueryLength(maxQueryLength) {
		if (!Number.isInteger(maxQueryLength) || maxQueryLength <= 0)
			throw new Error('maxQueryLength must be a positive integer');
	}

	#OSADistance(query, candidate, bestDistance = Infinity) {
		const qLen = query.length,
		      cLen = candidate.length,
		      cols = cLen + 1;

		for (let j = 0; j < cols; j++)
			this.#prevRow[j] = j;

		for (let i = 1; i <= qLen; i++) {
			const qC = query[i - 1];
			let rowMin = (this.#currRow[0] = i);
			for (let j = 1; j <= cLen; j++) {
				const cC = candidate[j - 1];
				const cost = qC === cC ? 0 : 1;

				let distance = this.#prevRow[j] + 1; // deletion
				const insertion    = this.#currRow[j - 1] + 1,
				      substitution = this.#prevRow[j - 1] + cost;

				if (insertion < distance)
					distance = insertion;
				if (substitution < distance)
					distance = substitution;

				if (i > 1 && j > 1 &&
				    qC === candidate[j - 2] && query[i - 2] === cC) {
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
			this.#prevRow     = this.#currRow;
			this.#currRow     = temp;
		}

		return this.#prevRow[cLen];
	}

	/**
	 * @param {string} query
	 * @param {number} [maxDistance]
	 * Maximum distance allowed for a match to be considered valid
	 * @returns {string | null}
	 */
	getClosest(query, maxDistance = Infinity) {
		if (typeof query !== 'string') {
			logger.warning('[StringMatcher] getClosest: not a string:', query);
			return null;
		}
		if (!query)
			return null;
		const qLen = query.length;
		if (qLen > this.#maxQueryLength) {
			logger.warning('[StringMatcher] getClosest: query too long:', qLen);
			return null;
		}
		if (maxDistance !== Number.POSITIVE_INFINITY &&
		    (!Number.isInteger(maxDistance) || maxDistance < this.#earlyExitDistance)) {
			logger.warning('[StringMatcher] getClosest: invalid maxDistance:',
			               maxDistance);
			maxDistance = Infinity;
		}

		if (!this.#caseSensitive)
			query = query.toLowerCase();

		const minLen = this.#minLength,
		      maxLen = this.#maxLength;

		let startLen;
		if (qLen < minLen)
			startLen = minLen;
		else if (qLen > maxLen)
			startLen = maxLen;
		else
			startLen = qLen;

		let tolerance =
			this.#lengthTolerance === Number.POSITIVE_INFINITY
				? Math.max(qLen - minLen, maxLen - qLen)
				: this.#lengthTolerance;

		if (tolerance > maxDistance)
			tolerance = maxDistance;

		let maxCandidateCount;
		if (this.#isDynamicMaxCandidateCount) {
			const dynMaxCC = this.#dynamicMaxCandidateCounts[qLen];
			if (!dynMaxCC)
				return null;
			maxCandidateCount = dynMaxCC;
		} else
			maxCandidateCount = this.#maxCandidateCount;

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
						if (cc >= maxCandidateCount)
							break buckets;
						continue buckets;
					}
				}
				if (cc >= maxCandidateCount)
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
	get candidateFactor() { return this.#candidateFactor; }
	get earlyExitDistance() { return this.#earlyExitDistance; }
	get maxQueryLength() { return this.#maxQueryLength; }

	get dynamicMaxCandidateCount() { return this.#isDynamicMaxCandidateCount; }

	set lengthTolerance(lengthTolerance) {
		this.#validateLengthTolerance(lengthTolerance);
		this.#lengthTolerance = lengthTolerance;
		if (this.#isDynamicMaxCandidateCount)
			this.#buildDynamicMaxCandidateCounts();
	}

	set maxCandidateCount(maxCandidateCount) {
		this.#validateMaxCandidateCount(maxCandidateCount);
		this.#maxCandidateCount =
			Math.min(this.#strings.length, maxCandidateCount);
		this.#hasUserMaxCandidateCount = true;
		if (this.#isDynamicMaxCandidateCount)
			this.#buildDynamicMaxCandidateCounts();
	}

	set earlyExitDistance(earlyExitDistance) {
		this.#validateEarlyExitDistance(earlyExitDistance);
		this.#earlyExitDistance = earlyExitDistance;
	}
}
