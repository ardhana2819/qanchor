import type { Checklist } from './types.ts';

export const memoTag: Checklist = {
	slug: 'memo-tag',
	title: 'Memo and tag (XRP, XLM, TON)',
	summary:
		'Networks where a shared address needs a destination tag, memo, or comment to credit the right account.',
	sections: [
		{
			heading: 'Deposit',
			items: [
				'The deposit page shows the memo or tag next to the address, with its own copy button.',
				'A clear warning says the deposit is lost or delayed without the memo or tag.',
				'The memo or tag is unique per user and does not change between visits.',
				'A deposit with the correct memo or tag is credited to the right user.',
				'A deposit without a memo or tag is not credited automatically and follows the recovery flow.',
				'A deposit with another user’s memo or tag is credited to that user, not to the sender.'
			]
		},
		{
			heading: 'XRP destination tag',
			items: [
				'A destination tag is accepted as a whole number from 0 to 4294967295.',
				'A tag above 4294967295, a negative tag, or a tag with letters is rejected.',
				'A tag with leading zeros is either rejected or normalised, and the normalised value is shown.',
				'Withdrawing to an address that requires a destination tag without one is blocked.'
			]
		},
		{
			heading: 'Stellar (XLM) memo',
			items: [
				'The memo type (text, ID) is shown or chosen, and the type sent matches the one shown.',
				'A text memo longer than 28 bytes is rejected, counting bytes, not characters, for non-ASCII text.',
				'An ID memo accepts whole numbers only.',
				'Withdrawing to an address that requires a memo without one shows a warning or is blocked.'
			]
		},
		{
			heading: 'TON comment',
			items: [
				'The comment is sent as a text comment, and the received comment matches the shown value exactly.',
				'A comment with leading or trailing spaces is trimmed or rejected, as documented.',
				'Withdrawing to an exchange address without a comment shows a warning.'
			]
		},
		{
			heading: 'Withdraw',
			items: [
				'The memo or tag field is shown only for networks that use one.',
				'The memo or tag field is optional in the UI only where the network allows it, with a warning.',
				'The confirmation screen shows the address and the memo or tag together.',
				'The memo or tag appears in the withdrawal history next to the address.'
			]
		}
	]
};
