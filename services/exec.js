import vm from 'vm';
import { promisify } from 'util';
import { exec } from 'child_process';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';

const execAsync = promisify(exec);

async function shell(command, timeout = 5000) {
	if (!config.shell) throw new Error("'config.shell' is not set");
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
			exitCode: 0,
			error: null,
			timedOut: false,
		};
	} catch (err) {
		let exitCode = null,
			error = null;
		if (typeof err.code === 'number') {
			exitCode = err.code;
			logger.error(
				`shell command "${command}" failed`,
				`(exit code ${exitCode}):`,
				err
			);
		} else {
			error = err;
			logger.error(`shell command "${command}" failed:`, err);
		}
		return {
			stdout: err.stdout?.trim() || '',
			stderr: err.stderr?.trim() || '',
			exitCode,
			error,
			timedOut: err.killed && err.signal === 'SIGTERM',
		};
	}
}

async function js(input, context = {}, timeout = 3000) {
	const script = new vm.Script(`(async () => { ${input} })();`);
	const contextKeysString = Object.keys(context).join(',');

	logger.debug(
		`[EXEC] js: executing "${input}" with context: ${contextKeysString}`
	);
	try {
		const result = await script.runInContext(vm.createContext(context), {
			timeout,
		});
		logger.debug('[EXEC] js: got result:', result);
		return result;
	} catch (ctxErr) {
		const err = new Error(ctxErr.message);
		err.name = ctxErr.name;
		err.stack = ctxErr.stack;
		logger.error(
			`failed to run "${input}" with context ${contextKeysString}:`,
			err
		);
		throw err;
	}
}

export default {
	shell,
	js,
};
