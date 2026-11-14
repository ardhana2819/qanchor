import { describe, expect, it } from 'vitest';
import { issueText, targetName, verdictText } from './verdict-text.ts';

describe('verdictText (FR-014, design S-02)', () => {
	it('one Bitcoin format: names chain, type, and network', () => {
		expect(
			verdictText({
				kind: 'valid',
				matches: [{ target: { chain: 'bitcoin', type: 'p2tr', network: 'mainnet' } }]
			})
		).toEqual({ tone: 'valid', headline: 'Bitcoin · P2TR · mainnet', details: [] });
	});

	it('EVM: says the format cannot tell the networks apart (AC-2)', () => {
		expect(verdictText({ kind: 'valid', matches: [{ target: { chain: 'evm' } }] })).toEqual({
			tone: 'valid',
			headline: 'EVM · any network',
			details: [
				'The same address is valid on every EVM network, mainnet or testnet; the format alone cannot tell them apart.'
			]
		});
	});

	it('several formats: says so and that the format cannot tell them apart (AC-2)', () => {
		const text = verdictText({
			kind: 'valid',
			matches: [{ target: { chain: 'solana' } }, { target: { chain: 'tron' } }]
		});
		expect(text.headline).toBe('Matches 2 formats. The format alone cannot tell them apart.');
	});

	it('risky: the tone and the risk in words', () => {
		expect(
			verdictText({ kind: 'valid', matches: [{ target: { chain: 'evm' }, risk: 'zero-address' }] })
		).toMatchObject({
			tone: 'risky',
			details: ['The zero address: funds sent here are lost.', expect.any(String)]
		});
	});

	it('invalid: the headline, the defect, and the closest format (AC-3)', () => {
		expect(
			verdictText({
				kind: 'invalid',
				defect: 'wrong-encoding',
				closest: { chain: 'bitcoin', type: 'p2tr', network: 'mainnet' }
			})
		).toEqual({
			tone: 'invalid',
			headline: 'Not valid for any supported chain.',
			details: [
				'Bech32 and Bech32m are mixed up: witness v0 uses Bech32, v1 and later use Bech32m.',
				'Closest match: Bitcoin · P2TR · mainnet.'
			]
		});
		expect(
			verdictText({ kind: 'invalid', defect: 'bad-checksum', closest: { chain: 'evm' } }).details
		).toEqual(['Checksum does not match.', 'Closest match: EVM · any network.']);
	});

	it('invalid with no closest format: the defect only', () => {
		expect(
			verdictText({ kind: 'invalid', defect: 'invalid-character', closest: null }).details
		).toEqual(['It contains a character this format does not allow.']);
	});
});

describe('issueText (AC-4)', () => {
	it('names whitespace and each invisible character', () => {
		expect(issueText({ kind: 'whitespace' })).toBe('Whitespace before or after the address.');
		expect(issueText({ kind: 'invisible', codePoint: 0x200b, position: 6 })).toBe(
			'An invisible character, U+200B ZERO WIDTH SPACE, at position 6.'
		);
		expect(issueText({ kind: 'invisible', codePoint: 0xad, position: 1 })).toBe(
			'An invisible character, U+00AD SOFT HYPHEN, at position 1.'
		);
	});
});

describe('targetName', () => {
	it('Tron and Solana share their format across networks', () => {
		expect(targetName({ chain: 'tron' })).toBe('Tron · any network');
		expect(targetName({ chain: 'solana' })).toBe('Solana · any network');
	});
});
