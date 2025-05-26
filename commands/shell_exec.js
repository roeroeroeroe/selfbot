import config from '../config.json' with { type: 'json' };
import exec from '../services/exec.js';
import utils from '../utils/index.js';

export default {
	name: 'exec',
	aliases: ['shell'],
	description:
		`execute command using ${config.shell}; ` +
		"to avoid conflicts with the bot's flag parser, use -- early",
	unsafe: true,
	lock: 'NONE',
	flags: [
		{
			name: 'timeout',
			aliases: ['t', 'timeout'],
			type: 'duration',
			required: false,
			defaultValue: 5000,
			description: 'execution timeout (default: 5s, min: 1s, max: 30s)',
			validator: v => v >= 1000 && v <= 30000,
		},
	],
	execute: async msg => {
		if (!msg.args.length) return { text: 'no command provided', mention: true };
		const command = msg.args.join(' ');
		const { stdout, stderr, exitStatus, timedOut } = await exec.shell(
			command,
			msg.commandFlags.timeout
		);

		const responseParts = [];
		if (timedOut) responseParts.push('command timed out');
		if (exitStatus) responseParts.push(`exit status: ${exitStatus}`);
		if (stdout) responseParts.push(`stdout: ${stdout}`);
		if (stderr) responseParts.push(`stderr: ${stderr}`);

		return {
			text: responseParts.length
				? utils.format.join(responseParts)
				: 'command produced no output',
			mention: true,
		};
	},
};
