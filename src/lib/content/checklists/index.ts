import { deposit } from './deposit.ts';
import { memoTag } from './memo-tag.ts';
import { networkMismatch } from './network-mismatch.ts';
import { stocks } from './stocks.ts';
import { staking } from './staking.ts';
import type { Checklist } from './types.ts';
import { swap } from './swap.ts';
import { withdraw } from './withdraw.ts';

export type { Checklist, ChecklistSection } from './types.ts';

/** The seven decided topics (docs/prd.md, Checklists), in list order. */
export const CHECKLISTS: readonly Checklist[] = [
	deposit,
	withdraw,
	swap,
	staking,
	networkMismatch,
	memoTag,
	stocks
];

export function itemCount(checklist: Checklist): number {
	return checklist.sections.reduce((total, section) => total + section.items.length, 0);
}
