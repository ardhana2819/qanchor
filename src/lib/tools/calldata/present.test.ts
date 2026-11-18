import { describe, expect, it } from 'vitest';
import { decodeParams } from '#lib/core/abi/decode.ts';
import { parseSignature } from '#lib/core/abi/parse.ts';
import { argumentRows, decodeErrorCopy, extraBytesCopy } from './present.ts';

const num = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');

function rows(signature: string, hex: string) {
	const fn = parseSignature(signature);
	if (!fn.ok) throw new Error(fn.error);
	const decoded = decodeParams(fn.value.inputs, Buffer.from(hex, 'hex'));
	if (!decoded.ok) throw new Error(decoded.error);
	return argumentRows(fn.value.inputs, decoded.value.args).map(({ index, name, type, value }) => [
		index,
		name,
		type,
		value
	]);
}

describe('argumentRows', () => {
	it('one row per scalar argument; integers as exact decimals; bools as words', () => {
		const max = (1n << 256n) - 1n;
		expect(rows('f(uint256 a, int8 b, bool c)', num(max) + 'f'.repeat(64) + num(0))).toEqual([
			[1, 'a', 'uint256', max.toString()],
			[2, 'b', 'int8', '-1'],
			[3, 'c', 'bool', 'false']
		]);
	});

	it('arrays and tuples become one row per item, named by path', () => {
		// f((address who, uint256[] ids) order, bytes2[2])
		const hex =
			num(0x60) + // offset of the tuple
			'ab00'.padEnd(64, '0') +
			'cd00'.padEnd(64, '0') +
			num(5) + // who (as an address word)
			num(0x40) +
			num(2) +
			num(7) +
			num(8);
		expect(rows('f((address who, uint256[] ids) order, bytes2[2])', hex)).toEqual([
			[1, 'order.who', 'address', '0x0000000000000000000000000000000000000005'],
			[1, 'order.ids[0]', 'uint256', '7'],
			[1, 'order.ids[1]', 'uint256', '8'],
			[2, '[0]', 'bytes2', '0xab00'],
			[2, '[1]', 'bytes2', '0xcd00']
		]);
	});

	it('unnamed tuple components are named by position; an empty array has one row', () => {
		// Head: offset of t, then n = 9. t: offset of its array, then the array's length 0.
		const hex = num(0x40) + num(9) + num(0x20) + num(0);
		expect(rows('f((uint8[]) t, uint8 n)', hex)).toEqual([
			[1, 't.0', 'uint8[]', 'Empty array'],
			[2, 'n', 'uint8', '9']
		]);
	});

	it('gives every row a different key', () => {
		const fn = parseSignature('f(uint8[] a, uint8[] b)');
		if (!fn.ok) throw new Error(fn.error);
		const hex = num(0x40) + num(0x80) + num(1) + num(1) + num(1) + num(2);
		const decoded = decodeParams(fn.value.inputs, Buffer.from(hex, 'hex'));
		if (!decoded.ok) throw new Error(decoded.error);
		const keys = argumentRows(fn.value.inputs, decoded.value.args).map((row) => row.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('copy', () => {
	it('a mismatch shows both selectors (FR-052 AC-3, design S-06)', () => {
		expect(
			decodeErrorCopy({ kind: 'selector-mismatch', calldata: '0xa9059cbb', abi: ['0x095ea7b3'] })
		).toEqual({
			title: 'Selector mismatch',
			text: 'Selector mismatch: calldata 0xa9059cbb, ABI 0x095ea7b3.'
		});
		expect(
			decodeErrorCopy({ kind: 'selector-mismatch', calldata: '0x1', abi: ['0x2', '0x3'] }).text
		).toBe('Selector mismatch: calldata 0x1, ABI 0x2, 0x3.');
	});

	it('a decoding error says nothing was decoded (FR-052 AC-4)', () => {
		expect(
			decodeErrorCopy({ kind: 'invalid', message: 'Argument 1: bool is 2, not 0 or 1.' })
		).toEqual({
			title: 'Decoding failed',
			text: 'Argument 1: bool is 2, not 0 or 1. Nothing was decoded: the data does not match these argument types.'
		});
	});

	it('extra bytes, singular and plural (EC-014)', () => {
		expect(extraBytesCopy(1)).toBe(
			'1 extra byte after the arguments. They are not part of the call as decoded.'
		);
		expect(extraBytesCopy(32)).toMatch(/^32 extra bytes /);
	});
});
