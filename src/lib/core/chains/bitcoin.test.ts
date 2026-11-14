import { afterEach, describe, expect, it, vi } from 'vitest';
import { hex } from '@scure/base';
import { decodeBase58Check, encodeBase58Check } from '../encoding/base58check.ts';
import { encodeSegwitAddress } from '../encoding/bech32.ts';
import {
	addressFromPublicKey,
	generateBitcoinAddress,
	hash160,
	taprootOutputKey,
	validateBitcoinAddress,
	type BitcoinNetwork,
	type BitcoinType
} from './bitcoin.ts';

// Bitcoin module (T-019): FR-010 AC-2, AC-5. The Taproot tweak is written by hand on top of
// noble, so it is held to every BIP-341 wallet vector, and every generated address must pass the
// validator for its own type and network.

const TYPES: BitcoinType[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2tr'];
const NETWORKS: BitcoinNetwork[] = ['mainnet', 'testnet'];

// BIP-341 wallet-test-vectors.json, "scriptPubKey": internal key, merkle root (null for key path
// only), tweaked output key, and BIP-350 address. Copied verbatim from
// https://github.com/bitcoin/bips/blob/master/bip-0341/wallet-test-vectors.json.
const BIP341: [string, string | null, string, string][] = [
	[
		'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d',
		null,
		'53a1f6e454df1aa2776a2814a721372d6258050de330b3c6d10ee8f4e0dda343',
		'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5'
	],
	[
		'187791b6f712a8ea41c8ecdd0ee77fab3e85263b37e1ec18a3651926b3a6cf27',
		'5b75adecf53548f3ec6ad7d78383bf84cc57b55a3127c72b9a2481752dd88b21',
		'147c9c57132f6e7ecddba9800bb0c4449251c92a1e60371ee77557b6620f3ea3',
		'bc1pz37fc4cn9ah8anwm4xqqhvxygjf9rjf2resrw8h8w4tmvcs0863sa2e586'
	],
	[
		'93478e9488f956df2396be2ce6c5cced75f900dfa18e7dabd2428aae78451820',
		'c525714a7f49c28aedbbba78c005931a81c234b2f6c99a73e4d06082adc8bf2b',
		'e4d810fd50586274face62b8a807eb9719cef49c04177cc6b76a9a4251d5450e',
		'bc1punvppl2stp38f7kwv2u2spltjuvuaayuqsthe34hd2dyy5w4g58qqfuag5'
	],
	[
		'ee4fe085983462a184015d1f782d6a5f8b9c2b60130aff050ce221ecf3786592',
		'6c2dc106ab816b73f9d07e3cd1ef2c8c1256f519748e0813e4edd2405d277bef',
		'712447206d7a5238acc7ff53fbe94a3b64539ad291c7cdbc490b7577e4b17df5',
		'bc1pwyjywgrd0ffr3tx8laflh6228dj98xkjj8rum0zfpd6h0e930h6saqxrrm'
	],
	[
		'f9f400803e683727b14f463836e1e78e1c64417638aa066919291a225f0e8dd8',
		'ab179431c28d3b68fb798957faf5497d69c883c6fb1e1cd9f81483d87bac90cc',
		'77e30a5522dd9f894c3f8b8bd4c4b2cf82ca7da8a3ea6a239655c39c050ab220',
		'bc1pwl3s54fzmk0cjnpl3w9af39je7pv5ldg504x5guk2hpecpg2kgsqaqstjq'
	],
	[
		'e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f',
		'ccbd66c6f7e8fdab47b3a486f59d28262be857f30d4773f2d5ea47f7761ce0e2',
		'91b64d5324723a985170e4dc5a0f84c041804f2cd12660fa5dec09fc21783605',
		'bc1pjxmy65eywgafs5tsunw95ruycpqcqnev6ynxp7jaasylcgtcxczs6n332e'
	],
	[
		'55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d',
		'2f6b2c5397b6d68ca18e09a3f05161668ffe93a988582d55c6f07bd5b3329def',
		'75169f4001aa68f15bbed28b218df1d0a62cbbcf1188c6665110c293c907b831',
		'bc1pw5tf7sqp4f50zka7629jrr036znzew70zxyvvej3zrpf8jg8hqcssyuewe'
	]
];

// BIP-86 test vectors, account 0 receiving addresses 0 and 1: internal key, output key, address.
const BIP86: [string, string, string][] = [
	[
		'cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115',
		'a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c',
		'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
	],
	[
		'83dfe85a3151d2517290da461fe2815591ef69f2b18a2ce63f01697a8b313145',
		'a82f29944d65b86ae6b5e5cc75e294ead6c59391a1edc5e016e3498c67fc7bbb',
		'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh'
	]
];

afterEach(() => {
	vi.restoreAllMocks();
});

describe('taprootOutputKey (BIP-341, BIP-86)', () => {
	it.each(BIP341)('internal %s, merkle root %s → %s', (internal, root, tweaked, address) => {
		const output = taprootOutputKey(hex.decode(internal), root ? hex.decode(root) : undefined);
		expect(hex.encode(output)).toBe(tweaked);
		expect(encodeSegwitAddress('bc', 1, output)).toBe(address);
	});

	it.each(BIP86)('BIP-86 internal key %s → output %s', (internal, output, address) => {
		expect(hex.encode(taprootOutputKey(hex.decode(internal)))).toBe(output);
		expect(encodeSegwitAddress('bc', 1, hex.decode(output))).toBe(address);
	});

	it('rejects an internal key that is not 32 bytes or not on the curve', () => {
		expect(() => taprootOutputKey(new Uint8Array(33))).toThrow(RangeError);
		// x = 5 has no point on secp256k1.
		expect(() => taprootOutputKey(hex.decode(`${'00'.repeat(31)}05`))).toThrow();
	});
});

describe('addressFromPublicKey', () => {
	it('P2PKH: the Bitcoin wiki worked example', () => {
		// https://en.bitcoin.it/wiki/Technical_background_of_version_1_Bitcoin_addresses
		const publicKey = hex.decode(
			'0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352'
		);
		expect(hex.encode(hash160(publicKey))).toBe('f54a5851e9372b87810a8e60cdd2e7cfd80b6e31');
		expect(addressFromPublicKey(publicKey, 'p2pkh', 'mainnet')).toBe(
			'1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs'
		);
	});

	it('P2SH-P2WPKH: the BIP-49 testnet example', () => {
		const publicKey = hex.decode(
			'03a1af804ac108a8a51782198c2d034b28bf90c8803f5a53f76276fa69a4eae77f'
		);
		expect(hex.encode(hash160(publicKey))).toBe('38971f73930f6c141d977ac4fd4a727c854935b3');
		expect(addressFromPublicKey(publicKey, 'p2sh', 'testnet')).toBe(
			'2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2'
		);
	});

	it('P2WPKH: the BIP-84 first two receiving addresses', () => {
		expect(
			addressFromPublicKey(
				hex.decode('0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c'),
				'p2wpkh',
				'mainnet'
			)
		).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
		expect(
			addressFromPublicKey(
				hex.decode('03e775fd51f0dfb8cd865d9ff1cca2a158cf651fe997fdc9fee9c1d3b5e995ea77'),
				'p2wpkh',
				'mainnet'
			)
		).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
	});

	it('P2TR: the BIP-86 first receiving address from its compressed key', () => {
		// The x-only internal key is the compressed key without its parity byte.
		for (const parity of ['02', '03']) {
			expect(addressFromPublicKey(hex.decode(`${parity}${BIP86[0][0]}`), 'p2tr', 'mainnet')).toBe(
				BIP86[0][2]
			);
		}
	});

	it('uses the network version bytes and prefixes', () => {
		const publicKey = hex.decode(
			'0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352'
		);
		const prefixes = TYPES.flatMap((type) =>
			NETWORKS.map((network) => addressFromPublicKey(publicKey, type, network).slice(0, 4))
		);
		expect(prefixes.map((p) => p[0])).toEqual([
			'1',
			expect.stringMatching(/[mn]/),
			'3',
			'2',
			'b',
			't',
			'b',
			't'
		]);
		expect(prefixes.slice(4)).toEqual(['bc1q', 'tb1q', 'bc1p', 'tb1p']);
	});

	it('uses the version bytes 0x00, 0x05 (mainnet) and 0x6f, 0xc4 (testnet)', () => {
		const publicKey = hex.decode(
			'0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352'
		);
		const versions = (['p2pkh', 'p2sh'] as const).flatMap((type) =>
			NETWORKS.map((network) => {
				const decoded = decodeBase58Check(addressFromPublicKey(publicKey, type, network));
				return decoded.ok ? decoded.value[0] : null;
			})
		);
		expect(versions).toEqual([0x00, 0x6f, 0x05, 0xc4]);
	});

	it('only takes a compressed public key', () => {
		expect(() => addressFromPublicKey(new Uint8Array(65), 'p2pkh', 'mainnet')).toThrow(RangeError);
	});
});

describe('generateBitcoinAddress', () => {
	it('derives from crypto.getRandomValues: the wiki private key gives the wiki address', () => {
		const realRandom = crypto.getRandomValues.bind(crypto);
		let keyBuffer: Uint8Array | undefined;
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			if (!(array instanceof Uint8Array) || array.length !== 32) return realRandom(array);
			array.set(hex.decode('18e14a7b6a307f426a94f8114701e7c8e774e7f9a47e2c2035db29a206321725'));
			keyBuffer = array;
			return array;
		});

		expect(generateBitcoinAddress('p2pkh', 'mainnet')).toBe('1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs');
		expect(keyBuffer && [...keyBuffer]).toEqual(new Array(32).fill(0));
	});

	for (const type of TYPES) {
		for (const network of NETWORKS) {
			it(`${type} ${network}: 100 generated addresses pass the validator (FR-010 AC-2)`, () => {
				const seen = new Set<string>();
				for (let i = 0; i < 100; i++) {
					const address = generateBitcoinAddress(type, network);
					expect(validateBitcoinAddress(address, type, network), address).toEqual({
						ok: true,
						value: {}
					});
					seen.add(address);
				}
				expect(seen.size).toBe(100);
			});
		}
	}
});

