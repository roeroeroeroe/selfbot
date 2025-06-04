import logger from './logger.js';

const TIMEOUT_MS = 5000;
const tasks = [];

function handleSigint(sigName = 'SIGINT', sigNumber = 2) {
	onSignal(sigName, null, sigNumber);
}

function handleSigterm(sigName = 'SIGTERM', sigNumber = 15) {
	onSignal(sigName, null, sigNumber);
}

function handleUncaught(err) {
	onSignal('uncaughtException', err);
}

function handleRejection(reason) {
	onSignal('unhandledRejection', reason);
}

process.on('SIGINT', handleSigint);
process.on('SIGTERM', handleSigterm);
process.on('uncaughtException', handleUncaught);
process.on('unhandledRejection', handleRejection);

function cleanup() {
	if (!tasks.length) return;
	return Promise.race([
		(async () => {
			for (let i = 0; i < tasks.length; i++)
				try {
					await tasks[i]();
				} catch (err) {
					logger.error('[SHUTDOWN] cleanup handler failed:', err);
				}
		})(),
		new Promise(res =>
			setTimeout(() => {
				logger.warning(`[SHUTDOWN] cleanup timeout of ${TIMEOUT_MS}ms reached`);
				res();
			}, TIMEOUT_MS)
		),
	]);
}

let shuttingDown = false;
async function onSignal(sigName, errOrReason, sigNumber) {
	if (shuttingDown)
		return logger.warning(`[SHUTDOWN] received ${sigName} while shutting down`);
	shuttingDown = true;

	if (errOrReason) logger.error(`${sigName}:`, errOrReason);
	else logger.info(`[SHUTDOWN] received ${sigName}`);

	process.removeListener('SIGINT', handleSigint);
	process.removeListener('SIGTERM', handleSigterm);
	process.removeListener('uncaughtException', handleUncaught);
	process.removeListener('unhandledRejection', handleRejection);

	const t0 = performance.now();
	await cleanup();
	const t1 = performance.now();
	logger.info(`[SHUTDOWN] cleanup finished in ${(t1 - t0).toFixed(3)}ms`);
	if (errOrReason) process.exit(1);
	if (typeof sigNumber === 'number') process.exit(128 + sigNumber);
	process.exit(0);
}

function register(fn) {
	if (typeof fn !== 'function')
		throw new Error('shutdown task must be a function');
	tasks.push(fn);
}

function unregister(fn) {
	const index = tasks.indexOf(fn);
	if (index !== -1) tasks.splice(index, 1);
}

export default {
	register,
	unregister,
};
