import os from 'os';
import hermes from '../services/twitch/hermes/client.js';
import { joinResponseParts, formatBytes } from '../utils/formatters.js';
import { formatDuration } from '../utils/duration.js';

export default {
	name: 'ping',
	aliases: [],
	description: 'show bot status',
	unsafe: false,
	flags: [
		{
			name: 'host',
			aliases: ['h', 'host'],
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'print host information',
		},
	],
	execute: async msg => {
		if (msg.commandFlags.host) {
			const totalMem = os.totalmem();
			const usedMem = totalMem - os.freemem();

			return {
				text: joinResponseParts([
					`uptime: ${formatDuration(os.uptime() * 1000, 2)}`,
					`memory: ${formatBytes(usedMem)}/${formatBytes(totalMem)}`,
					`host: ${os.type()}`,
					`kernel: ${os.release()}`,
					`arch: ${os.machine()}`,
				]),
				mention: true,
			};
		}

		const before = performance.now();
		await msg.client.ping();
		return {
			text: joinResponseParts([
				`tmi: ${Math.floor(performance.now() - before)}ms`,
				`handler: ${(before - msg.receivedAt).toFixed(2)}ms`,
				`uptime: ${formatDuration(Date.now() - msg.client.connectedAt, 2)}`,
				`memory: ${formatBytes(process.memoryUsage().heapTotal)}`,
				`channels: ${msg.client.joinedChannels.size}`,
				`irc: ${msg.client.connections.length}`,
				`hermes: ${hermes.connections.length}`,
				`node: ${process.version}`,
			]),
			mention: true,
		};
	},
};
