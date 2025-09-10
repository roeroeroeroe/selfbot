import countryCodes from '../data/country_codes.json' with { type: 'json' };
import stopwords from '../data/stopwords.json' with { type: 'json' };
import logger from '../services/logger.js';
import twitch from '../services/twitch/index.js';
import db from '../services/db/index.js';
import utils from '../utils/index.js';
import paste from '../services/paste/index.js';

const FACTOR_LABELS = {
	SUBSCRIPTION_SKUS: 'subscriptionSkus',
	UI_LANG: 'uiLang',
	STREAM_LANG: 'streamLang',
	USER_MESSAGES_LANG: 'userMessagesLang',
	CHANNEL_RECENT_MESSAGES_LANG: 'channelRecentMessagesLang',
	CHATTER_LANGS: 'chatterLangs',
	FOLLOWED_CHANNEL_LANGS: 'followedChannelLangs',
	DESCRIPTION: 'description',
};

const DEFAULT_BASE_WEIGHTS = {
	[FACTOR_LABELS.SUBSCRIPTION_SKUS]: 4.5,
	[FACTOR_LABELS.UI_LANG]: 3.5,
	[FACTOR_LABELS.STREAM_LANG]: 3,
	[FACTOR_LABELS.USER_MESSAGES_LANG]: 2,
	[FACTOR_LABELS.CHANNEL_RECENT_MESSAGES_LANG]: 1,
	[FACTOR_LABELS.CHATTER_LANGS]: 0.75,
	[FACTOR_LABELS.FOLLOWED_CHANNEL_LANGS]: 0.5,
	[FACTOR_LABELS.DESCRIPTION]: 0.5,
};
const DEFAULT_MIN_SCORE_THRESHOLD = 4.0;
const DEFAULT_CHATTER_SATURATION_POINT = 50;
const DEFAULT_FOLLOW_SATURATION_POINT = 50;

// prettier-ignore
const LANGUAGE_TO_COUNTRY_CODE = {
	ar: 'SA', asl: null, az: 'AZ', be: 'BY', bg: 'BG', bn: 'BD', ca: 'ES',
	cs: 'CZ', da: 'DK', de: 'DE', el: 'GR', en: 'US', en_gb: 'GB', es: 'ES',
	es_mx: 'MX', eu: 'ES', fi: 'FI', fr: 'FR', he: 'IL', hi: 'IN', hu: 'HU',
	id: 'ID', it: 'IT', ja: 'JP', kk: 'KZ', ko: 'KR', ms: 'MY', ne: 'NP',
	nl: 'NL', no: 'NO', other: null, pl: 'PL', pt: 'PT', pt_br: 'BR',
	ro: 'RO', ru: 'RU', sk: 'SK', sl: 'SI', sq: 'AL', sv: 'SE', ta: 'IN',
	tg: 'TJ', th: 'TH', tl: 'PH', tr: 'TR', uk: 'UA', vi: 'VN', zh: 'CN',
	zh_cn: 'CN', zh_hk: 'HK', zh_tw: 'TW',
};
const LANGUAGE_WEIGHT_OVERRIDES = { en: 0.5 };

const VALID_COUNTRY_CODES = new Set(Object.keys(countryCodes));

const STOPWORD_LANGUAGES = Object.keys(stopwords);
const STOPWORD_WORD_TO_LANGUAGES = new Map();
for (const lang of STOPWORD_LANGUAGES)
	for (const word of new Set(stopwords[lang]))
		if (!STOPWORD_WORD_TO_LANGUAGES.has(word))
			STOPWORD_WORD_TO_LANGUAGES.set(word, [lang]);
		else STOPWORD_WORD_TO_LANGUAGES.get(word).push(lang);

const chatterTypes = twitch.gql.channel.CHATTER_TYPES;

const alignSep = utils.format.DEFAULT_ALIGN_SEPARATOR;

