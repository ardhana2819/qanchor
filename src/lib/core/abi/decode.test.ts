import { describe, expect, it } from 'vitest';
import { dataWords, decodeCall, decodeParams, splitCalldata, type Calldata } from './decode.ts';
import { parseSignature } from './parse.ts';
import type { AbiFunction } from './types.ts';

// Encodings are written out word by word here, independently of the decoder: a number is a
// left-padded word, text is right-padded UTF-8. The first five vectors are the examples of the
// Solidity ABI specification ("Examples" and "Use of Dynamic Types").

const num = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const neg = (n: bigint) => ((1n << 256n) + n).toString(16);
const text = (s: string) => {
	const hex = Buffer.from(s, 'utf8').toString('hex');
	return hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
};
const words = (...parts: string[]) => `0x${parts.join('')}`;

function sig(text: string): AbiFunction {
	const result = parseSignature(text);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

function calldata(hex: string): Calldata {
	const result = splitCalldata(hex);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** Decodes `args` hex (no selector) as the inputs of `signature`. */
function decode(signature: string, args: string) {
	return decodeParams(sig(signature).inputs, calldata(`0x00000000${args.slice(2)}`).data);
}

function values(signature: string, args: string) {
	const result = decode(signature, args);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

const ADDRESS = '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const ADDRESS_EIP55 = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('splitCalldata', () => {
	it('splits the selector from the arguments, trimming whitespace', () => {
		const result = splitCalldata(`  0xA9059CBB${num(1)}\n`);
		expect(result.ok && result.value.selector).toBe('0xa9059cbb');
		expect(result.ok && result.value.data.length).toBe(32);
	});

	it.each([
		['', 'empty'],
		['   ', 'empty'],
		['0x', 'no-selector'],
		['0X', 'no-selector'],
		['0xa9059c', 'no-selector'],
		['0xa9059cb', 'odd-length'],
		['0xa9059cbz', 'not-hex'],
		['0x a9059cbb', 'not-hex']
	])('%j -> %s', (input, error) => {
		expect(splitCalldata(input)).toEqual({ ok: false, error });
	});

	it('takes exactly 4 bytes as a selector with no arguments', () => {
		const result = splitCalldata('0x3ccfd60b');
		expect(result.ok && [result.value.selector, result.value.data.length]).toEqual([
			'0x3ccfd60b',
			0
		]);
	});
});

describe('decodeParams: published vectors', () => {
	it('baz(uint32,bool) with 69, true', () => {
		expect(values('baz(uint32,bool)', words(num(69), num(1))).args).toEqual([
			{ kind: 'uint', value: 69n },
			{ kind: 'bool', value: true }
		]);
	});

	it('bar(bytes3[2]) with "abc", "def"', () => {
		expect(values('bar(bytes3[2])', words(text('abc'), text('def'))).args).toEqual([
			{
				kind: 'array',
				items: [
					{ kind: 'fixed-bytes', value: '0x616263' },
					{ kind: 'fixed-bytes', value: '0x646566' }
				]
			}
		]);
	});

	it('sam(bytes,bool,uint256[]) with "dave", true, [1,2,3]', () => {
		const data = words(
			num(0x60),
			num(1),
			num(0xa0),
			num(4),
			text('dave'),
			num(3),
			num(1),
			num(2),
			num(3)
		);
		expect(values('sam(bytes,bool,uint256[])', data)).toEqual({
			args: [
				{ kind: 'bytes', value: '0x64617665' },
				{ kind: 'bool', value: true },
				{
					kind: 'array',
					items: [1n, 2n, 3n].map((value) => ({ kind: 'uint', value }))
				}
			],
			extraBytes: 0
		});
	});

	it('f(uint256,uint32[],bytes10,bytes) with 0x123, [0x456,0x789], "1234567890", "Hello, world!"', () => {
		const data = words(
			num(0x123),
			num(0x80),
			text('1234567890'),
			num(0xe0),
			num(2),
			num(0x456),
			num(0x789),
			num(13),
			text('Hello, world!')
		);
		expect(values('f(uint256,uint32[],bytes10,bytes)', data)).toEqual({
			args: [
				{ kind: 'uint', value: 0x123n },
				{
					kind: 'array',
					items: [
						{ kind: 'uint', value: 0x456n },
						{ kind: 'uint', value: 0x789n }
					]
				},
				{ kind: 'fixed-bytes', value: '0x31323334353637383930' },
				{ kind: 'bytes', value: '0x48656c6c6f2c20776f726c6421' }
			],
			extraBytes: 0
		});
	});

	it('g(uint256[][],string[]) with [[1,2],[3]], ["one","two","three"]', () => {
		const data = words(
			num(0x40),
			num(0x140),
			num(2),
			num(0x40),
			num(0xa0),
			num(2),
			num(1),
			num(2),
			num(1),
			num(3),
			num(3),
			num(0x60),
			num(0xa0),
			num(0xe0),
			num(3),
			text('one'),
			num(3),
			text('two'),
			num(5),
			text('three')
		);
		const uints = (...ns: bigint[]) => ({
			kind: 'array',
			items: ns.map((value) => ({ kind: 'uint', value }))
		});
		expect(values('g(uint256[][],string[])', data)).toEqual({
			args: [
				{ kind: 'array', items: [uints(1n, 2n), uints(3n)] },
				{
					kind: 'array',
					items: ['one', 'two', 'three'].map((value) => ({ kind: 'string', value }))
				}
			],
			extraBytes: 0
		});
	});

	it('ERC-20 transfer: address in EIP-55 form, uint256 as an exact integer (FR-050 AC-4)', () => {
		const max = (1n << 256n) - 1n;
		expect(
			values('transfer(address,uint256)', words(num(0).slice(0, 24) + ADDRESS, num(max))).args
		).toEqual([
			{ kind: 'address', value: ADDRESS_EIP55 },
			{ kind: 'uint', value: max }
		]);
	});

	it('nested dynamic tuples and a fixed array inside the head', () => {
		// h((uint256,string),bool[2],(address,bytes)[]) with (7,"hi"), [true,false], [(addr,0xabcdef)]
		const data = words(
			num(0x80), // offset of the first tuple
			num(1),
			num(0), // bool[2] inline
			num(0x100), // offset of the tuple array
			num(7),
			num(0x40),
			num(2),
			text('hi'),
			num(1), // array length
			num(0x20), // offset of item 0, from after the length word
			num(0).slice(0, 24) + ADDRESS,
			num(0x40),
			num(3),
			'abcdef'.padEnd(64, '0')
		);
		const fn = sig('h((uint256 n, string s) a, bool[2] flags, (address who, bytes data)[] items)');
		expect(decodeParams(fn.inputs, Buffer.from(data.slice(2), 'hex'))).toEqual({
			ok: true,
			value: {
				args: [
					{
						kind: 'tuple',
						items: [
							{ kind: 'uint', value: 7n },
							{ kind: 'string', value: 'hi' }
						]
					},
					{
						kind: 'array',
						items: [
							{ kind: 'bool', value: true },
							{ kind: 'bool', value: false }
						]
					},
					{
						kind: 'array',
						items: [
							{
								kind: 'tuple',
								items: [
									{ kind: 'address', value: ADDRESS_EIP55 },
									{ kind: 'bytes', value: '0xabcdef' }
								]
							}
						]
					}
				],
				extraBytes: 0
			}
		});
	});

	it('static tuples are inline: exactInputSingle', () => {
		const fn = sig(
			'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'
		);
		const addr = num(0).slice(0, 24) + ADDRESS;
		const data = words(
			addr,
			addr,
			num(3000),
			addr,
			num(1_700_000_000),
			num(10n ** 18n),
			num(0),
			num(0)
		);
		const result = decodeParams(fn.inputs, Buffer.from(data.slice(2), 'hex'));
		expect(result.ok && result.value.args[0]).toMatchObject({
			kind: 'tuple',
			items: [
				{ value: ADDRESS_EIP55 },
				{},
				{ kind: 'uint', value: 3000n },
				{},
				{},
				{ value: 10n ** 18n },
				{},
				{}
			]
		});
	});

	it('a fixed array of dynamic items is itself dynamic: string[2]', () => {
		const data = words(num(0x20), num(0x40), num(0x80), num(1), text('a'), num(2), text('é'));
		expect(values('f(string[2])', data).args).toEqual([
			{
				kind: 'array',
				items: [
					{ kind: 'string', value: 'a' },
					{ kind: 'string', value: 'é' }
				]
			}
		]);
	});

	it('empty bytes, empty string, and an empty dynamic array', () => {
		const data = words(num(0x60), num(0x80), num(0xa0), num(0), num(0), num(0));
		expect(values('f(bytes,string,uint8[])', data)).toEqual({
			args: [
				{ kind: 'bytes', value: '0x' },
				{ kind: 'string', value: '' },
				{ kind: 'array', items: [] }
			],
			extraBytes: 0
		});
	});
});

describe('decodeParams: integer boundaries', () => {
	it.each([
		['uint8', num(255), 255n],
		['uint256', num(0), 0n],
		['int8', num(127), 127n],
		['int8', neg(-1n), -1n],
		['int8', neg(-128n), -128n],
		['int256', neg(-(1n << 255n)), -(1n << 255n)],
		['int256', num((1n << 255n) - 1n), (1n << 255n) - 1n],
		['uint160', num((1n << 160n) - 1n), (1n << 160n) - 1n]
	])('%s %s', (type, word, value) => {
		expect(values(`f(${type})`, words(word)).args).toEqual([
			{ kind: type.startsWith('u') ? 'uint' : 'int', value }
		]);
	});
});

describe('decodeParams: malformed data gives one error and no values (FR-052 AC-4)', () => {
	it.each([
		['f(uint8)', words(num(256)), 'Argument 1: value does not fit in uint8.'],
		['f(uint160 x)', words(num(1n << 160n)), 'Argument 1 (x): value does not fit in uint160.'],
		['f(int8)', words(num(128)), 'Argument 1: value does not fit in int8.'],
		['f(int8)', words(neg(-129n)), 'Argument 1: value does not fit in int8.'],
		[
			'f(address)',
			words('01' + num(0).slice(2, 24) + ADDRESS),
			'Argument 1: address has non-zero padding.'
		],
		['f(bool)', words(num(2)), 'Argument 1: bool is 2, not 0 or 1.'],
		['f(bytes3)', words(text('abcd')), 'Argument 1: bytes3 has non-zero padding.'],
		['f(uint256,uint256 b)', words(num(1)), 'Argument 2 (b): data ends before this value.'],
		['f(uint256)', '0x' + num(1).slice(0, 62), 'Argument 1: data ends before this value.'],
		['f(bytes)', words(num(0x1000)), 'Argument 1: offset 4096 points past the end of the data.'],
		['f(bytes)', words(num(0x40)), 'Argument 1: offset 64 points past the end of the data.'],
		['f(bytes)', words(num(0x20)), 'Argument 1: data ends before this value.'],
		[
			'f(bytes)',
			words(num(0x20), num(33), text('a')),
			'Argument 1: length 33 runs past the end of the data.'
		],
		[
			'f(string)',
			words(num(0x20), num(1n << 255n)),
			'Argument 1: length 57896044618658097711785492504343953926634992332820282019728792003956564819968 runs past the end of the data.'
		],
		[
			'f(string)',
			words(num(0x20), num(2), 'c328'.padEnd(64, '0')),
			'Argument 1: string is not valid UTF-8.'
		],
		[
			'f(uint256[] ids)',
			words(num(0x20), num(1n << 255n)),
			'Argument 1 (ids): array length 57896044618658097711785492504343953926634992332820282019728792003956564819968 exceeds the data.'
		],
		[
			'f(uint256[] ids)',
			words(num(0x20), num(3), num(1), num(2)),
			'Argument 1 (ids): array of 3 items runs past the end of the data.'
		],
		[
			'f(uint256[3])',
			words(num(1), num(2)),
			'Argument 1: array of 3 items runs past the end of the data.'
		],
		[
			'f(string[] names)',
			words(num(0x20), num(2), num(0x40), num(0x400), num(1), text('a')),
			'Argument 1 (names)[1]: offset 1024 points past the end of the data.'
		],
		[
			'f((uint256 n, bytes data) t)',
			words(num(0x20), num(1), num(0x40)),
			'Argument 1 (t).data: data ends before this value.'
		]
	])('%s %s', (signature, data, message) => {
		expect(decode(signature, data)).toEqual({ ok: false, error: message });
	});

	it('checks a nested offset against its own encoding, not the whole data', () => {
		// Item offsets count from after the length word (0x40), so 0x40 + 0x40 is past the end.
		expect(decode('f(string[] names)', words(num(0x20), num(1), num(0x40)))).toEqual({
			ok: false,
			error: 'Argument 1 (names)[0]: offset 64 points past the end of the data.'
		});
	});

	it('refuses offsets that alias the same data over and over', () => {
		// 100 items all pointing at one 1 KB bytes value: a valid encoding never rereads data.
		const count = 100;
		const offsets = Array.from({ length: count }, () => num(count * 32));
		const data = words(num(0x20), num(count), ...offsets, num(1024), '00'.repeat(1024));
		expect(decode('f(bytes[])', data)).toEqual({
			ok: false,
			error: 'Argument 1[15]: offsets point to the same data many times over.'
		});
	});

	it('accepts offsets that point backwards or share data within the budget', () => {
		// Both strings point at the same tail: unusual but within the spec.
		const data = words(num(0x40), num(0x40), num(2), text('hi'));
		expect(values('f(string,string)', data).args).toEqual([
			{ kind: 'string', value: 'hi' },
			{ kind: 'string', value: 'hi' }
		]);
	});
});

describe('decodeCall', () => {
	const transfer = sig('transfer(address to, uint256 amount)');
	const approve = sig('approve(address,uint256)');
	const args = num(0).slice(0, 24) + ADDRESS + num(10n ** 6n);

	it('decodes with the function whose selector matches (FR-050 AC-1, AC-2)', () => {
		const result = decodeCall([approve, transfer], calldata(`0xa9059cbb${args}`));
		expect(result).toEqual({
			ok: true,
			value: {
				fn: transfer,
				selector: '0xa9059cbb',
				args: [
					{ kind: 'address', value: ADDRESS_EIP55 },
					{ kind: 'uint', value: 1_000_000n }
				],
				extraBytes: 0
			}
		});
	});

	it('shows both selectors on a mismatch (FR-052 AC-3)', () => {
		expect(decodeCall([approve], calldata(`0xa9059cbb${args}`))).toEqual({
			ok: false,
			error: { kind: 'selector-mismatch', calldata: '0xa9059cbb', abi: ['0x095ea7b3'] }
		});
		expect(decodeCall([approve, approve, transfer], calldata(`0x23b872dd${args}`))).toEqual({
			ok: false,
			error: {
				kind: 'selector-mismatch',
				calldata: '0x23b872dd',
				abi: ['0x095ea7b3', '0xa9059cbb']
			}
		});
	});

	it('flags trailing bytes as extra, not as an error (EC-014)', () => {
		const result = decodeCall([transfer], calldata(`0xa9059cbb${args}deadbeef00`));
		expect(result.ok && result.value.extraBytes).toBe(5);
	});

	it('decodes selector-only calldata for a zero-argument function (EC-014)', () => {
		const withdraw = sig('withdraw()');
		expect(decodeCall([withdraw], calldata('0x3ccfd60b'))).toEqual({
			ok: true,
			value: { fn: withdraw, selector: '0x3ccfd60b', args: [], extraBytes: 0 }
		});
		const extra = decodeCall([withdraw], calldata(`0x3ccfd60b${num(1)}`));
		expect(extra.ok && extra.value.extraBytes).toBe(32);
	});

	it('accepts a last bytes value without its padding, with no extra bytes', () => {
		expect(values('f(bytes)', words(num(0x20), num(3), 'abcdef'))).toEqual({
			args: [{ kind: 'bytes', value: '0xabcdef' }],
			extraBytes: 0
		});
	});

	it('counts bytes after the last dynamic value as extra', () => {
		const result = decode('f(bytes)', words(num(0x20), num(3), text('abc'), num(9)));
		expect(result.ok && result.value.extraBytes).toBe(32);
	});

	it('reports a decoding problem as invalid with its message', () => {
		expect(decodeCall([transfer], calldata(`0xa9059cbb${num(1)}`))).toEqual({
			ok: false,
			error: { kind: 'invalid', message: 'Argument 2 (amount): data ends before this value.' }
		});
	});
});

describe('dataWords (FR-051 AC-2)', () => {
	it('splits argument data into 32-byte words with their offsets', () => {
		const data = calldata(`0x12345678${num(1)}${num(0x20)}`).data;
		expect(dataWords(data)).toEqual([
			{ offset: 0, hex: `0x${num(1)}` },
			{ offset: 32, hex: `0x${num(0x20)}` }
		]);
	});

	it('keeps a short last word as it is', () => {
		const data = calldata(`0x12345678${num(1)}abcd`).data;
		expect(dataWords(data).at(-1)).toEqual({ offset: 32, hex: '0xabcd' });
	});

	it('gives no words for selector-only calldata', () => {
		expect(dataWords(calldata('0x12345678').data)).toEqual([]);
	});
});
