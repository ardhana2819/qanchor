import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { err, ok } from '../result.ts';
import { decodeBase58Check, encodeBase58Check } from '../encoding/base58check.ts';
import { decodeSegwitAddress, encodeSegwitAddress, type SegwitError } from '../encoding/bech32.ts';
import { withSecretKey } from './random.ts';
import type { AddressCheck, AddressDefect } from './types.ts';

// Bitcoin addresses (FR-010 AC-2), each from a fresh compressed secp256k1 public key:
// P2PKH and P2SH (Base58Check), P2WPKH (Bech32, witness v0), and P2TR (Bech32m, witness v1, a
// BIP-86 key-path output with the BIP-341 tweak). Mainnet and testnet differ in encoding, so the
// network is part of every address.

export type BitcoinType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2tr';
export type BitcoinNetwork = 'mainnet' | 'testnet';

/** Base58Check version bytes per network and type. */
export const VERSION: Record<BitcoinNetwork, Record<'p2pkh' | 'p2sh', number>> = {
	mainnet: { p2pkh: 0x00, p2sh: 0x05 },
	testnet: { p2pkh: 0x6f, p2sh: 0xc4 }
};
/** Segwit human-readable prefixes per network. */
export const PREFIX: Record<BitcoinNetwork, string> = { mainnet: 'bc', testnet: 'tb' };
const WITNESS: Record<'p2wpkh' | 'p2tr', { version: number; length: number }> = {
	p2wpkh: { version: 0, length: 20 },
	p2tr: { version: 1, length: 32 }
};

export function hash160(bytes: Uint8Array): Uint8Array {
	return ripemd160(sha256(bytes));
}

/** BIP-340 tagged hash: sha256(sha256(tag) || sha256(tag) || message). */
export function taggedHash(tag: string, message: Uint8Array): Uint8Array {
	const tagHash = sha256(new TextEncoder().encode(tag));
	return sha256(Uint8Array.from([...tagHash, ...tagHash, ...message]));
}

/**
 * BIP-341 output key: Q = P + t·G with t = hash_TapTweak(P || merkleRoot), where P is the
 * x-only internal key lifted to the point with an even y. Without a merkle root this is the
 * BIP-86 key-path-only output. Returns the 32-byte x coordinate of Q. A tweak of n or more
 * (probability about 2^-128) makes noble's scalar multiplication throw, as BIP-341 requires.
 */
export function taprootOutputKey(internalKey: Uint8Array, merkleRoot?: Uint8Array): Uint8Array {
	if (internalKey.length !== 32) throw new RangeError('the internal key is 32 bytes (x-only)');
	const P = secp256k1.Point.fromBytes(Uint8Array.from([0x02, ...internalKey]));
	const t = bytesToBigInt(
		taggedHash('TapTweak', Uint8Array.from([...internalKey, ...(merkleRoot ?? [])]))
	);
	const Q = P.add(secp256k1.Point.BASE.multiply(t));
	return Q.toBytes(true).slice(1);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
	return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`);
}

/** The address for a 33-byte compressed public key. */
export function addressFromPublicKey(
	publicKey: Uint8Array,
	type: BitcoinType,
	network: BitcoinNetwork
): string {
	if (publicKey.length !== 33) throw new RangeError('expected a 33-byte compressed public key');
	switch (type) {
		case 'p2pkh':
			return encodeBase58Check(Uint8Array.from([VERSION[network].p2pkh, ...hash160(publicKey)]));
		case 'p2sh': {
			// P2SH-wrapped P2WPKH (BIP-49): the script hash of OP_0 <20-byte key hash>.
			const redeemScript = Uint8Array.from([0x00, 0x14, ...hash160(publicKey)]);
			return encodeBase58Check(Uint8Array.from([VERSION[network].p2sh, ...hash160(redeemScript)]));
		}
		case 'p2wpkh':
			return encodeSegwitAddress(PREFIX[network], 0, hash160(publicKey));
		case 'p2tr':
			return encodeSegwitAddress(PREFIX[network], 1, taprootOutputKey(publicKey.slice(1)));
	}
}

/** An address from a fresh CSPRNG key, which is zero-filled once the address exists. */
export function generateBitcoinAddress(type: BitcoinType, network: BitcoinNetwork): string {
	return withSecretKey(32, secp256k1.utils.isValidSecretKey, (key) =>
		addressFromPublicKey(secp256k1.getPublicKey(key, true), type, network)
	);
}

const BASE58_DEFECTS: Record<string, AddressDefect> = {
	empty: 'empty',
	'not-base58': 'invalid-character',
	'too-short': 'wrong-length',
	'bad-checksum': 'bad-checksum'
};

const SEGWIT_DEFECTS: Record<SegwitError, AddressDefect> = {
	'mixed-case': 'mixed-case',
	'too-long': 'wrong-length',
	'no-separator': 'invalid-character',
	'invalid-prefix': 'invalid-character',
	'invalid-character': 'invalid-character',
	'too-short': 'wrong-length',
	'bad-checksum': 'bad-checksum',
	'unknown-prefix': 'wrong-prefix',
	'empty-data': 'wrong-length',
	'invalid-version': 'wrong-type',
	'wrong-encoding': 'wrong-encoding',
	'invalid-padding': 'wrong-length',
	'invalid-program-length': 'wrong-length'
};

/** Checks an address against one type and network, naming the defect when it fails. */
export function validateBitcoinAddress(
	text: string,
	type: BitcoinType,
	network: BitcoinNetwork
): AddressCheck {
	if (text === '') return err('empty');
	return type === 'p2pkh' || type === 'p2sh'
		? validateBase58(text, type, network)
		: validateSegwit(text, type, network);
}

function validateBase58(
	text: string,
	type: 'p2pkh' | 'p2sh',
	network: BitcoinNetwork
): AddressCheck {
	const decoded = decodeBase58Check(text);
	if (!decoded.ok) return err(BASE58_DEFECTS[decoded.error]);
	if (decoded.value.length !== 21) return err('wrong-length');
	const version = decoded.value[0];
	if (version === VERSION[network][type]) return ok({});
	const other: BitcoinNetwork = network === 'mainnet' ? 'testnet' : 'mainnet';
	if (version === VERSION[other][type]) return err('wrong-network');
	if (Object.values(VERSION[network]).includes(version)) return err('wrong-type');
	return err('wrong-prefix');
}

function validateSegwit(
	text: string,
	type: 'p2wpkh' | 'p2tr',
	network: BitcoinNetwork
): AddressCheck {
	const decoded = decodeSegwitAddress(text, Object.values(PREFIX));
	if (!decoded.ok) return err(SEGWIT_DEFECTS[decoded.error]);
	const { prefix, version, program } = decoded.value;
	if (prefix !== PREFIX[network]) return err('wrong-network');
	const expected = WITNESS[type];
	if (version !== expected.version) return err('wrong-type');
	// A 32-byte version 0 program is P2WSH, not P2WPKH.
	if (program.length !== expected.length) return err(version === 0 ? 'wrong-type' : 'wrong-length');
	return ok({});
}