const labelToFlagName = Object.create(null);
const weightFlags = [];
for (const l of Object.values(FACTOR_LABELS)) {
	const flagName = `w${l[0].toUpperCase()}${l.slice(1)}`;
	labelToFlagName[l] = flagName;
	const longOpt = `${l.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}-weight`;
	weightFlags.push({
		name: flagName,
		short: null,
		long: longOpt,
		type: 'float',
		required: false,
		defaultValue: DEFAULT_BASE_WEIGHTS[l],
		description: `base weight for ${l} (default: ${DEFAULT_BASE_WEIGHTS[l]}, min: 0)`,
		validator: v => v >= 0,
	});
}

export default {
	name: 'guessusercountry',
	aliases: ['guesscountry', 'usercountry'],
	description:
		"infer a user's country by aggregating weighted language signals",
	unsafe: false,
	lock: 'CHANNEL',
	flags: [
		{
			name: 'user',
			short: 'u',
			long: 'user',
			type: 'username',
			required: false,
			defaultValue: null,
			description: 'target user',
		},
		{
			name: 'minScore',
			short: 'm',
			long: 'min-score',
			type: 'float',
			required: false,
			defaultValue: DEFAULT_MIN_SCORE_THRESHOLD,
			description:
				'minimum confidence score to make a guess ' +
				`(default: ${DEFAULT_MIN_SCORE_THRESHOLD}, min: 0.1)`,
			validator: v => v >= 0.1,
		},
		{
			name: 'verbose',
			short: 'v',
			long: 'verbose',
			type: 'boolean',
			required: false,
			defaultValue: false,
			description: 'show per-factor contributions and final country scores',
		},
		{
			name: 'followsLimit',
			short: 'f',
			long: 'follows-limit',
			type: 'int',
			required: false,
			defaultValue: twitch.gql.DEFAULT_PAGINATION_LIMIT,
			description:
				'max follows to get ' +
				`(default: ${twitch.gql.DEFAULT_PAGINATION_LIMIT}, ` +
				`min: ${twitch.gql.DEFAULT_PAGE_SIZE}, ` +
				`max: ${twitch.gql.MAX_PAGINATION_LIMIT})`,
			validator: v =>
				v >= twitch.gql.DEFAULT_PAGE_SIZE &&
				v <= twitch.gql.MAX_PAGINATION_LIMIT,
		},
		{
			name: 'chatterSaturationPoint',
			short: null,
			long: 'chatter-saturation-point',
			type: 'int',
			required: false,
			defaultValue: DEFAULT_CHATTER_SATURATION_POINT,
			description:
				`saturation threshold for scaling the ${FACTOR_LABELS.CHATTER_LANGS} ` +
				'weight based on total count ' +
				`(default: ${DEFAULT_CHATTER_SATURATION_POINT}, min: 1)`,
			validator: v => v >= 1,
		},
		{
			name: 'followSaturationPoint',
			short: null,
			long: 'follow-saturation-point',
			type: 'int',
			required: false,
			defaultValue: DEFAULT_FOLLOW_SATURATION_POINT,
			description:
				`saturation threshold for scaling the ${FACTOR_LABELS.FOLLOWED_CHANNEL_LANGS} ` +
				'weight based on total count ' +
				`(default: ${DEFAULT_FOLLOW_SATURATION_POINT}, min: 1)`,
			validator: v => v >= 1,
		},
		...weightFlags,
	],
	// prettier-ignore
	execute: async msg => {
		const userInput = utils.resolveLoginInput(
			msg.commandFlags.user, msg.args[0]
		);
		if (!userInput)
			return { text: 'user is required', mention: true };

		let user;
		try {
			user = await twitch.gql.user.resolve(userInput);
			if (!user)
				return { text: 'user does not exist', mention: true };
		} catch (err) {
			logger.error(`error resolving user ${userInput}:`, err);
			return { text: 'error resolving user', mention: true };
		}

		const {
			minScore, verbose, followsLimit,
			chatterSaturationPoint, followSaturationPoint,
		} = msg.commandFlags;

		const countryScores = Object.create(null);
		const verboseProgressLines = [
			`factor${alignSep}country${alignSep}Δscore${alignSep}score0${alignSep}score1`,
		];
		let applyDelta;
		if (verbose)
			applyDelta = function (label, country, delta) {
				if (!country)
					return;
				const before = countryScores[country] ?? 0,
				      after  = (countryScores[country] = before + delta);
				verboseProgressLines.push(
					`${label}${alignSep}${country}${alignSep}+${delta.toFixed(3)}` +
					`${alignSep}${before.toFixed(3)}${alignSep}${after.toFixed(3)}`
				);
			};
		else
			applyDelta = function (_, country, delta) {
				if (!country)
					return;
				countryScores[country] =
					(countryScores[country] ?? 0) + delta;
			};

		const weights = Object.create(null);
		for (const label in labelToFlagName)
			weights[label] = msg.commandFlags[labelToFlagName[label]];

		const [
			uiLangs, streamLang, userMessages, channelRecentMessages,
			chatters, follows, description,
		] = await Promise.all([
			getUILanguages([user.login]), getStreamLanguage(user.login),
			getUserMessages(user.id), getRecentMessages(user.login),
			getChatters(user.login), getFollows(user.login, followsLimit),
			getDescription(user.login),
		]);
		processUILanguage(uiLangs, weights[FACTOR_LABELS.UI_LANG], applyDelta);
		processStreamLanguage(streamLang, weights[FACTOR_LABELS.STREAM_LANG],
		                      applyDelta);
		processMessages(FACTOR_LABELS.USER_MESSAGES_LANG, userMessages,
		                weights[FACTOR_LABELS.USER_MESSAGES_LANG],
		                applyDelta);
		processMessages(FACTOR_LABELS.CHANNEL_RECENT_MESSAGES_LANG,
		                channelRecentMessages,
		                weights[FACTOR_LABELS.CHANNEL_RECENT_MESSAGES_LANG],
		                applyDelta);
		processDescription(description, weights[FACTOR_LABELS.DESCRIPTION],
		                   applyDelta);

		const chatterCounts = Object.create(null);
		if (chatters?.logins?.length) {
			const langs = await getUILanguages(chatters.logins);
			if (langs?.length)
				processChatters(chatters.logins.length, chatters.totalCount,
				                langs, weights[FACTOR_LABELS.CHATTER_LANGS],
				                applyDelta, chatterSaturationPoint,
				                verbose, chatterCounts);
		}

		const followCounts = Object.create(null), skuStats = Object.create(null);
		if (follows?.users?.length) {
			processFollows(follows.users, follows.totalCount,
			               weights[FACTOR_LABELS.FOLLOWED_CHANNEL_LANGS],
			               applyDelta, followSaturationPoint, verbose,
			               followCounts);
			const skus = await getSubscriptionBenefitThirdPartySKUs(
				user.login, follows.users
			);
			if (skus?.length)
				processSKUs(skus, weights[FACTOR_LABELS.SUBSCRIPTION_SKUS],
				            applyDelta, verbose, skuStats);
		}

		let best = null, bestScore = 0;
		for (const country in countryScores) {
			const score = countryScores[country];
			if (score > bestScore) {
				bestScore = score;
				best = country;
			}
		}

		if (!best || bestScore < minScore)
			return {
				text:
					`couldn't make a confident guess for ${userInput} ` +
					`(score: ${bestScore.toFixed(3)}/${minScore})`,
				mention: true,
			};

		const responseParts = [
			`${best} (${countryCodes[best]})`,
			`score: ${bestScore.toFixed(3)}`,
		];

		if (verbose) {
			const page = buildVerbosePage(verboseProgressLines, skuStats,
			                              chatterCounts, followCounts,
			                              countryScores);
			try {
				const link = await paste.create(page);
				responseParts.push(link);
			} catch (err) {
				logger.error('error creating paste:', err);
				responseParts.push('error creating paste');
			}
		}

		return { text: utils.format.join(responseParts), mention: true };
	},
};

