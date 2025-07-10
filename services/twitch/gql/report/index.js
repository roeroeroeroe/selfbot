import * as queries from './queries.js';
import * as constants from './constants.js';
import gql from '../index.js';
// prettier-ignore
async function getReportWizard(content, userId, sessionId,
                               version = constants.WIZARD_VERSION) {
	const res = await gql.request({
		query: queries.GET_REPORT_WIZARD,
		variables: { content, userId, sessionId, version },
	});

	return res.data?.reportWizard;
}
// prettier-ignore
async function reportContent(content, contentId, contentMetadata, reason,
                             detailedReason, description, userId, sessionId,
                             uiEntryPoint, email) {
	const res = await gql.request({
		query: queries.REPORT_CONTENT,
		variables: {
			input: {
				content,
				contentID: contentId,
				contentMetadata,
				reason,
				detailedReason,
				description,
				targetUserID: userId,
				sessionID: sessionId,
				uiEntryPoint,
				dsaArgs: { reporterEmail: email },
			},
		},
	});

	return res.data;
}

export default {
	...constants,
	queries,

	getReportWizard,

	reportContent,
};
