import gql from './gql/index.js';
import helix from './helix/index.js';
import hermes from './hermes/client.js';
import oauth from './oauth.js';
import tmi from './tmi.js';

let client;

function getTMIClient() {
	if (!client) client = new tmi.Client();
	return client;
}

export default {
	gql,
	helix,
	hermes,
	oauth,
	tmi,

	getTMIClient,
};
