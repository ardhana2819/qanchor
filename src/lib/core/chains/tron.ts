import { err, ok } from '../result.ts';
import { decodeBase58Check, encodeBase58Check } from '../encoding/base58check.ts';
import { randomAddressBytes } from './evm.ts';
import type { AddressCheck, AddressDefect } from './types.ts';

// Tron addresses (FR-010 AC-2): Base58Check of 0x41 + the same 20 bytes an EVM address uses, so
// every address starts with "T". Mainnet and testnets share the format.

const PREFIX = 0x41;

export function tronAddressFromBytes(bytes: Uint8Array): string {
	if (bytes.length !== 20) throw new RangeError(`a Tron address is 20 bytes, got ${bytes.length}`);
	return encodeBase58Check(Uint8Array.from([PREFIX, ...bytes]));
}

export function generateTronAddress(): string {
	return tronAddressFromBytes(randomAddressBytes());
}

const DECODE_DEFECTS: Record<string, AddressDefect> = {
	empty: 'empty',
	'not-base58': 'invalid-character',
	'too-short': 'wrong-length',
	'bad-checksum': 'bad-checksum'
};

export function validateTronAddress(text: string): AddressCheck {
	const decoded = decodeBase58Check(text);
	if (!decoded.ok) return err(DECODE_DEFECTS[decoded.error]);
	if (decoded.value.length !== 21) return err('wrong-length');
	if (decoded.value[0] !== PREFIX) return err('wrong-prefix');
	return ok({});
}
