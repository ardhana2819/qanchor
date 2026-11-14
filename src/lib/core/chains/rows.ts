import { VERSION } from './bitcoin.ts';
import {
	describeTarget,
	MAX_COUNT,
	type AddressRow,
	type AddressTarget,
	type GenerateOptions
} from './catalog.ts';
import { generateAddress } from './dispatch.ts';
import { buildVariant } from './variants.ts';

// One generation (FR-010, FR-011): `count` fresh valid addresses, then one row per selected
// variant. Runs in the address worker.

function validReason(target: AddressTarget): string {
	switch (target.chain) {
		case 'evm':
			return '20 bytes with a matching EIP-55 checksum.';
		case 'tron':
			return 'Base58Check of 0x41 and 20 bytes, starting with T.';
		case 'solana':
			return 'Base58 of a 32-byte ed25519 public key.';
		case 'bitcoin': {
			const hex = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;
			switch (target.type) {
				case 'p2pkh':
					return `Base58Check with version byte ${hex(VERSION[target.network].p2pkh)}.`;
				case 'p2sh':
					return `Base58Check with version byte ${hex(VERSION[target.network].p2sh)}, a P2SH-wrapped P2WPKH script.`;
				case 'p2wpkh':
					return 'Bech32, witness v0, 20-byte key hash.';
				case 'p2tr':
					return 'Bech32m, witness v1, 32-byte tweaked key (BIP-86).';
			}
		}
	}
}

function validLabel(target: AddressTarget): string {
	switch (target.chain) {
		case 'evm':
			return 'EIP-55 checksum';
		case 'tron':
			return 'Base58Check';
		case 'solana':
			return 'ed25519 public key';
		case 'bitcoin':
			return target.type.toUpperCase();
	}
}

export function generateRows({ target, count, variants }: GenerateOptions): AddressRow[] {
	if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
		throw new RangeError(`count must be 1 to ${MAX_COUNT}, got ${count}`);
	}
	const base = { chain: target.chain, ...describeTarget(target) };
	const valid: AddressRow[] = Array.from({ length: count }, () => ({
		...base,
		address: generateAddress(target),
		validity: 'valid',
		variantId: `${target.chain}.valid`,
		label: validLabel(target),
		reason: validReason(target)
	}));
	const others: AddressRow[] = variants.map((id) => ({ ...base, ...buildVariant(target, id) }));
	return [...valid, ...others];
}
