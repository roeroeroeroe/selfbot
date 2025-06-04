import * as constants from './constants.js';
import gql from './gql/index.js';
import helix from './helix/index.js';
import hermes from './hermes/client.js';
import oauth from './oauth.js';
import chat from './chat/index.js';

async function cleanup() {
	await chat.cleanup();
	await hermes.cleanup();
}

export default {
	...constants,
	gql,
	helix,
	hermes,
	oauth,
	chat,
	cleanup,
};
