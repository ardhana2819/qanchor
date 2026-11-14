import { TARGETS, type AddressTarget } from './catalog.ts';
import { validateAddress } from './dispatch.ts';
import type { AddressDefect, AddressRisk } from './types.ts';

// The address validator (FR-014): checks one pasted string against every supported chain, type,
// and network with the same validators the generator uses, and explains the result. Pure and
// synchronous; no network.

export interface Match {
	target: AddressTarget;
	risk?: AddressRisk;
}

export type Verdict =
	| { kind: 'valid'; matches: Match[] }
	| { kind: 'invalid'; defect: AddressDefect; closest: AddressTarget | null };

/** Something about the input itself, reported instead of fixed silently (FR-014 AC-4). */
export type InputIssue =
	{ kind: 'whitespace' } | { kind: 'invisible'; codePoint: number; position: number };

export interface Check {
	verdict: Verdict;
	issues: InputIssue[];
	/** The verdict without the whitespace and invisible characters, when there were any. */
	cleaned?: { text: string; verdict: Verdict };
}

/** Characters that take no space when pasted: zero-width spaces and joiners, BOM, word joiner, soft hyphen. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00ad]/gu;

/** How close a defect says the input is to a real address of that format; lower is closer. */
const CLOSENESS: Record<AddressDefect, number> = {
	'bad-checksum': 0,
	'wrong-encoding': 0,
	'mixed-case': 1,
	'wrong-network': 1,
	'wrong-type': 1,
	'missing-prefix': 1,
	'wrong-length': 2,
	'invalid-character': 3,
	'wrong-prefix': 4,
	empty: 5
};

/** Whether the text is shaped like an address of the target, so its defect is worth naming. */
function looksLike(target: AddressTarget, text: string): boolean {
	switch (target.chain) {
		case 'evm':
			return /^(0x)?[0-9a-z]{30,50}$/i.test(text);
		case 'tron':
			return /^T\w{25,40}$/.test(text);
		case 'solana':
			return /^\w{30,50}$/.test(text) && !/^(0x|T|[13mn2]|bc1|tb1)/i.test(text);
		case 'bitcoin': {
			if (target.type === 'p2pkh' || target.type === 'p2sh') {
				const first = {
					mainnet: { p2pkh: '1', p2sh: '3' },
					testnet: { p2pkh: 'mn', p2sh: '2' }
				}[target.network][target.type];
				return first.includes(text[0]) && /^\w{25,40}$/.test(text);
			}
			const prefix = target.network === 'mainnet' ? 'bc1' : 'tb1';
			const version = target.type === 'p2wpkh' ? 'q' : 'p';
			return text.toLowerCase().startsWith(`${prefix}${version}`);
		}
	}
}

export function verdictFor(text: string): Verdict {
	const matches: Match[] = [];
	let closest: { target: AddressTarget; defect: AddressDefect } | null = null;
	for (const target of TARGETS) {
		const check = validateAddress(target, text);
		if (check.ok) {
			matches.push(check.value.risk ? { target, risk: check.value.risk } : { target });
		} else if (
			looksLike(target, text) &&
			(!closest || CLOSENESS[check.error] < CLOSENESS[closest.defect])
		) {
			closest = { target, defect: check.error };
		}
	}
	if (matches.length > 0) return { kind: 'valid', matches };
	if (closest) return { kind: 'invalid', defect: closest.defect, closest: closest.target };
	return { kind: 'invalid', defect: text === '' ? 'empty' : 'invalid-character', closest: null };
}

/** The full check for a pasted value, or null for empty input, which shows nothing (AC-5). */
export function checkAddress(text: string): Check | null {
	if (text === '') return null;
	const issues: InputIssue[] = [];
	if (text !== text.trim()) issues.push({ kind: 'whitespace' });
	for (const match of text.matchAll(INVISIBLE)) {
		issues.push({
			kind: 'invisible',
			codePoint: match[0].codePointAt(0)!,
			position: match.index + 1
		});
	}
	const verdict = verdictFor(text);
	if (issues.length === 0) return { verdict, issues };
	const cleaned = text.replace(INVISIBLE, '').trim();
	return { verdict, issues, cleaned: { text: cleaned, verdict: verdictFor(cleaned) } };
}