function saturationFactor(total, saturationPoint) {
	return Math.min(1, total / saturationPoint);
}

function languageDelta(langTag, baseWeight, fraction = 1) {
	if (!langTag) return 0;
	const mult = LANGUAGE_WEIGHT_OVERRIDES[langTag] ?? 1;
	return baseWeight * mult * fraction;
}

function detectPrimaryLangTag(texts, { minWords = 3, minHitsFull = 3 } = {}) {
	const languageScores = Object.create(null);
	for (
		let i = 0;
		i < STOPWORD_LANGUAGES.length;
		languageScores[STOPWORD_LANGUAGES[i++]] = 0
	);

	for (let i = 0; i < texts.length; i++) {
		const words = texts[i]
			.toLowerCase()
			.split(utils.regex.patterns.wordSplit)
			.filter(Boolean);
		if (words.length < minWords) continue;
		const hitsByLang = Object.create(null);
		for (let j = 0; j < words.length; j++) {
			const langs = STOPWORD_WORD_TO_LANGUAGES.get(words[j]);
			if (!langs) continue;
			for (let k = 0, lang; k < langs.length; k++)
				hitsByLang[(lang = langs[k])] = (hitsByLang[lang] ?? 0) + 1;
		}
		for (const lang in hitsByLang) {
			const c = hitsByLang[lang];
			languageScores[lang] += c >= minHitsFull ? c : c / minHitsFull;
		}
	}

	let best = null,
		bestScore = 0;
	for (const lang in languageScores) {
		const score = languageScores[lang];
		if (score > bestScore) {
			bestScore = score;
			best = lang;
		}
	}
	return best;
}

