import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { err, ok } from '../result.ts';
import { checksumStatus, toChecksumAddress } from '../encoding/eip55.ts';
import { withSecretKey } from './random.ts';
import type { AddressCheck, RiskySample } from './types.ts';

// EVM addresses (FR-010 AC-2): the last 20 bytes of keccak-256 of the uncompressed public key,
// written with the EIP-55 checksum. The same address is valid on every EVM network.

const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

/** The 20 address bytes for an uncompressed secp256k1 public key (65 bytes, 0x04 prefix). */
export function publicKeyToAddressBytes(publicKey: Uint8Array): Uint8Array {
	if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
		throw new RangeError('expected a 65-byte uncompressed public key');
	}
	return keccak_256(publicKey.subarray(1)).slice(-20);
}

/** 20 address bytes from a fresh CSPRNG key, which is discarded (FR-010 AC-6). */
export function randomAddressBytes(): Uint8Array {
	return withSecretKey(32, secp256k1.utils.isValidSecretKey, (key) =>
		publicKeyToAddressBytes(secp256k1.getPublicKey(key, false))
	);
}

export function generateEvmAddress(): string {
	return toChecksumAddress(randomAddressBytes());
}

export function validateEvmAddress(text: string): AddressCheck {
	if (text === '') return err('empty');
	if (!text.startsWith('0x')) {
		return err(/^[0-9a-fA-F]+$/.test(text) ? 'missing-prefix' : 'invalid-character');
	}
	const digits = text.slice(2);
	if (!/^[0-9a-fA-F]*$/.test(digits)) return err('invalid-character');
	if (digits.length !== 40) return err('wrong-length');
	const status = checksumStatus(text);
	if (status === 'wrong-checksum') return err('bad-checksum');
	if (text === ZERO_ADDRESS) return ok({ risk: 'zero-address' });
	if (status === 'all-lowercase' || status === 'all-uppercase') return ok({ risk: 'no-checksum' });
	return ok({});
}

/** Valid but risky EVM samples (FR-011 AC-5, EC-004). */
export function evmRiskySamples(): RiskySample[] {
	return [
		{ address: ZERO_ADDRESS, risk: 'zero-address' },
		{ address: generateEvmAddress().toLowerCase(), risk: 'no-checksum' }
	];
}
