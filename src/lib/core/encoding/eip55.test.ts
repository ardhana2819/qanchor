import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import { checksumStatus, toChecksumAddress } from './eip55.ts';

// Test cases copied verbatim from EIP-55
// (https://github.com/ethereum/ERCs/blob/master/ERCS/erc-55.md#test-cases).
const EIP55 = [
	// All caps
	'0x52908400098527886E0F7030069857D2E4169EE7',
	'0x8617E340B3D01FA5F11F306F4090FD50E238070D',
	// All lower
	'0xde709f2102306220921060314715629080e2fb77',
	'0x27b1fdb04752bbc536007a920d24acb045561c26',
	// Normal
	'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
	'0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
	'0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
	'0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'
];

const bytes = (address: string) => hex.decode(address.slice(2).toLowerCase());

describe('toChecksumAddress (EIP-55)', () => {
	it.each(EIP55)('gives %s', (address) => {
		expect(toChecksumAddress(bytes(address))).toBe(address);
	});

	it('rejects anything but 20 bytes', () => {
		expect(() => toChecksumAddress(new Uint8Array(19))).toThrow(RangeError);
		expect(() => toChecksumAddress(new Uint8Array(21))).toThrow(RangeError);
	});
});

describe('checksumStatus', () => {
	it.each(EIP55)('%s is checksummed, including the all-caps and all-lower vectors', (address) => {
		expect(checksumStatus(address)).toBe('checksummed');
	});

	it('reports an address with no checksum casing (a risky sample, FR-010 AC-6)', () => {
		expect(checksumStatus('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe('all-lowercase');
		expect(checksumStatus('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED')).toBe('all-uppercase');
	});

	it('reports one letter in the wrong case as a wrong checksum', () => {
		expect(checksumStatus('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD')).toBe('wrong-checksum');
		expect(checksumStatus('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe('wrong-checksum');
	});

	it('counts digits-only addresses as checksummed', () => {
		expect(checksumStatus(`0x${'1'.repeat(40)}`)).toBe('checksummed');
		expect(checksumStatus(`0x${'0'.repeat(40)}`)).toBe('checksummed');
	});

	it.each([
		'5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
		'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe',
		'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedd',
		'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeg',
		'0X5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
		''
	])('returns null for %j, which is not a 0x + 40 hex address', (text) => {
		expect(checksumStatus(text)).toBeNull();
	});
});
