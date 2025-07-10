export const GET_REPORT_WIZARD = `
query(
	$content: [ReportContentType!]
	$userId: ID
	$sessionId: ID!
	$version: String
) {
	reportWizard(
		content: $content
		targetUserID: $userId
		reportSessionID: $sessionId
		reportWizardVersion: $version
	) {
		reasons {
			toSAndCountryReasons {
				id
				text
				description
				deadEndType
				detailedReasons {
					id
					title
					description
					deadEndType
				}
			}
		}
		reportableContent {
			id
			type
			deadEndType
			applicableReasons {
				id
				visibility
				reportReason {
					id
				}
			}
		}
	}
}`;

export const REPORT_CONTENT = `
mutation($input: ReportUserContentInput!) {
	reportUserContent(input: $input) {
		error {
			code
		}
	}
}`;
