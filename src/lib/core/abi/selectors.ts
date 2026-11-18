import { functionSelector, parseSignature } from './parse.ts';
import type { AbiFunction } from './types.ts';

// The built-in selector table (FR-051 AC-1): token transfers and approvals only. There is no
// online signature lookup (FR-051 AC-2, EC-015). Loaded by the calldata route only.

export interface BuiltinFunction {
	fn: AbiFunction;
	selector: string;
	/** The standards that define this exact signature. */
	standards: string;
	/** How to read the arguments when standards share a selector but not a meaning. */
	note?: string;
}

const SHARED_WITH_ERC721 = 'In ERC-721 the last argument is the token ID, not an amount.';

const ENTRIES: readonly [standards: string, signature: string, note?: string][] = [
	['ERC-20', 'transfer(address to, uint256 amount)'],
	['ERC-20, ERC-721', 'approve(address spender, uint256 amount)', SHARED_WITH_ERC721],
	['ERC-20, ERC-721', 'transferFrom(address from, address to, uint256 amount)', SHARED_WITH_ERC721],
	['ERC-721', 'safeTransferFrom(address from, address to, uint256 tokenId)'],
	['ERC-721', 'safeTransferFrom(address from, address to, uint256 tokenId, bytes data)'],
	['ERC-721, ERC-1155', 'setApprovalForAll(address operator, bool approved)'],
	['ERC-1155', 'safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)'],
	[
		'ERC-1155',
		'safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)'
	]
];

export const BUILTIN_FUNCTIONS: readonly BuiltinFunction[] = ENTRIES.map(
	([standards, signature, note]) => {
		const parsed = parseSignature(signature);
		if (!parsed.ok) throw new Error(`built-in signature ${signature}: ${parsed.error}`);
		return { fn: parsed.value, selector: functionSelector(parsed.value), standards, note };
	}
);

export function builtinFunction(selector: string): BuiltinFunction | undefined {
	return BUILTIN_FUNCTIONS.find((entry) => entry.selector === selector);
}