function langToCountryCode(langTag) {
	if (!langTag || typeof langTag !== 'string') return null;
	return LANGUAGE_TO_COUNTRY_CODE[langTag];
}
// prettier-ignore
function skuToCountryCode(sku) {
	if (!sku)
		return null;
	// the SKU format we're parsing:
	// chansub_t1_1month_US_2024_07 -> "US"
	// chansub_t1_1month_id_2021_07 -> "ID"
	// chansub_t1_3month_us_2024_07 -> "US"
	// n.b. other formats observed:
	// numeric, e.g., 10120035
	// chansub-23301
	// chansub-tier-{2,3}-{3,6}months
	// chansub-tier-{2,3}-v2
	// chansub-tier-3 # tier-2 likely exists
	// tv.twitch.android.iap.subscription.group[1..11].tier1 # tier{2,3} likely exist
	// tv.twitch.android.iap.subscription.group[1..11].tier1.{3,6}month # ditto
	// tv.twitch.ios.iap.subscription
	const parts = sku.split('_');
	for (let i = parts.length - 1, p; i >= 0; i--)
		if (/^[A-Z]{2}$/.test((p = parts[i].toUpperCase())) &&
		    VALID_COUNTRY_CODES.has(p))
			return p;
	return null;
}

async function getUILanguages(logins) {
	try {
		const usersMap = await twitch.gql.user.getMany(logins);
		const langs = [];
		for (const user of usersMap.values()) {
			const lang = user.settings?.preferredLanguageTag;
			if (lang) langs.push(lang);
		}
		return langs;
	} catch (err) {
		logger.error('error getting users:', err);
		return null;
	}
}

async function getStreamLanguage(login) {
	try {
		const res = await twitch.gql.stream.get(login);
		return res.user?.stream?.language ?? null;
	} catch (err) {
		logger.error('error getting stream:', err);
		return null;
	}
}

async function getUserMessages(id) {
	try {
		const rows = await db.message.search(null, id);
		return rows.length ? rows.map(r => r.text) : null;
	} catch (err) {
		logger.error('error searching messages:', err);
		return null;
	}
}

async function getRecentMessages(login) {
	try {
		const res = await twitch.gql.chat.getRecentMessages(login);
		const messages = res.channel?.recentChatMessages;
		if (!messages) return null;
		const texts = [];
		for (let i = 0, t; i < messages.length; i++)
			if ((t = messages[i].content?.text)) texts.push(t);
		return texts;
	} catch (err) {
		logger.error('error getting recent chat messages:', err);
		return null;
	}
}

