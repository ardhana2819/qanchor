import { describe, expect, it } from 'vitest';
import { functionSignature } from './parse.ts';
import { BUILTIN_FUNCTIONS, builtinFunction } from './selectors.ts';

describe('built-in selectors (FR-051 AC-1)', () => {
	// Selectors as published in EIP-20, EIP-721, and EIP-1155.
	it.each([
		['0xa9059cbb', 'transfer(address,uint256)', 'ERC-20'],
		['0x095ea7b3', 'approve(address,uint256)', 'ERC-20, ERC-721'],
		['0x23b872dd', 'transferFrom(address,address,uint256)', 'ERC-20, ERC-721'],
		['0x42842e0e', 'safeTransferFrom(address,address,uint256)', 'ERC-721'],
		['0xb88d4fde', 'safeTransferFrom(address,address,uint256,bytes)', 'ERC-721'],
		['0xa22cb465', 'setApprovalForAll(address,bool)', 'ERC-721, ERC-1155'],
		['0xf242432a', 'safeTransferFrom(address,address,uint256,uint256,bytes)', 'ERC-1155'],
		['0x2eb2c2d6', 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)', 'ERC-1155']
	])('%s is %s (%s)', (selector, signature, standards) => {
		const entry = builtinFunction(selector);
		expect(entry && functionSignature(entry.fn)).toBe(signature);
		expect(entry?.standards).toBe(standards);
	});

	it('has exactly these eight entries, each with a different selector', () => {
		expect(BUILTIN_FUNCTIONS).toHaveLength(8);
		expect(new Set(BUILTIN_FUNCTIONS.map((entry) => entry.selector)).size).toBe(8);
	});

	it('names every argument', () => {
		for (const entry of BUILTIN_FUNCTIONS) {
			expect(entry.fn.inputs.every((input) => input.name !== '')).toBe(true);
		}
	});

	it('notes the token-ID reading where ERC-20 and ERC-721 share a selector', () => {
		expect(builtinFunction('0x095ea7b3')?.note).toMatch(/token ID/);
		expect(builtinFunction('0x23b872dd')?.note).toMatch(/token ID/);
		expect(builtinFunction('0xa9059cbb')?.note).toBeUndefined();
	});

	it('knows nothing else', () => {
		expect(builtinFunction('0x12345678')).toBeUndefined();
		expect(builtinFunction('0xA9059CBB')).toBeUndefined();
	});
});
