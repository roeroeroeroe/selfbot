import config from '../../config.json' with { type: 'json' };
import twitch from '../twitch/index.js';
import assert from './assert.js';

const validClientIds = Object.values(twitch.CLIENT_IDS);
const dcfClientIds = [twitch.CLIENT_IDS.ANDROID, twitch.CLIENT_IDS.TV];

const noop = () => {};
// prettier-ignore
const validators = {
	TWITCH_IRC_TOKEN: v => {
		if (config.twitch.sender.backend !== 'irc') return;
		assert.nonEmptyString(v);
		return twitch.oauth.validateToken('IRC', v, null);
	},
	TWITCH_GQL_CLIENT_ID: v => assert.stringOneOf(v, dcfClientIds),
	TWITCH_GQL_TOKEN: v => {
		assert.nonEmptyString(v);
		return twitch.oauth.validateToken('GQL', v, process.env.TWITCH_GQL_CLIENT_ID);
	},
	TWITCH_HERMES_CLIENT_ID: v => assert.stringOneOf(v, validClientIds),
	TWITCH_HERMES_TOKEN: v => {
		if (!config.twitch.hermes.subscribeToUserTopics) return;
		assert.nonEmptyString(v);
		return twitch.oauth.validateToken('HERMES', v, process.env.TWITCH_HERMES_CLIENT_ID);
	},
	DB_USER: assert.nonEmptyString,
	DB_HOST: noop,
	DB_NAME: assert.nonEmptyString,
	DB_PASSWORD: assert.nonEmptyString,
	DB_PORT: v => {
		if (!v) return;
		assert.port(+v);
	},
	DB_MAX_CLIENTS: v => {
		if (!v) return;
		assert.nonNegativeInt(+v);
	},
	REDIS_USER: noop,
	REDIS_HOST: noop,
	REDIS_PASSWORD: noop,
	REDIS_PORT: noop,
	REDIS_SOCKET: v => {
		if (!v || (config.cache !== 'redis' && config.cache !== 'valkey')) return;
		assert.uds(v);
	},
	WOLFRAM_ALPHA_API_KEY: noop,
};

async function validateVariables() {
	for (const k in validators)
		try {
			await validators[k](process.env[k]);
		} catch (err) {
			throw new Error(`environment variable '${k}' ${err.message}`);
		}
}

export default {
	validate: validateVariables,
};