describe('validateBitcoinAddress', () => {
	const key = hex.decode('0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352');
	const address = (type: BitcoinType, network: BitcoinNetwork) =>
		addressFromPublicKey(key, type, network);

	it('a valid address passes only for its own type and network', () => {
		for (const type of TYPES) {
			for (const network of NETWORKS) {
				for (const askedType of TYPES) {
					for (const askedNetwork of NETWORKS) {
						const result = validateBitcoinAddress(address(type, network), askedType, askedNetwork);
						expect(result.ok).toBe(type === askedType && network === askedNetwork);
					}
				}
			}
		}
	});

	it('names a testnet address offered for mainnet, and the reverse', () => {
		for (const type of TYPES) {
			expect(validateBitcoinAddress(address(type, 'testnet'), type, 'mainnet')).toEqual({
				ok: false,
				error: 'wrong-network'
			});
			expect(validateBitcoinAddress(address(type, 'mainnet'), type, 'testnet')).toEqual({
				ok: false,
				error: 'wrong-network'
			});
		}
	});

	it('names another type of the same network', () => {
		expect(validateBitcoinAddress(address('p2sh', 'mainnet'), 'p2pkh', 'mainnet')).toEqual({
			ok: false,
			error: 'wrong-type'
		});
		expect(validateBitcoinAddress(address('p2tr', 'mainnet'), 'p2wpkh', 'mainnet')).toEqual({
			ok: false,
			error: 'wrong-type'
		});
		// A 32-byte v0 program is P2WSH (BIP-173 vector), not P2WPKH.
		expect(
			validateBitcoinAddress(
				'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
				'p2wpkh',
				'testnet'
			)
		).toEqual({ ok: false, error: 'wrong-type' });
	});

	it('names the Bech32 / Bech32m mix-up (EC-007)', () => {
		// BIP-350: a v1 program encoded with Bech32.
		expect(
			validateBitcoinAddress(
				'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
				'p2tr',
				'mainnet'
			)
		).toEqual({ ok: false, error: 'wrong-encoding' });
		// BIP-350: a v0 program encoded with Bech32m.
		expect(
			validateBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh', 'p2wpkh', 'mainnet')
		).toEqual({ ok: false, error: 'wrong-encoding' });
	});

	it.each([
		['', 'p2pkh', 'empty'],
		['1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt', 'p2pkh', 'bad-checksum'],
		['1PMycacnJaSqwwJqjawXBErnLsZ7RkXUA0', 'p2pkh', 'invalid-character'],
		['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'p2pkh', 'wrong-prefix'],
		['bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv', 'p2wpkh', 'bad-checksum'],
		['bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306FYU', 'p2wpkh', 'mixed-case'],
		['ltc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'p2wpkh', 'bad-checksum'],
		['bc1pw5dgrnzv', 'p2tr', 'wrong-length']
	] as const)('%j as %s fails as %s', (text, type, defect) => {
		expect(validateBitcoinAddress(text, type, 'mainnet')).toEqual({ ok: false, error: defect });
	});

	it('rejects a Base58Check payload of the wrong length', () => {
		const long = encodeBase58Check(Uint8Array.from([0x00, ...new Uint8Array(21)]));
		expect(validateBitcoinAddress(long, 'p2pkh', 'mainnet')).toEqual({
			ok: false,
			error: 'wrong-length'
		});
	});

	it('names an unknown segwit prefix', () => {
		const regtest = encodeSegwitAddress('bcrt', 0, new Uint8Array(20).fill(1));
		expect(validateBitcoinAddress(regtest, 'p2wpkh', 'mainnet')).toEqual({
			ok: false,
			error: 'wrong-prefix'
		});
	});
});