async function getChatters(login) {
	try {
		const res = await twitch.gql.channel.getChatters(login);
		const chatters = res.user?.channel?.chatters;
		if (!chatters?.count) return null;
		const logins = [];
		for (let i = 0; i < chatterTypes.length; i++)
			for (let j = 0, cT = chatters[chatterTypes[i]]; j < cT.length; j++)
				logins.push(cT[j].login);
		return { logins, totalCount: chatters.count };
	} catch (err) {
		logger.error('error getting chatters:', err);
		return null;
	}
}

async function getFollows(login, followsLimit) {
	try {
		const res = await twitch.gql.user.getFollows(login, followsLimit);
		if (!res.followEdges.length) return null;
		const users = [];
		for (let i = 0, u, l; i < res.followEdges.length; i++)
			if ((l = (u = res.followEdges[i].node).settings?.preferredLanguageTag))
				users.push({ id: u.id, lang: l });
		return { users, totalCount: res.totalCount };
	} catch (err) {
		logger.error('error getting follows:', err);
		return null;
	}
}

async function getDescription(login) {
	try {
		const res = await twitch.gql.user.getUserWithBanReason(login);
		return res.user?.description || null;
	} catch (err) {
		logger.error('error getting user:', err);
		return null;
	}
}

async function getSubscriptionBenefitThirdPartySKUs(login, follows) {
	const skus = [];
	try {
		for (const batch of utils.splitArray(
			follows,
			twitch.gql.MAX_OPERATIONS_PER_REQUEST
		)) {
			const res = await Promise.all(
				batch.map(f => twitch.gql.user.getRelationship(login, f.id))
			);
			for (let i = 0, sku; i < res.length; i++) {
				const sub = res[i].user?.relationship?.subscriptionBenefit;
				if ((sku = sub?.thirdPartySKU) && !sub.gift?.isGift) skus.push(sku);
			}
		}
		return skus;
	} catch (err) {
		logger.error('error getting subscription benefits:', err);
		return null;
	}
}
// prettier-ignore
function processUILanguage(uiLangs, weight, applyDelta) {
	if (!uiLangs?.length)
		return;
	const tag = uiLangs[0]?.toLowerCase();
	const delta = languageDelta(tag, weight);
	applyDelta(FACTOR_LABELS.UI_LANG, langToCountryCode(tag), delta);
}
// prettier-ignore
function processStreamLanguage(streamLang, weight, applyDelta) {
	if (!streamLang)
		return;
	const tag = streamLang.toLowerCase();
	const delta = languageDelta(tag, weight);
	applyDelta(FACTOR_LABELS.STREAM_LANG, langToCountryCode(tag), delta);
}

function processMessages(label, messages, weight, applyDelta) {
	if (!messages?.length) return;
	const tag = detectPrimaryLangTag(messages);
	const delta = languageDelta(tag, weight);
	applyDelta(label, langToCountryCode(tag), delta);
}
// prettier-ignore
function processDescription(description, weight, applyDelta) {
	if (!description)
		return;
	const tag = detectPrimaryLangTag([description]);
	const delta = languageDelta(tag, weight);
	applyDelta(FACTOR_LABELS.DESCRIPTION, langToCountryCode(tag), delta);
}

