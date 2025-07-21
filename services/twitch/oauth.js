import config from '../../config.json' with { type: 'json' };
import logger from '../logger.js';

async function validateToken(
	label,
	token,
	clientId,
	login = config.bot.login,
	id = config.bot.id
) {
	const res = await fetch('https://id.twitch.tv/oauth2/validate', {
		headers: {
			Authorization: `OAuth ${token}`,
		},
	});
	if (!res.ok) throw new Error(JSON.stringify(await res.json()));

	const body = await res.json();

	label ||= 'OAuth token';
	if (clientId && body.client_id !== clientId)
		throw new Error(
			`${label} client id mismatch: expected ${clientId}, got ${body.client_id}`
		);
	if (body.login !== login)
		throw new Error(
			`${label} login mismatch: expected ${login}, got ${body.login}`
		);
	if (body.user_id !== id)
		throw new Error(
			`${label} id mismatch: expected ${id}, got ${body.user_id}`
		);

	logger.debug(`[OAUTH] ${label}: scopes:`, body.scopes);
}

export default {
	validateToken,
};
