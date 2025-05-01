import logger from '../logger.js';

async function validateToken(token, clientId, login, id) {
	const res = await fetch('https://id.twitch.tv/oauth2/validate', {
		headers: {
			Authorization: `OAuth ${token}`,
		},
	});
	if (!res.ok) throw new Error(JSON.stringify(await res.json()));

	const body = await res.json();

	if (body.client_id !== clientId)
		throw new Error(
			`client id mismatch: expected ${clientId}, got ${body.client_id}`
		);
	if (body.login !== login)
		throw new Error(`login mismatch: expected ${login}, got ${body.login}`);
	if (body.user_id !== id)
		throw new Error(`id mismatch: expected ${id}, got ${body.user_id}`);

	logger.debug('[OAUTH] scopes:', body.scopes);
}

export default {
	validateToken,
};
