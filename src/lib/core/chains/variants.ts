import { base58, bech32, bech32m } from '@scure/base';
import { decodeBase58Check, encodeBase58Check } from '../encoding/base58check.ts';
import { decodeSegwitAddress } from '../encoding/bech32.ts';
import { PREFIX, VERSION, type BitcoinNetwork } from './bitcoin.ts';
import { generateEvmAddress } from './evm.ts';
import { solanaRiskySamples } from './solana.ts';
import {
	CHAIN_NAMES,
	describeTargetName,
	encodingOf,
	lookAlikeSource,
	variantOption,
	type AddressTarget,
	type RiskyId,
	type VariantId,
	type VariantRow
} from './catalog.ts';
import { generateAddress } from './dispatch.ts';
import type { ChainId } from './types.ts';

// Builds invalid variants and valid-but-risky samples (FR-011); catalog.ts says which apply. Each
// one starts from a fresh valid address, so it differs from a real address in exactly the way its
// reason says.

interface Built {
	address: string;
	reason: string;
	sourceChain?: ChainId;
}

interface Spec<Id extends string> {
	id: Id;
	build: (target: AddressTarget) => Built;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const middle = (text: string) => Math.floor(text.length / 2);
const replaceAt = (text: string, index: number, c: string) =>
	`${text.slice(0, index)}${c}${text.slice(index + 1)}`;
/** The next character of the alphabet after `c`, wrapping around. */
const nextIn = (alphabet: string, c: string) =>
	alphabet[(alphabet.indexOf(c) + 1) % alphabet.length];

function segwitParts(address: string) {
	const decoded = decodeSegwitAddress(address, Object.values(PREFIX));
	if (!decoded.ok) throw new Error(`not a segwit address: ${decoded.error}`);
	return decoded.value;
}

function base58CheckPayload(address: string): Uint8Array {
	const decoded = decodeBase58Check(address);
	if (!decoded.ok) throw new Error(`not Base58Check: ${decoded.error}`);
	return decoded.value;
}

/** Encodes a witness program with a chosen coder, bypassing the length and version rules. */
function rawSegwit(
	prefix: string,
	version: number,
	program: Uint8Array,
	coder = version === 0 ? bech32 : bech32m
) {
	return coder.encode(prefix, [version, ...coder.toWords(program)]);
}

const VARIANTS: readonly Spec<VariantId>[] = [
	{
		id: 'wrong-checksum',
		build: () => {
			for (;;) {
				const address = generateEvmAddress();
				const index = [...address].findIndex((c, i) => i >= 2 && /[a-fA-F]/.test(c));
				if (index === -1) continue;
				const c = address[index];
				const flipped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
				return {
					address: replaceAt(address, index, flipped),
					reason: `Character ${index - 1} should be ${c === c.toLowerCase() ? 'lowercase' : 'uppercase'}, so the EIP-55 checksum does not match.`
				};
			}
		}
	},
	{
		id: 'invalid-character',
		build: (target) => {
			const address = generateAddress(target);
			const encoding = encodingOf(target);
			if (encoding === 'eip55') {
				return {
					address: replaceAt(address, middle(address), 'g'),
					reason: '"g" is not a hex digit.'
				};
			}
			if (encoding === 'segwit') {
				const data = address.lastIndexOf('1') + 1;
				return {
					address: replaceAt(address, data + middle(address.slice(data)), 'b'),
					reason: '"b" is not in the Bech32 alphabet.'
				};
			}
			return {
				address: replaceAt(address, middle(address), '0'),
				reason: '"0" (zero) is not in the Base58 alphabet.'
			};
		}
	},
	{
		id: 'wrong-length',
		build: (target) => {
			const address = generateAddress(target);
			switch (encodingOf(target)) {
				case 'eip55':
					return { address: address.slice(0, -1), reason: '39 hex characters instead of 40.' };
				case 'base58':
					return {
						address: base58.encode(base58.decode(address).slice(0, -1)),
						reason: 'Decodes to 31 bytes instead of 32.'
					};
				case 'base58check':
					return {
						address: encodeBase58Check(base58CheckPayload(address).slice(0, -1)),
						reason: 'Encodes 20 bytes instead of 21; the checksum itself is valid.'
					};
				case 'segwit': {
					const { prefix, version, program } = segwitParts(address);
					return {
						address: rawSegwit(prefix, version, program.slice(0, -1)),
						reason: `A ${program.length - 1}-byte witness program instead of ${program.length}; the checksum itself is valid.`
					};
				}
			}
		}
	},
	{
		id: 'bad-checksum',
		build: (target) => {
			const address = generateAddress(target);
			const last = address.at(-1)!;
			if (encodingOf(target) === 'segwit') {
				const kind = segwitParts(address).version === 0 ? 'Bech32' : 'Bech32m';
				return {
					address: replaceAt(address, address.length - 1, nextIn(BECH32_ALPHABET, last)),
					reason: `The last character is changed, so the ${kind} checksum does not match.`
				};
			}
			return {
				address: replaceAt(address, address.length - 1, nextIn(BASE58_ALPHABET, last)),
				reason: 'The last character is changed, so the Base58Check checksum does not match.'
			};
		}
	},
	{
		id: 'wrong-network',
		build: (target) => {
			if (target.chain !== 'bitcoin') throw new Error('Bitcoin only');
			const other: BitcoinNetwork = target.network === 'mainnet' ? 'testnet' : 'mainnet';
			const address = generateAddress(target);
			let wrong: string;
			if (target.type === 'p2pkh' || target.type === 'p2sh') {
				const payload = base58CheckPayload(address);
				payload[0] = VERSION[other][target.type];
				wrong = encodeBase58Check(payload);
			} else {
				const { version, program } = segwitParts(address);
				wrong = rawSegwit(PREFIX[other], version, program);
			}
			return {
				address: wrong,
				reason: `A ${other} address where ${target.network} is selected.`
			};
		}
	},
	{
		id: 'wrong-encoding',
		build: (target) => {
			const { prefix, version, program } = segwitParts(generateAddress(target));
			const [used, required] = version === 0 ? [bech32m, 'Bech32'] : [bech32, 'Bech32m'];
			return {
				address: rawSegwit(prefix, version, program, used),
				reason: `Witness v${version} encoded with ${required === 'Bech32' ? 'Bech32m' : 'Bech32'} instead of ${required} (BIP-350).`
			};
		}
	},
	{
		id: 'mixed-case',
		build: (target) => {
			const address = generateAddress(target);
			const data = address.lastIndexOf('1') + 1;
			const index = [...address].findIndex((c, i) => i >= data && /[a-z]/.test(c));
			return {
				address: replaceAt(address, index, address[index].toUpperCase()),
				reason: 'One letter is uppercase; Bech32 must be all lowercase or all uppercase.'
			};
		}
	},
	{
		id: 'missing-prefix',
		build: () => ({
			address: generateEvmAddress().slice(2),
			reason: '40 hex characters without the 0x prefix.'
		})
	},
	{
		id: 'look-alike',
		build: (target) => {
			const source = lookAlikeSource(target);
			return {
				address: generateAddress(source),
				reason: `Source chain: ${CHAIN_NAMES[source.chain]}. Valid there, not ${describeTargetName(target)}.`,
				sourceChain: source.chain
			};
		}
	},
	{
		id: 'whitespace',
		build: (target) => ({
			address: ` ${generateAddress(target)} `,
			reason: 'A space before and after the address.'
		})
	},
	{
		id: 'zero-width',
		build: (target) => {
			const address = generateAddress(target);
			return {
				address: `${address.slice(0, middle(address))}\u200b${address.slice(middle(address))}`,
				reason: 'A zero-width space (U+200B) inside the address; it is invisible when pasted.'
			};
		}
	},
	{
		id: 'empty',
		build: () => ({ address: '', reason: 'No characters at all.' })
	}
];

const RISKY: readonly Spec<RiskyId>[] = [
	{
		id: 'all-lowercase',
		build: () => ({
			address: generateEvmAddress().toLowerCase(),
			reason: 'Valid, but carries no checksum, so a typo cannot be detected.'
		})
	},
	{
		id: 'zero-address',
		build: () => ({
			address: `0x${'0'.repeat(40)}`,
			reason: 'Valid format, but funds sent here are lost.'
		})
	},
	{
		id: 'off-curve',
		build: () => ({
			address: solanaRiskySamples()[0].address,
			reason:
				'Valid, but not on the ed25519 curve, like a program-derived address: no key can sign for it.'
		})
	}
];

export function buildVariant(target: AddressTarget, id: VariantId | RiskyId): VariantRow {
	const option = variantOption(target, id);
	const spec = [...VARIANTS, ...RISKY].find((v) => v.id === id);
	if (!option || !spec) throw new RangeError(`variant ${id} does not apply to ${target.chain}`);
	return { ...spec.build(target), variantId: `${target.chain}.${id}`, ...option };
}
