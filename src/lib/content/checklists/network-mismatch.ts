import type { Checklist } from './types.ts';

export const networkMismatch: Checklist = {
	slug: 'network-mismatch',
	title: 'Network mismatch',
	summary:
		'The same token on several networks: picking, warning, and recovering when the network is wrong.',
	sections: [
		{
			heading: 'Choosing a network',
			items: [
				'Deposit and withdraw make the user choose a network explicitly; there is no silent default.',
				'Each network option shows its name, token standard, fee, and estimated arrival time.',
				'A network that is under maintenance is shown as unavailable and cannot be chosen.',
				'The network chosen on the deposit page is the one the displayed address belongs to.'
			]
		},
		{
			heading: 'Withdraw to a mismatched address',
			items: [
				'A Tron address entered with an EVM network selected is rejected.',
				'An EVM address entered with Tron selected is rejected.',
				'An EVM address is accepted on every EVM network offered, with a warning that the recipient must support that network.',
				'A Bitcoin address of a type the network does not support (for example Taproot where it is unsupported) is rejected.',
				'Pasting an address that matches a different network than the one selected suggests the matching network.'
			]
		},
		{
			heading: 'Same token, different contract',
			items: [
				'USDT on Ethereum, Tron, BNB Smart Chain, and other networks is shown as distinct options, never merged.',
				'A deposit of a token from a contract address that is not on the allow-list is not credited.',
				'Token decimals are taken per network (for example USDT 6 on Ethereum and 18 on BNB Smart Chain).',
				'The balance for a multi-network token is the sum of its networks, or is shown per network, as documented.'
			]
		},
		{
			heading: 'Recovery',
			items: [
				'A deposit on a supported chain but the wrong network follows the documented recovery request flow.',
				'The recovery request shows the fee and the expected processing time.',
				'Funds sent to an address on an unsupported network are documented as not recoverable, and the warning says so before sending.'
			]
		}
	]
};
