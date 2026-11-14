import { keccak_256 } from '@noble/hashes/sha3.js';
import { hex } from '@scure/base';

// EIP-55 mixed-case checksum for EVM addresses (NFR-014).

/** How an address's letters relate to its EIP-55 checksum. */
export type ChecksumStatus =
	| 'checksummed'
	/** Valid but carries no checksum: a "valid but risky" sample (FR-010 AC-6). */
	| 'all-lowercase'
	| 'all-uppercase'
	| 'wrong-checksum';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** "0x" + 40 hex digits with EIP-55 casing, from the 20 address bytes. */
export function toChecksumAddress(bytes: Uint8Array): string {
	if (bytes.length !== 20) throw new RangeError(`an EVM address is 20 bytes, got ${bytes.length}`);
	return checksumCase(hex.encode(bytes));
}

function checksumCase(lower: string): string {
	const hash = hex.encode(keccak_256(new TextEncoder().encode(lower)));
	let out = '0x';
	for (let i = 0; i < lower.length; i++) {
		out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
	}
	return out;
}

/** The checksum status of a well-formed "0x" + 40 hex address, or null when it is not one. */
export function checksumStatus(address: string): ChecksumStatus | null {
	if (!ADDRESS.test(address)) return null;
	const digits = address.slice(2);
	// Checked first: an address whose letters all happen to need lowercase is still checksummed.
	if (checksumCase(digits.toLowerCase()) === address) return 'checksummed';
	if (digits === digits.toLowerCase()) return 'all-lowercase';
	if (digits === digits.toUpperCase()) return 'all-uppercase';
	return 'wrong-checksum';
}
