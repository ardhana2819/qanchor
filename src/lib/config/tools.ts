import type { RouteId } from '$app/types';
import type { IconName } from '#lib/ui/Icon.svelte';

export type ToolGroup = 'Blockchain' | 'Data' | 'QA';

/** A route without parameters: a tool's own page, not one inside it (`/checklists/[slug]`). */
type StaticRouteId = Exclude<RouteId, `${string}[${string}`>;

export interface ToolEntry {
	route: StaticRouteId;
	name: string;
	/** One line, shown on the toolkit index (FR-001 AC-7). */
	description: string;
	group: ToolGroup;
	/** Sidebar icon (design S-00). */
	icon: IconName;
}

// Sidebar and index order (docs/design.md S-00).
const GROUP_ORDER: readonly ToolGroup[] = ['Blockchain', 'Data', 'QA'];

/**
 * Shipped tools only (FR-001 AC-1): each tool task adds its entry in the same change that adds
 * its route. Navigation and the toolkit index both read this list.
 */
export const tools: readonly ToolEntry[] = [
	{
		route: '/address',
		name: 'Address generator',
		description:
			'Valid and deliberately invalid addresses for EVM, Bitcoin, Solana, and Tron, each with the reason it is invalid.',
		group: 'Blockchain',
		icon: 'at'
	},
	{
		route: '/amounts',
		name: 'Amount edge cases',
		description:
			'Boundary and format inputs for an amount field: token decimals, dust, fee versus balance, separators, and limits.',
		group: 'Blockchain',
		icon: 'bars'
	},
	{
		route: '/units',
		name: 'Unit converter',
		description:
			'Exact conversion between wei, gwei, and ether, sats and BTC, lamports and SOL, sun and TRX, or any token decimals.',
		group: 'Blockchain',
		icon: 'swap'
	},
	{
		route: '/tx',
		name: 'Tx lookup',
		description:
			'Status, block, sender, recipient, value, and fee of a transaction on EVM chains, Solana, Tron, or Bitcoin, straight from the chain.',
		group: 'Blockchain',
		icon: 'search'
	},
	{
		route: '/calldata',
		name: 'Calldata decoder',
		description:
			'Function and arguments of EVM calldata, from a signature, a JSON ABI, or the built-in token functions. Nothing is looked up online.',
		group: 'Blockchain',
		icon: 'code'
	},
	{
		route: '/wallets',
		name: 'Testnet wallets',
		description:
			'The testnet addresses you test with, labelled and kept in this browser. Bitcoin entries must be testnet addresses; no keys are ever stored.',
		group: 'Blockchain',
		icon: 'wallet'
	},
	{
		route: '/dummy-data',
		name: 'Dummy data',
		description:
			'Fake Indonesian names, NIK, NPWP, phones, addresses, and bank accounts from a seed, with presets and CSV, JSON, or SQL export.',
		group: 'Data',
		icon: 'person'
	},
	{
		route: '/checklists',
		name: 'Checklists',
		description:
			'Ready-made test checklists for deposit, withdraw, swap, staking, network mismatch, memo and tag, and stocks, copyable as Markdown.',
		group: 'Data',
		icon: 'checklist'
	},
	{
		route: '/cases',
		name: 'Test cases',
		description:
			'Reusable test cases with steps, expected results, tags, and a priority, filterable by tag and kept in this browser.',
		group: 'QA',
		icon: 'cases'
	},
	{
		route: '/runs',
		name: 'Test runs',
		description:
			'Run a set of test cases against a release: Pass, Fail, or Blocked per case, with the actual result, a linked issue, and a Markdown summary.',
		group: 'QA',
		icon: 'run'
	}
];

/** Groups in sidebar order, skipping groups with no entries. */
export function groupTools(
	entries: readonly ToolEntry[]
): { group: ToolGroup; entries: ToolEntry[] }[] {
	return GROUP_ORDER.map((group) => ({
		group,
		entries: entries.filter((entry) => entry.group === group)
	})).filter(({ entries: inGroup }) => inGroup.length > 0);
}
