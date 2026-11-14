import { CHAIN_NAMES, type AddressTarget } from '#lib/core/chains/catalog.ts';
import type { AddressDefect, AddressRisk } from '#lib/core/chains/types.ts';
import type { InputIssue, Verdict } from '#lib/core/chains/verdict.ts';

// Words for the Validate tab (FR-014, design section 7 S-02).

const TYPE_NAMES = { p2pkh: 'P2PKH', p2sh: 'P2SH', p2wpkh: 'P2WPKH', p2tr: 'P2TR' } as const;

/** "Bitcoin · P2TR · mainnet", "EVM · any network". */
export function targetName(target: AddressTarget): string {
	if (target.chain === 'bitcoin') {
		return `Bitcoin · ${TYPE_NAMES[target.type]} · ${target.network}`;
	}
	return `${CHAIN_NAMES[target.chain]} · any network`;
}

const DEFECTS: Record<AddressDefect, string> = {
	empty: 'Nothing to check.',
	'missing-prefix': 'The 0x prefix is missing.',
	'wrong-prefix': 'The prefix does not belong to this format.',
	'wrong-length': 'The length is wrong for this format.',
	'invalid-character': 'It contains a character this format does not allow.',
	'bad-checksum': 'Checksum does not match.',
	'wrong-network': 'The prefix belongs to another network.',
	'wrong-type': 'It encodes another address type.',
	'wrong-encoding':
		'Bech32 and Bech32m are mixed up: witness v0 uses Bech32, v1 and later use Bech32m.',
	'mixed-case': 'It mixes uppercase and lowercase letters, which Bech32 does not allow.'
};

const RISKS: Record<AddressRisk, string> = {
	'no-checksum': 'No EIP-55 checksum, so a typo in it cannot be detected.',
	'zero-address': 'The zero address: funds sent here are lost.',
	'off-curve': 'Off the ed25519 curve, like a program-derived address: no key can sign for it.'
};

export function riskText(risk: AddressRisk): string {
	return RISKS[risk];
}

export interface VerdictText {
	tone: 'valid' | 'risky' | 'invalid';
	headline: string;
	details: string[];
}

/** One line for the verdict, plus the lines that explain it. */
export function verdictText(verdict: Verdict): VerdictText {
	if (verdict.kind === 'invalid') {
		return {
			tone: 'invalid',
			headline: 'Not valid for any supported chain.',
			details: [
				DEFECTS[verdict.defect],
				...(verdict.closest ? [`Closest match: ${targetName(verdict.closest)}.`] : [])
			]
		};
	}
	const { matches } = verdict;
	const risks = matches.flatMap((m) => (m.risk ? [RISKS[m.risk]] : []));
	const tone = risks.length > 0 ? 'risky' : 'valid';
	if (matches.length > 1) {
		return {
			tone,
			headline: `Matches ${matches.length} formats. The format alone cannot tell them apart.`,
			details: risks
		};
	}
	const [{ target }] = matches;
	// One format, but every network of the chain shares it (FR-014 AC-2).
	const shared =
		target.chain === 'bitcoin'
			? []
			: [
					target.chain === 'evm'
						? 'The same address is valid on every EVM network, mainnet or testnet; the format alone cannot tell them apart.'
						: `${CHAIN_NAMES[target.chain]} mainnet and testnets share this format; the format alone cannot tell them apart.`
				];
	return {
		tone,
		// The badge says Valid or Risky in words, so the headline names the format only.
		headline: targetName(target),
		details: [...risks, ...shared]
	};
}

const CHARACTER_NAMES: Record<number, string> = {
	0x200b: 'ZERO WIDTH SPACE',
	0x200c: 'ZERO WIDTH NON-JOINER',
	0x200d: 'ZERO WIDTH JOINER',
	0x2060: 'WORD JOINER',
	0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
	0x00ad: 'SOFT HYPHEN'
};

export function issueText(issue: InputIssue): string {
	if (issue.kind === 'whitespace') return 'Whitespace before or after the address.';
	const code = `U+${issue.codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
	return `An invisible character, ${code} ${CHARACTER_NAMES[issue.codePoint]}, at position ${issue.position}.`;
}