// prettier-ignore
function processChatters(sampleSize, totalCount, langs, weight, applyDelta,
                         saturationPoint, verbose, out) {
	const counts = Object.create(null);
	for (let i = 0, l; i < langs.length; i++)
		counts[(l = langs[i].toLowerCase())] = (counts[l] ?? 0) + 1;

	weight *= saturationFactor(totalCount, saturationPoint);

	for (const tag in counts) {
		const country = langToCountryCode(tag);
		if (!country)
			continue;
		const delta = languageDelta(tag, weight, counts[tag] / sampleSize);
		applyDelta(FACTOR_LABELS.CHATTER_LANGS, country, delta);
		if (verbose)
			out[country] = (out[country] ?? 0) + counts[tag];
	}
}
// prettier-ignore
function processFollows(follows, totalCount, weight, applyDelta,
                        saturationPoint, verbose, out) {
	const counts = Object.create(null);
	for (let i = 0, l; i < follows.length; i++)
		counts[(l = follows[i].lang.toLowerCase())] = (counts[l] ?? 0) + 1;

	weight *= saturationFactor(totalCount, saturationPoint);

	for (const tag in counts) {
		const country = langToCountryCode(tag);
		if (!country)
			continue;
		const delta = languageDelta(tag, weight, counts[tag] / follows.length);
		applyDelta(FACTOR_LABELS.FOLLOWED_CHANNEL_LANGS, country, delta);
		if (verbose)
			out[country] = (out[country] ?? 0) + counts[tag];
	}
}
// prettier-ignore
function processSKUs(skus, weight, applyDelta, verbose, out) {
	const countryToSkus = Object.create(null);
	let total = skus.length;

	for (let i = 0, sku; i < skus.length; i++) {
		const country = skuToCountryCode((sku = skus[i]));
		if (!country) {
			total--;
			continue;
		}
		if (verbose) {
			const e = (countryToSkus[country] ??= {
				count: 0,
				skuCounts: Object.create(null),
			});
			e.count++;
			e.skuCounts[sku] = (e.skuCounts[sku] ?? 0) + 1;
		} else
			countryToSkus[country] = (countryToSkus[country] ?? 0) + 1;
	}

	if (verbose)
		for (const country in countryToSkus) {
			const { count, skuCounts } = countryToSkus[country];
			applyDelta(FACTOR_LABELS.SUBSCRIPTION_SKUS, country,
			           weight * (count / total));
			const skuList = [];
			for (const sku in skuCounts)
				skuList.push({ sku, count: skuCounts[sku] });
			out[country] = { count: count, skus: skuList };
		}
	else
		for (const country in countryToSkus)
			applyDelta(FACTOR_LABELS.SUBSCRIPTION_SKUS, country,
			           weight * (countryToSkus[country] / total));
}
// prettier-ignore
function buildVerbosePage(progressLines, skuStats, chatterCounts, followCounts,
                          countryScores) {
	const skuLines = [`country${alignSep}count${alignSep}skus`];
	const sortedSkus =
		Object.entries(skuStats).sort((a, b) => b[1].count - a[1].count);
	for (let i = 0; i < sortedSkus.length; i++) {
		const [country, { count, skus }] = sortedSkus[i];
		const skuList = [];
		for (let i = 0, e; i < skus.length; i++)
			if ((e = skus[i]).count > 1)
				skuList.push(`${e.sku} (${e.count})`);
			else
				skuList.push(e.sku);
		skuLines.push(
			`${country}${alignSep}${count}${alignSep}${skuList.join(', ')}`
		);
	}

	const countryScoresSection = buildVerbosePageSection(
		'country scores',
		`country${alignSep}score`,
		countryScores,
		([country, score]) => `${country}${alignSep}${score.toFixed(3)}`
	);
	const chatterSection = buildVerbosePageSection(
		"chatters' preferred languages",
		`country${alignSep}count`,
		chatterCounts,
		([country, count]) => `${country}${alignSep}${count}`
	);
	const followsSection = buildVerbosePageSection(
		"following channels' preferred languages",
		`country${alignSep}count`,
		followCounts,
		([country, count]) => `${country}${alignSep}${count}`
	);

	const sections = [utils.format.align(progressLines)];

	if (countryScoresSection)
		sections.push(countryScoresSection);
	if (chatterSection)
		sections.push(chatterSection);
	if (followsSection)
		sections.push(followsSection);
	if (skuLines.length > 1)
		sections.push("\n\nsubscriptions' third-party SKUs:\n" +
		              utils.format.align(skuLines));

	return sections.join('');
}

function buildVerbosePageSection(title, header, obj, fmtFn) {
	const entries = Object.entries(obj);
	if (!entries.length) return;
	entries.sort((a, b) => b[1] - a[1]);
	const lines = [header];
	for (let i = 0; i < entries.length; i++) lines.push(fmtFn(entries[i]));
	return `\n\n${title}:\n${utils.format.align(lines)}`;
}
