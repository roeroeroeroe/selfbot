import { promisify } from 'util';
import { exec } from 'child_process';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';

const execAsync = promisify(exec);

async function shell(command, timeout = 5000) {
	logger.debug(
		`[EXEC] shell: executing "${command}" with ${config.shell}, timeout: ${timeout}ms`
	);
	try {
		const result = await execAsync(command, {
			encoding: 'utf-8',
			shell: config.shell,
			timeout,
		});
		logger.debug('[EXEC] shell: got result:', result);

		return {
			stdout: result.stdout.trim(),
			stderr: result.stderr.trim(),
			exitStatus: result.code,
			timedOut: false,
		};
	} catch (err) {
		logger.error(
			`shell command "${command}" failed (exit status ${err.code}):`,
			err
		);

		return {
			stdout: err.stdout ? err.stdout.trim() : '',
			stderr: err.stderr ? err.stderr.trim() : '',
			exitStatus: err.code,
			timedOut: err.killed && err.signal === 'SIGTERM',
		};
	}
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function js(input, context = {}) {
	const contextKeys = [],
		contextValues = [];
	for (const k in context) {
		contextKeys.push(k);
		contextValues.push(context[k]);
	}
	logger.debug(
		`[EXEC] js: executing "${input}" with context ${contextKeys.join(',')}`
	);

	const func = new AsyncFunction(
		...contextKeys,
		`return await (async () => {
			${input}
		})();`
	);

	try {
		const result = await func(...contextValues);
		logger.debug('[EXEC] js: got result:', result);
		return result;
	} catch (err) {
		logger.error(
			`failed to run "${input}" with context ${contextKeys.join(',')}:`,
			err
		);
		throw err;
	}
}

export default {
	shell,
	js,
};
