import { promisify } from 'util';
import { exec } from 'child_process';
import config from '../config.json' with { type: 'json' };
import logger from './logger.js';

const execAsync = promisify(exec);

export default async function executeCommand(command, timeout = 5000) {
	try {
		const result = await execAsync(command, {
			encoding: 'utf-8',
			shell: config.shell,
			timeout,
		});

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
