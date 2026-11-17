import type { Checklist } from './types.ts';

export const staking: Checklist = {
	slug: 'staking',
	title: 'Staking',
	summary:
		'Staking and earn products: subscribe, rewards, lock and unbonding periods, and redemption.',
	sections: [
		{
			heading: 'Product details',
			items: [
				'Each product shows the asset, the APR or APY, and whether the rate is fixed or variable.',
				'The lock period, unbonding period, and reward schedule are shown before subscribing.',
				'The minimum and maximum stake amounts are shown.',
				'A sold-out or paused product cannot be subscribed to.'
			]
		},
		{
			heading: 'Subscribe',
			items: [
				'An amount below the minimum stake is rejected with the minimum shown.',
				'An amount above the available balance or the remaining product cap is rejected.',
				'The staked amount moves from the available balance to the staked balance.',
				'The estimated reward shown before confirming matches the rate, amount, and period.',
				'The terms must be accepted before the first subscription.'
			]
		},
		{
			heading: 'Rewards',
			items: [
				'Rewards are credited on the stated schedule and in the stated asset.',
				'The first reward starts on the documented day, not the day of subscription if they differ.',
				'Rewards are calculated on the staked amount only, not on pending or unbonding amounts.',
				'Auto-compounding, if enabled, adds the reward to the staked amount.',
				'Reward history shows each payout with its date and amount.'
			]
		},
		{
			heading: 'Redeem and unbonding',
			items: [
				'Redeeming before the lock period ends is blocked or shows the penalty before confirming.',
				'Redeemed funds are unavailable during the unbonding period and shown as unbonding.',
				'No reward accrues during unbonding unless documented otherwise.',
				'After unbonding, the full principal returns to the available balance.',
				'A partial redemption leaves the rest staked and earning.'
			]
		},
		{
			heading: 'Edge cases',
			items: [
				'A rate change applies from the documented date and is shown to existing stakers.',
				'Slashing or a validator penalty is reflected in the balance and explained in history.',
				'Staking the same product twice shows either one combined position or two positions, as documented.'
			]
		}
	]
};
