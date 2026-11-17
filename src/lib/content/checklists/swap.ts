import type { Checklist } from './types.ts';

export const swap: Checklist = {
	slug: 'swap',
	title: 'Swap',
	summary:
		'Token swaps and conversions: quotes, slippage, allowances, balances, and failure handling.',
	sections: [
		{
			heading: 'Pair and amount',
			items: [
				'Only supported pairs can be selected, and an unsupported pair says so.',
				'Selecting the same token on both sides is blocked.',
				'The flip button swaps the tokens and recalculates the quote.',
				'An amount below the pair minimum is rejected with the minimum shown.',
				'An amount above the balance is rejected.',
				'An amount with more decimals than the source token supports is rejected or truncated as documented.',
				'Max uses the full balance for a token and leaves gas for the native coin.'
			]
		},
		{
			heading: 'Quote',
			items: [
				'The quote shows the rate, the amount received, the fee, and the price impact.',
				'The rate is shown in both directions and the two values are reciprocals.',
				'The quote expires after the stated time and must be refreshed before confirming.',
				'Confirming an expired quote is blocked or re-quoted, never executed at the old rate.',
				'A large price impact shows a warning above the documented threshold.',
				'Editing the amount updates the quote and cancels any pending request for the old amount.'
			]
		},
		{
			heading: 'Slippage',
			items: [
				'The default slippage tolerance is shown and can be changed.',
				'A slippage of 0 or above the maximum is rejected.',
				'The minimum received equals the quoted amount minus the slippage tolerance.',
				'A swap whose result would be below the minimum received fails without spending the source token (beyond gas).'
			]
		},
		{
			heading: 'Allowance (on-chain swaps)',
			items: [
				'A token without enough allowance asks for approval before the swap.',
				'The approval amount is shown, and an exact amount option is offered if unlimited is the default.',
				'A rejected approval leaves the swap unstarted and the balance unchanged.',
				'A token that requires resetting the allowance to zero first (for example USDT on Ethereum) is handled.'
			]
		},
		{
			heading: 'Execution and result',
			items: [
				'A successful swap debits the source amount and credits the received amount shown in history.',
				'A failed or reverted swap returns the source token and shows the reason.',
				'A swap rejected in the wallet shows a cancelled state, not an error.',
				'Double-clicking Swap submits one swap.',
				'The swap record shows both amounts, the rate used, the fee, and the transaction hash or order ID.'
			]
		}
	]
};
