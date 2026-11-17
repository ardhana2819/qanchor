import type { Checklist } from './types.ts';

export const stocks: Checklist = {
	slug: 'stocks',
	title: 'Stocks',
	summary:
		'Stock trading features: market hours, order types, fractional shares, and corporate actions.',
	sections: [
		{
			heading: 'Market hours',
			items: [
				'The market status (open, closed, pre-market, after-hours) matches the exchange calendar in the user’s time zone.',
				'A market order placed while the market is closed is rejected or queued for the next open, as documented.',
				'A limit order placed while the market is closed is accepted and stays pending until the open.',
				'Pre-market and after-hours trading is available only for the order types documented for those sessions.',
				'Exchange holidays and early-close days are respected.',
				'The daylight saving time change shifts the displayed opening and closing times correctly.'
			]
		},
		{
			heading: 'Orders',
			items: [
				'A buy order above the buying power is rejected before submission.',
				'A sell order for more shares than held is rejected.',
				'A limit price outside the documented price band is rejected.',
				'A pending order can be cancelled, and the reserved funds or shares are released.',
				'A partially filled order shows the filled and remaining quantity.',
				'The order confirmation shows the estimated total, including fees.'
			]
		},
		{
			heading: 'Fractional shares',
			items: [
				'A fractional buy by amount (for example 10 USD) results in the matching fractional quantity.',
				'A fractional buy by quantity accepts up to the documented number of decimal places.',
				'A quantity below the minimum fractional size is rejected.',
				'Fractional orders are offered only for the stocks and order types that support them.',
				'Selling all shares, including a fraction, leaves no residual fraction.',
				'Fractional holdings receive dividends in proportion to the fraction held.'
			]
		},
		{
			heading: 'Corporate actions',
			items: [
				'After a forward split, the quantity is multiplied and the average cost divided by the split ratio.',
				'After a reverse split, the quantity is divided and a resulting fraction is handled as documented (cash in lieu or kept).',
				'A cash dividend is credited on the pay date to holders of record, net of the documented tax.',
				'A ticker or name change keeps the holding, its cost basis, and its history.',
				'A delisted stock shows its status and the documented options (sell, transfer, or hold).',
				'Pending orders on a stock affected by a corporate action are cancelled or adjusted, as documented.'
			]
		},
		{
			heading: 'Portfolio and history',
			items: [
				'Unrealised profit and loss equals market value minus cost basis.',
				'Realised profit and loss after a sale uses the documented cost method (for example FIFO or average).',
				'Trade history shows each fill with time, price, quantity, and fees.'
			]
		}
	]
};
