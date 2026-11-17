import type { Checklist } from './types.ts';

export const deposit: Checklist = {
	slug: 'deposit',
	title: 'Deposit',
	summary:
		'Crypto deposits from address display to credited balance, including confirmations and edge amounts.',
	sections: [
		{
			heading: 'Deposit address',
			items: [
				'The deposit page shows the address for the selected asset and network only.',
				'The copied address is identical to the displayed address, with no leading or trailing spaces.',
				'The QR code decodes to exactly the displayed address.',
				'The network name and token standard (for example ERC-20, TRC-20) are shown next to the address.',
				'Switching the network changes the address or states that the address is shared across networks.',
				'An asset whose deposits are suspended shows a notice and no address.',
				'Generating a new address, if supported, keeps deposits to earlier addresses credited.'
			]
		},
		{
			heading: 'Detection and confirmations',
			items: [
				'A deposit appears as pending within the stated time after the transaction is broadcast.',
				'The pending deposit shows the transaction hash, amount, network, and confirmation count.',
				'The balance is credited only after the required number of confirmations.',
				'The required confirmation count shown to the user matches the configured value for the network.',
				'A transaction that is dropped or replaced before confirmation is never credited.',
				'A deposit made by a contract call (internal transfer) is detected or documented as unsupported.',
				'Two deposits in the same block are credited as two separate entries.'
			]
		},
		{
			heading: 'Amounts',
			items: [
				'A deposit below the minimum deposit amount is not credited and the user is told why.',
				'A deposit exactly at the minimum is credited.',
				'A deposit with the maximum token decimals (for example 18) is credited without rounding.',
				'A token with 6 decimals (for example USDT) is credited with the correct magnitude, not off by 10^12.',
				'A dust amount follows the documented policy: credited, held, or ignored.',
				'The credited amount equals the on-chain amount minus any documented deposit fee.'
			]
		},
		{
			heading: 'Unsupported deposits',
			items: [
				'A token not listed for the address is not credited and follows the documented recovery process.',
				'A deposit sent on an unsupported network follows the documented recovery process.',
				'A deposit from a sanctioned or flagged address follows the compliance hold flow.'
			]
		},
		{
			heading: 'History and notifications',
			items: [
				'The deposit appears in history with status, amount, network, transaction hash, and time.',
				'The transaction hash links to the correct explorer for the network.',
				'A notification is sent once when the deposit is credited, not once per confirmation.',
				'The deposit history can be filtered by asset and status.'
			]
		}
	]
};
