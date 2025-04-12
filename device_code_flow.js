#!/usr/bin/env node

const CLIENT_ID = 'kd1unb4b3q4t58fwlpcbzcbnm76a8fp';
const SCOPES = 'analytics:read:extensions analytics:read:games bits:read \
channel:bot channel:edit:commercial channel:manage:ads channel:manage:broadcast \
channel:manage:extensions channel:manage:guest_star channel:manage:moderators \
channel:manage:polls channel:manage:predictions channel:manage:raids \
channel:manage:redemptions channel:manage:schedule channel:manage:videos \
channel:manage:vips channel:moderate channel:read:ads channel:read:charity \
channel:read:editors channel:read:goals channel:read:guest_star \
channel:read:hype_train channel:read:polls channel:read:predictions \
channel:read:redemptions channel:read:stream_key channel:read:subscriptions \
channel:read:vips chat:edit chat:read clips:edit moderation:read \
moderator:manage:announcements moderator:manage:automod \
moderator:manage:automod_settings moderator:manage:banned_users \
moderator:manage:blocked_terms moderator:manage:chat_messages \
moderator:manage:chat_settings moderator:manage:guest_star \
moderator:manage:shield_mode moderator:manage:shoutouts \
moderator:manage:unban_requests moderator:manage:warnings \
moderator:read:automod_settings moderator:read:blocked_terms \
moderator:read:chat_settings moderator:read:chatters moderator:read:followers \
moderator:read:guest_star moderator:read:moderators moderator:read:shield_mode \
moderator:read:shoutouts moderator:read:suspicious_users \
moderator:read:unban_requests moderator:read:vips user:bot user:edit \
user:edit:broadcast user:edit:follows user:manage:blocked_users \
user:manage:chat_color user:manage:whispers user:read:blocked_users \
user:read:broadcast user:read:chat user:read:email user:read:emotes \
user:read:follows user:read:moderated_channels user:read:subscriptions \
user:write:chat whispers:edit whispers:read';
const POLLING_MS = 1000;

async function oauthRequest(url, urlParams) {
	const res = await fetch(url, {
		method: 'POST',
		body: urlParams,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});
	if (!res.ok) throw new Error(JSON.stringify(await res.json()));

	return await res.json();
}

async function main() {
	let deviceCodeResponse;
	try {
		deviceCodeResponse = await oauthRequest(
			'https://id.twitch.tv/oauth2/device',
			new URLSearchParams({
				client_id: CLIENT_ID,
				scopes: SCOPES,
			})
		);
	} catch (err) {
		fatal(`error getting device code: ${err.message}`);
	}

	const userCode = deviceCodeResponse.user_code || '';
	const deviceCode = deviceCodeResponse.device_code || '';
	const verificationUrl =
		deviceCodeResponse.verification_uri || 'https://www.twitch.tv/activate';

	if (!userCode || !deviceCode)
		fatal(
			`unexpected response format: no user_code or device_code: ${JSON.stringify(deviceCodeResponse)}`
		);

	const expiresIn = (deviceCodeResponse.expires_in || 1800) * 1000;
	const expiresAt = Date.now() + expiresIn;
	log(
		`${verificationUrl}\ncode: ${userCode} (expires in ${expiresIn / 1000 / 60} minutes)`
	);

	const tokenPayload = new URLSearchParams({
		client_id: CLIENT_ID,
		device_code: deviceCode,
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
	});

	while (true) {
		if (Date.now() >= expiresAt) fatal('code expired');
		try {
			const tokenResponse = await oauthRequest(
				'https://id.twitch.tv/oauth2/token',
				tokenPayload
			);
			if (!tokenResponse.access_token)
				fatal(
					`unexpected response format: no access_token: ${JSON.stringify(tokenResponse)}`
				);
			log(
				`${JSON.stringify(tokenResponse)}\n\naccess_token: ${tokenResponse.access_token}`
			);
			break;
		} catch (err) {
			const errorBody = JSON.parse(err.message);
			if (errorBody.message !== 'authorization_pending')
				fatal(`error getting access token: ${err.message}`);
		} finally {
			await new Promise(r => setTimeout(r, POLLING_MS));
		}
	}
}

const log = str => process.stdout.write(str + '\n');
const fatal = str => { process.stderr.write(str + '\n'); process.exit(1); };

main().catch(err =>
	fatal(`unexpected error: ${err.stack ?? err.message ?? err}`)
);
