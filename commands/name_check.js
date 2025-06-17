import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

const MAX_USERNAMES_PRE_FILTER = 100000;
const MAX_USERNAMES_POST_FILTER = 2500;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;
const LATENCY_SAMPLE_SIZE = 5;

export default {
	name: 'namecheck',
	// prettier-ignore
	aliases: [
		'namescheck',
		'checkname', 'checknames',
		'name', 'names'
	],
	description: 'check username(s) availability',
	unsafe: false,
	lock: 'GLOBAL',
	flags: [
		{
			name: 'maxRetries',
			aliases: ['r', 'retries'],
			type: 'int',
			required: false,
			defaultValue: 3,
			description: 'max retries per username (default: 3, min: 0, max: 10)',
			validator: v => v >= 0 && v <= 10,
		},
		{
			name: 'silent',
			aliases: ['s', 'silent'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'do not send progress messages',
		},
	],
	// prettier-ignore
	execute: async msg => {
		if (!msg.args.length)
			return { text: 'no usernames provided', mention: true };
		const usernames = new Set();
		for (let i = 0; i < msg.args.length; i++) {
			const u = msg.args[i].toLowerCase();
			if (!usernames.has(u) && utils.regex.patterns.username.test(u)) {
				usernames.add(u);
				if (usernames.size >= MAX_USERNAMES_PRE_FILTER)
					break;
			}
		}
		if (!usernames.size)
			return { text: 'no valid usernames provided', mention: true };

		const { maxRetries, silent } = msg.commandFlags;

		if (usernames.size > BATCH_SIZE) {
			if (!silent)
				msg.send(`getting ${usernames.size} users ` +
				         'to exclude existing accounts...',
				         false, true);
			try {
				await excludeExisting(usernames);
			} catch (err) {
				logger.error('error getting users:', err);
				return { text: 'error getting users', mention: true };
			}
		}

		const available     = [];
		const failed        = [];
		const latencies     = [];
		const retryAttempts = new Map();
		const queue         = Array.from(usernames);
		const totalBatches  = Math.ceil(queue.length / BATCH_SIZE);

		if (!silent && totalBatches > 1 &&
		    totalBatches <= LATENCY_SAMPLE_SIZE)
			msg.send(`checking ${usernames.size} usernames ` +
			         `(${totalBatches} batches)...`, false, true);

		for (let i = 0; queue.length; i++) {
			const batch = queue.splice(0, BATCH_SIZE);
			const t0 = performance.now();
			await processBatch(batch, available, failed,
			                   retryAttempts, queue, maxRetries);
			const t1 = performance.now();
			const progress = getProgressMessage(silent, i, latencies,
			                                    t0, t1, totalBatches,
			                                    usernames.size);
			if (progress)
				msg.send(progress, false, true);
			if (queue.length)
				await utils.sleep(BATCH_DELAY_MS);
		}

		if (!available.length) {
			if (!failed.length)
				return {
					text:
						usernames.size === 1
							? `@${usernames.values().next().value} is not available`
							: `none of ${usernames.size} usernames are available`,
					mention: true,
				};
			return {
				text:
					`all usernames failed after ${maxRetries} ` +
					utils.format.plural(maxRetries, 'retry', 'retries'),
				mention: true,
			};
		}

		if (usernames.size === 1)
			return {
				text: `@${usernames.values().next().value} is available`,
				mention: true,
			};

		const responseParts = [`${available.length}/${usernames.size} available`];
		const lines = [`available (${available.length}):`];
		for (let i = 0; i < available.length; lines.push(available[i++]));
		if (failed.length) {
			responseParts[0] += ` (${failed.length} failed)`;
			lines.push(`\nfailed (${failed.length}):`);
			for (let i = 0; i < failed.length; lines.push(failed[i++]));
		}

		try {
			const link = await paste.create(lines.join('\n'));
			responseParts.push(link);
		} catch (err) {
			logger.error('error creating paste:', err);
			responseParts.push('error creating paste');
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

// prettier-ignore
async function processBatch(batch, available, failed, retryAttempts, queue,
                            maxRetries) {
	try {
		const res = await twitch.gql.request({ query: constructQuery(batch) });

		for (let i = 0; i < batch.length; i++) {
			const n = batch[i], key = `_${n}`;
			if (key in res.data && res.data[key] !== null) {
				if (res.data[key] === true)
					available.push(n);
			} else
				processFailedUsername(n, retryAttempts, queue,
				                      failed, maxRetries);
		}
	} catch (err) {
		logger.error('error getting usernames availability status:', err);
		for (let i = 0; i < batch.length; i++)
			processFailedUsername(batch[i], retryAttempts, queue,
			                      failed, maxRetries);
	}
}

function constructQuery(batch) {
	return `
query {
	${batch.map(n => `_${n}: isUsernameAvailable(username: "${n}")`).join('\n\t')}
}`;
}
// prettier-ignore
function getProgressMessage(silent, i, latencies, t0, t1, totalBatches,
                            totalUsernames) {
	if (silent)
		return null;
	if (latencies.push(t1 - t0) > LATENCY_SAMPLE_SIZE)
		latencies.shift();
	if (totalBatches <= LATENCY_SAMPLE_SIZE ||
	    (i + 1) % LATENCY_SAMPLE_SIZE || i + 1 >= totalBatches)
		return null;

	const latency = utils.stats.median(latencies),
		stdDev = utils.stats.stdDev(latencies, true);
	const eta = utils.duration.format(
		(totalBatches - (i + 1)) * (BATCH_DELAY_MS + latency),
		{ shortForm: false }
	);
	return `checking ${totalUsernames} usernames ` +
	       `(${i + 1}/${totalBatches} batches done, ` +
	       `latency: ~${Math.round(latency)}ms ` +
	       `+/-${Math.round(stdDev)}ms std dev, ETA: ${eta})...`;
}

async function excludeExisting(usernames) {
	const arr = Array.from(usernames);
	const usersMap = await twitch.helix.user.getMany(arr);

	for (let i = 0; i < arr.length; i++) {
		const u = arr[i];
		if (usersMap.has(u)) usernames.delete(u);
	}

	if (usernames.size > MAX_USERNAMES_POST_FILTER) {
		const it = usernames.values();
		for (let i = 0, N = usernames.size - MAX_USERNAMES_POST_FILTER; i < N; i++)
			usernames.delete(it.next().value);
	}
}

function processFailedUsername(u, retryAttempts, queue, failed, maxRetries) {
	const retries = (retryAttempts.get(u) || 0) + 1;
	if (retries <= maxRetries) {
		retryAttempts.set(u, retries);
		queue.push(u);
	} else failed.push(u);
}
