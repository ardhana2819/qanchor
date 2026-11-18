import { err, ok, type Result } from './result.ts';

// Rules for a user-added faucet link (FR-072). The link is only ever opened, never submitted
// to, so the one rule that matters for safety is that it is a web address: a `javascript:` or
// `data:` URL would run in or replace the app when clicked.

export const FAUCET_LABEL_MAX = 80;

export type FaucetUrlProblem = 'empty' | 'invalid' | 'scheme';

/** Parses a pasted faucet address and returns it in normalised form (`URL.href`). */
export function checkFaucetUrl(text: string): Result<string, FaucetUrlProblem> {
	const trimmed = text.trim();
	if (trimmed === '') return err('empty');
	const url = URL.parse(trimmed);
	if (!url) return err('invalid');
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return err('scheme');
	return ok(url.href);
}

/** Whether a stored URL may be rendered as a link; imported backups are not trusted. */
export function isWebLink(url: string): boolean {
	return checkFaucetUrl(url).ok;
}

/** The host a link points to, shown next to its label so the user sees where it goes. */
export function faucetHost(url: string): string {
	return URL.parse(url)?.host ?? url;
}
