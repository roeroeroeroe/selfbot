import config from '../../../../config.json' with { type: 'json' };
import logger from '../../../logger.js';
import db from '../../../db/index.js';
import twitch from '../../index.js';
import metrics from '../../../metrics/index.js';
import utils from '../../../../utils/index.js';
import cache from '../../../cache/index.js';
import { STALE_PREDICTIONS_SWEEP_INTERVAL_MS } from './constants.js';

const predictionStates = new Map();
let sweepInterval = null;

export const subs = {
	user: ['predictions-user-v1'],
	channel: ['predictions-channel-v1'],
};

// prettier-ignore
export async function init() {
	let dumped;
	try {
		dumped = (await cache.get(cache.PREDICTION_STATES_KEY)) || [];
	} catch (err) {
		logger.error('error getting cached prediction states:', err);
		sweepInterval = setInterval(
			sweepStale,
			STALE_PREDICTIONS_SWEEP_INTERVAL_MS
		);
		return;
	}
	for (let i = 0; i < dumped.length; i++) {
		const state = await hydrateState(dumped[i]);
		state.clearBetTimeout = () => {
			clearTimeout(state.scheduledBetTimeout);
			state.scheduledBetTimeout = null;
		};
		const delay = calculateDelay(state.createdAt, state.windowMs,
		                             state.betDelayPercent);
		if (delay && state.status === 'ACTIVE' && !state.betOutcomeId)
			state.scheduledBetTimeout = setTimeout(handleScheduledBet,
			                                       delay, state.id);
		predictionStates.set(state.id, state);
	}
	sweepInterval = setInterval(sweepStale, STALE_PREDICTIONS_SWEEP_INTERVAL_MS);
}

const outcomeSelectors = {
	mostPopular: outcomes => {
		let best = outcomes[0];
		for (let i = 1, o; i < outcomes.length; i++)
			if ((o = outcomes[i]).total_users > best.total_users) best = o;
		return best;
	},
	highestMultiplier: outcomes => {
		let best = outcomes[0];
		for (let i = 1, o; i < outcomes.length; i++)
			if ((o = outcomes[i]).total_points < best.total_points) best = o;
		return best;
	},
	poolMedian: outcomes => {
		return outcomes.slice().sort((a, b) => a.total_points - b.total_points)[
			outcomes.length >>> 1
		];
	},
	random: outcomes => {
		return outcomes[(Math.random() * outcomes.length) | 0];
	},
};

function selectOutcome(outcomes, strategy) {
	const selector = outcomeSelectors[strategy];
	if (!selector)
		throw new Error(`unknown outcome selection strategy: ${strategy}`);
	return selector(outcomes);
}

function calculateDelay(createdAt, windowMs, betDelayPercent) {
	return Math.max(
		0,
		new Date(createdAt).getTime() +
			windowMs * (betDelayPercent / 100) -
			Date.now()
	);
}
// prettier-ignore
function calculateBetAmount(cfg, balance, poolPoints) {
	if (!balance)
		return 0;
	const { min, max, poolFraction, maxBalanceFraction, onInsufficientFunds } =
		cfg;
	const balanceCap = Math.floor(balance * maxBalanceFraction);
	const rawBet     = Math.floor(poolPoints * poolFraction);
	let bet = Math.max(min, Math.min(max, rawBet, balanceCap));
	if (bet > balance)
		switch (onInsufficientFunds) {
			case 'betAll':
				bet = balance;
				break;
			case 'abort':
				bet = 0;
				break;
			default:
				throw new Error(
					`unknown insufficient funds strategy: ${onInsufficientFunds}`
				);
		}
	logger.debug(`[Hermes] calculateBetAmount: min=${min}, max=${max},`,
	             `poolFraction=${poolFraction},`,
	             `maxBalanceFraction=${maxBalanceFraction},`,
	             `balance=${balance}, balanceCap=${balanceCap},`,
	             `poolPoints=${poolPoints}, rawBet=${rawBet}, bet=${bet}`);
	return bet;
}

