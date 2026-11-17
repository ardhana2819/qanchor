import type { Checklist } from './types.ts';

export const withdraw: Checklist = {
	slug: 'withdraw',
	title: 'Withdraw',
	summary:
		'Crypto withdrawals: address and amount validation, fees, limits, security checks, and status.',
	sections: [
		{
			heading: 'Address',
			items: [
				'A valid address for the selected network is accepted.',
				'An address for another chain is rejected with a message that names the expected network.',
				'An EVM address with a wrong EIP-55 checksum is rejected.',
				'An all-lowercase EVM address is accepted.',
				'A testnet address is rejected on mainnet, and a mainnet address on testnet.',
				'An address with a leading or trailing space is trimmed or rejected, never sent with the space.',
				'An address with an invisible character (zero-width space) is rejected.',
				'An address that is too short or too long is rejected.',
				'Withdrawing to the user’s own deposit address follows the documented rule (blocked or internal transfer).',
				'An address-book entry fills the address and network together.'
			]
		},
		{
			heading: 'Amount',
			items: [
				'An amount below the minimum withdrawal is rejected with the minimum shown.',
				'An amount equal to the available balance minus the fee is accepted.',
				'An amount above the available balance is rejected.',
				'An amount with more decimals than the token supports is rejected or truncated as documented.',
				'Zero and negative amounts are rejected.',
				'A comma decimal separator is handled as documented (accepted, or rejected with a hint).',
				'Scientific notation (for example 1e-6) is rejected.',
				'The Max button fills the balance minus the fee, not the full balance.',
				'Funds locked in open orders or staking are excluded from the available balance.'
			]
		},
		{
			heading: 'Fees and receive amount',
			items: [
				'The network fee is shown before confirmation, in the asset and in fiat if supported.',
				'The amount the recipient receives equals the entered amount minus the fee, or the fee is added on top as stated.',
				'A fee change between preview and confirmation is shown and needs a new confirmation.',
				'A fee greater than the amount is rejected.'
			]
		},
		{
			heading: 'Limits and security',
			items: [
				'The daily withdrawal limit is enforced and the remaining limit is shown.',
				'A withdrawal requires the second factor (OTP, email, or passkey) as configured.',
				'A wrong or expired OTP is rejected and the withdrawal is not created.',
				'A new address-book entry is subject to the documented waiting period.',
				'A withdrawal is blocked after a password or 2FA change for the documented period.',
				'Double-clicking Confirm creates one withdrawal, not two.'
			]
		},
		{
			heading: 'Status and history',
			items: [
				'The withdrawal moves through the documented states (pending, processing, completed, failed, cancelled).',
				'A pending withdrawal can be cancelled and the balance is returned in full.',
				'A failed withdrawal returns the balance, including the fee if the fee was not spent.',
				'A completed withdrawal shows the transaction hash with a link to the correct explorer.',
				'The user is notified on completion and on failure.'
			]
		}
	]
};
