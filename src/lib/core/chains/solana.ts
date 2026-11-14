import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { err, ok } from '../result.ts';
import { randomBytes, withSecretKey } from './random.ts';
import type { AddressCheck, RiskySample } from './types.ts';

// Solana addresses (FR-010 AC-2): Base58 of exactly 32 bytes, the ed25519 public key. Mainnet,
// devnet, and testnet share the format.

export function generateSolanaAddress(): string {
	return withSecretKey(
		32,
		() => true,
		(key) => base58.encode(ed25519.getPublicKey(key))
	);
}

/** Whether 32 bytes decode to a point on the ed25519 curve, as a wallet key must. */
export function isOnCurve(bytes: Uint8Array): boolean {
	try {
		ed25519.Point.fromBytes(bytes);
		return true;
	} catch {
		return false;
	}
}

export function validateSolanaAddress(text: string): AddressCheck {
	if (text === '') return err('empty');
	let bytes: Uint8Array;
	try {
		bytes = base58.decode(text);
	} catch {
		return err('invalid-character');
	}
	if (bytes.length !== 32) return err('wrong-length');
	// Off-curve addresses are program-derived: valid, but no key can sign for them (EC-006).
	return ok(isOnCurve(bytes) ? {} : { risk: 'off-curve' });
}

/** A valid but off-curve address, like a program-derived address (EC-006). No key involved. */
export function solanaRiskySamples(): RiskySample[] {
	for (;;) {
		const bytes = randomBytes(32);
		if (!isOnCurve(bytes)) return [{ address: base58.encode(bytes), risk: 'off-curve' }];
	}
}