async function getBalance(channelLogin) {
	try {
		return +(await twitch.gql.channel.getSelfChannelPointsBalance(
			channelLogin
		));
	} catch (err) {
		logger.error('error getting channel points balance:', err);
		return 0;
	}
}

async function placeBet(predictionId, outcomeId, amount) {
	try {
		const res = await twitch.gql.channel.placePredictionBet(
			predictionId,
			outcomeId,
			amount
		);
		const errCode = res.makePrediction.error?.code;
		if (errCode) {
			logger.error(`error placing prediction bet: ${errCode}`);
			return false;
		}
		return !!res.makePrediction.prediction?.points;
	} catch (err) {
		logger.error('error placing prediction bet:', err);
		return false;
	}
}
// prettier-ignore
async function hydrateState(cached) {
	try {
		const res = await twitch.gql.channel.getPredictionEvent(cached.id);
		const prediction = res.predictionEvent;
		if (!prediction)
			throw new Error('no such event');
		return {
			id: cached.id,
			channelId: cached.channelId,
			channelLogin: cached.channelLogin,
			betOutcomeId: cached.betOutcomeId,
			betAmount: cached.betAmount,
			betDelayPercent: cached.betDelayPercent,
			createdAt: prediction.createdAt,
			windowMs: prediction.predictionWindowSeconds * 1000,
			title: prediction.title,
			status: prediction.status,
			outcomes: prediction.outcomes,
			sweepOnNext: false,
		};
	} catch (err) {
		logger.warning(`[Hermes] hydrateState: failed to hydrate`,
		               `prediction ${cached.id}, using cache:`, err);
		return { ...cached };
	}
}
// prettier-ignore
async function sweepStale() {
	for (const [id, state] of predictionStates.entries()) {
		let status, channelName;
		try {
			const res = await twitch.gql.channel.getPredictionEvent(id);
			status = res.predictionEvent?.status;
			if (!status) {
				logger.debug('[Hermes] dropping unknown prediction',
				             `"${state.title}" (${id})`);
				state.clearBetTimeout();
				predictionStates.delete(id);
				continue;
			}
			const user = res.predictionEvent.channel?.owner;
			channelName =
				user ? utils.pickName(user.login, user.displayName) : 'N/A';
		} catch (err) {
			logger.error('error getting prediction event:', err);
			continue;
		}
		if (status !== state.status && !(state.sweepOnNext = !state.sweepOnNext)) {
			logger.warning('[Hermes] status mismatch for prediction',
			               `"${state.title}" (${id}) in #${channelName}:`,
			               `state: ${state.status}, actual: ${status}; dropping`);
			state.clearBetTimeout();
			predictionStates.delete(id);
			continue;
		}
		switch (status) {
			case 'LOCKED':
				if (!state.betOutcomeId) {
					logger.debug('[Hermes] dropping LOCKED unbet prediction',
					             `"${state.title}" (${id}) in #${channelName}`);
					state.clearBetTimeout();
					predictionStates.delete(id);
				}
				break;
			case 'CANCEL_PENDING':
			case 'RESOLVE_PENDING':
				break;
			case 'CANCELED':
			case 'RESOLVED':
				logger.debug(`[Hermes] dropping ${status} prediction`,
				             `"${state.title}" (${id}) in #${channelName}`);
				state.clearBetTimeout();
				predictionStates.delete(id);
				break;
		}
	}
}
// prettier-ignore
async function handleScheduledBet(predictionId) {
	const state = predictionStates.get(predictionId);
	if (!state || state.status !== 'ACTIVE' || state.betOutcomeId)
		return;
	if (!state.outcomes?.length)
		return logger.debug('[Hermes]: malformed prediction',
		                    `"${state.title}" (${state.id}): 0 outcomes`);
	const balance = await getBalance(state.channelLogin);
	const cfg = config.twitch.hermes.autoBet;
	if (balance < cfg.minRequiredBalance)
		return;
	const bet = calculateBetAmount(
		cfg.strategy.bet,
		balance,
		utils.stats.sum(state.outcomes, o => o.total_points),
	);
	if (!bet)
		return;
	const outcome = selectOutcome(state.outcomes, cfg.strategy.outcomeSelection);
	if (await placeBet(state.id, outcome.id, bet)) {
		metrics.counter.increment(
			metrics.names.counters.HERMES_PREDICTIONS_BETS_PLACED
		);
		state.betOutcomeId = outcome.id;
		state.betAmount = bet;
		const outcomeUsers  = outcome.total_users + 1;
		const outcomePoints = outcome.total_points + bet;
		const poolPoints =
			utils.stats.sum(state.outcomes, o => o.total_points) + bet;
		const multiplier    = (poolPoints / outcomePoints).toFixed(2);
		return logger.info(`[Hermes] placed bet of ${bet} points on`,
		                   `"${outcome.title}" (users: ~${outcomeUsers},`,
		                   `points: ~${outcomePoints}, multiplier: ~${multiplier})`,
		                   `in prediction "${state.title}" (${state.id}) in`,
		                   `#${state.channelLogin}, pool points: ~${poolPoints}`);
	}
	logger.info(`[Hermes] failed to place bet of ${bet} points`,
	            `on "${outcome.title}" in prediction "${state.title}"`,
	            `(${state.id}) in #${state.channelLogin}`);
	state.clearBetTimeout();
	predictionStates.delete(state.id);
}
// prettier-ignore
async function handlePredictionResult(event, state, winOutcomeId,
                                      predictionResult, bet) {
	if (!predictionStates.has(state.id))
		return;
	state.clearBetTimeout();
	predictionStates.delete(state.id);
	const { channelLogin, outcomes, title, betOutcomeId } = state;
	const balance = await getBalance(channelLogin);
	if (!winOutcomeId)
		try {
			const res = await twitch.gql.channel.getPredictionEvent(state.id);
			winOutcomeId = res.predictionEvent?.winningOutcome?.id;
		} catch (err) {
			logger.error('error getting prediction event:', err);
		}
	let winOutcome, betOutcome;
	for (let i = 0; i < outcomes.length; i++) {
		const o = outcomes[i];
		if (o.id === winOutcomeId) {
			winOutcome = o;
			if (betOutcome)
				break;
		}
		if (o.id === betOutcomeId) {
			betOutcome = o;
			if (winOutcome)
				break;
		}
	}
	switch (predictionResult) {
		case 'WIN':
			logger.info(`[Hermes] ${event}: won prediction`,
			            `"${title}" (${state.id}) in #${channelLogin},`,
			            `current balance: ${balance}`);
			metrics.counter.increment(metrics.names.counters.HERMES_PREDICTIONS_WON);
			break;
		case 'LOSE':
			logger.info(`[Hermes] ${event}: lost prediction`,
			            `"${title}" (${state.id}) in #${channelLogin}`,
			            `(bet on "${betOutcome?.title || 'N/A'}",`,
			            `won "${winOutcome?.title || 'N/A'}"),`,
			            `current balance: ${balance}`);
			metrics.counter.increment(metrics.names.counters.HERMES_PREDICTIONS_LOST);
			break;
		case 'REFUND':
			logger.info(`[Hermes] ${event}: prediction "${title}" (${state.id})`,
			            `in #${channelLogin} canceled; refunded ${bet} points,`,
			            `current balance: ${balance}`);
			metrics.counter.increment(
				metrics.names.counters.HERMES_PREDICTIONS_REFUNDED
			);
			break;
		default:
			logger.debug(`[Hermes] ${event}: unknown prediction result`,
			             `${predictionResult} for "${title}" (${state.id})`,
			             `in #${channelLogin}`);
	}
}

