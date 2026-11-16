import type { RouteId } from '$app/types';
import type { IconName } from '#lib/ui/Icon.svelte';

export type ToolGroup = 'Blockchain' | 'Data';

export interface ToolEntry {
	route: RouteId;
	name: string;
	/** One line, shown on the toolkit index (FR-001 AC-7). */
	description: string;
	group: ToolGroup;
	/** Sidebar icon (design S-00). */
	icon: IconName;
}

// Sidebar and index order (docs/design.md S-00).
const GROUP_ORDER: readonly ToolGroup[] = ['Blockchain', 'Data'];

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
		route: '/dummy-data',
		name: 'Dummy data',
		description:
			'Fake Indonesian names, NIK, NPWP, phones, addresses, and bank accounts from a seed, with presets and CSV, JSON, or SQL export.',
		group: 'Data',
		icon: 'person'
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
