export const API_URL = 'https://gql.twitch.tv/gql';
export const METHOD = 'POST';
export const HEADERS = {
	'Client-Id': process.env.TWITCH_ANDROID_CLIENT_ID,
	'Authorization': `OAuth ${process.env.TWITCH_ANDROID_TOKEN}`,
	'Content-Type': 'application/json',
};
export const MAX_OPERATIONS_PER_REQUEST = 35;
export const CONCURRENT_REQUESTS = 10;