export async function cleanup() {
	clearInterval(sweepInterval);
	sweepInterval = null;
	const dump = [];
	for (const state of predictionStates.values()) {
		state.clearBetTimeout();
		// eslint-disable-next-line no-unused-vars
		const { clearBetTimeout, scheduledBetTimeout, ...serializable } = state;
		dump.push(serializable);
	}
	await cache.set(cache.PREDICTION_STATES_KEY, dump);
	predictionStates.clear();
}
// prettier-ignore
export default {
	'event-created': async msg => {
		const cfg = config.twitch.hermes.autoBet;
		if (!cfg.enabled)
			return;
		const prediction = msg.data.event;
		if (cfg.ignoreOwnPredictions &&
		    prediction.created_by.user_id === config.bot.id)
			return logger.debug('[Hermes] event-created: skipping own',
			                    `prediction "${prediction.title}"`,
			                    `(${prediction.id})`);
		const channelLogin = (await db.channel.get(prediction.channel_id))?.login;
		if (!channelLogin)
			return logger.warning('[Hermes] event-created: unknown channel',
			                      `for prediction "${prediction.title}"`,
			                      `(${prediction.id}), channel id:`,
			                      prediction.channel_id);
		const balance = await getBalance(channelLogin);
		if (balance < cfg.minRequiredBalance)
			return logger.debug('[Hermes] event-created: insufficient balance',
			                    `(${balance}/${cfg.minRequiredBalance}) for`,
			                    `prediction "${prediction.title}" (${prediction.id})`,
			                    `in #${channelLogin}`);
		const createdAt       = prediction.created_at;
		const windowMs        = prediction.prediction_window_seconds * 1000;
		const betDelayPercent = cfg.strategy.betDelayPercent;
		const state = {
			id: prediction.id,
			channelId: prediction.channel_id,
			channelLogin,
			title: prediction.title,
			status: prediction.status,
			outcomes: prediction.outcomes,
			betOutcomeId: null,
			betAmount: null,
			sweepOnNext: false,
			createdAt,
			windowMs,
			betDelayPercent,
		};
		state.scheduledBetTimeout = setTimeout(
			handleScheduledBet,
			calculateDelay(createdAt, windowMs, betDelayPercent),
			prediction.id
		);
		state.clearBetTimeout = () => {
			clearTimeout(state.scheduledBetTimeout);
			state.scheduledBetTimeout = null;
		};
		predictionStates.set(prediction.id, state);
	},
	'event-updated': async msg => {
		const {
			id: predictionId,
			title,
			status,
			winning_outcome_id: winOutcomeId,
			outcomes,
		} = msg.data.event;
		const state = predictionStates.get(predictionId);
		if (!state)
			return;
		const { channelLogin, betAmount, betOutcomeId } = state;
		state.status = status;
		state.outcomes = outcomes;
		switch (status) {
			case 'LOCKED':
				state.clearBetTimeout();
				if (!state.betOutcomeId) {
					logger.debug(`[Hermes] event-updated: prediction`,
					             `"${title}" (${predictionId})`,
					             `in #${channelLogin} locked before bet`);
					predictionStates.delete(predictionId);
				}
				break;
			case 'CANCEL_PENDING':
				state.clearBetTimeout();
				break;
			case 'CANCELED':
				state.clearBetTimeout();
				if (betOutcomeId) {
					const balance = await getBalance(channelLogin);
					logger.info(`[Hermes] event-updated: prediction "${title}"`,
					            `(${predictionId}) in #${channelLogin}`,
					            `canceled; refunded ${betAmount} points,`,
					            `balance: ${balance}`);
					metrics.counter.increment(
						metrics.names.counters.HERMES_PREDICTIONS_REFUNDED
					);
				}
				predictionStates.delete(predictionId);
				break;
			case 'RESOLVED':
				if (!betOutcomeId)
					return;
				const result = betOutcomeId === winOutcomeId ? 'WIN' : 'LOSE';
				handlePredictionResult('event-updated', state, winOutcomeId,
				                       result, betAmount);
		}
	},
	// eslint-disable-next-line require-await
	'prediction-result': async msg => {
		const { event_id: predictionId, points, result } = msg.data.prediction;
		const state = predictionStates.get(predictionId);
		if (!state)
			return;
		handlePredictionResult('prediction-result', state, null,
		                       result.type, points);
	},
};
