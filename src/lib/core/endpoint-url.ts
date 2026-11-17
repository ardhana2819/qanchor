import { err, ok, type Result } from './result.ts';

/**
 * Why an endpoint URL was refused (FR-041 AC-2):
 * - empty: nothing entered.
 * - invalid: not an absolute URL.
 * - not-https: any scheme but https, except http on `localhost` for a local node. Only
 *   `localhost` is allowed, because the CSP's connect-src allows `http://localhost:*` and nothing
 *   else over plain http.
 * - credentials: a user name or password in the URL, which fetch refuses to send.
 * - query: a query or #fragment on a base URL that paths are appended to (Esplora, Tron).
 */
export type EndpointUrlError = 'empty' | 'invalid' | 'not-https' | 'credentials' | 'query';

export interface EndpointUrlOptions {
	/** Esplora and Tron URLs are bases: `/tx/<id>` and similar are added to the path. */
	appendsPaths: boolean;
}

/**
 * Checks an override and returns it trimmed, without trailing slashes, so `<url>/tx/<id>` never
 * has a double slash. Otherwise the text is kept as typed, API keys in the path included.
 */
export function parseEndpointUrl(
	input: string,
	{ appendsPaths }: EndpointUrlOptions
): Result<string, EndpointUrlError> {
	const trimmed = input.trim();
	if (trimmed === '') return err('empty');

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return err('invalid');
	}
	const local = url.protocol === 'http:' && url.hostname === 'localhost';
	if (url.protocol !== 'https:' && !local) return err('not-https');
	if (url.username !== '' || url.password !== '') return err('credentials');
	if (appendsPaths && (url.search !== '' || url.hash !== '')) return err('query');

	return ok(trimmed.replace(/\/+$/, ''));
}
