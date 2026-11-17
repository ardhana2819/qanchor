import { err, ok, type Result } from '#lib/core/result.ts';

// The only code that calls `fetch` (docs/architecture.md section 1, NFR-003, NFR-011), and only
// after a user action. Expected failures come back as a LookupError value, never thrown
// (ADR-013); each code has its own copy in docs/design.md section 7 (FR-042).

/** FR-042 AC-4 and the PRD's limits: a request with no answer by then is abandoned. */
export const TIMEOUT_MS = 10_000;

/**
 * - not-found: the endpoint says the transaction does not exist (FR-042 AC-1).
 * - rate-limited: HTTP 429 or a rate-limit error in the body (AC-2).
 * - network: the request did not complete: offline, DNS, TLS, or blocked by CORS (AC-3,
 *   EC-008). Says nothing about whether the transaction exists.
 * - timeout: no answer within TIMEOUT_MS (AC-4).
 * - bad-response: an answer that is not valid for the protocol (AC-5), including HTTP errors.
 * - chain-mismatch: an EVM endpoint serves another chain (FR-041 AC-4, EC-009).
 * - aborted: the caller cancelled (a new lookup, or the page was left; NFR-019). Not shown.
 */
export type LookupError =
	| { code: 'not-found' | 'rate-limited' | 'network' | 'timeout' | 'aborted'; host: string }
	| { code: 'bad-response'; host: string; detail: string }
	| { code: 'chain-mismatch'; host: string; expected: bigint; actual: bigint };

export interface RequestOptions {
	/** Aborts the request; the result is then `aborted`. */
	signal?: AbortSignal;
	timeoutMs?: number;
	/** For tests; defaults to the global fetch. */
	fetch?: typeof fetch;
}

interface RawResponse {
	status: number;
	text: string;
}

/** The host named in error messages ("Could not reach <host>"). */
export function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

const badResponse = (host: string, detail: string): LookupError => ({
	code: 'bad-response',
	host,
	detail
});

/** Sends one request and reads the whole body, under one timeout and the caller's signal. */
async function send(
	url: string,
	init: RequestInit,
	options: RequestOptions
): Promise<Result<RawResponse, LookupError>> {
	const host = hostOf(url);
	const { signal, timeoutMs = TIMEOUT_MS, fetch: fetchFn = globalThis.fetch } = options;
	if (signal?.aborted) return err({ code: 'aborted', host });

	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const onAbort = () => controller.abort();
	signal?.addEventListener('abort', onAbort, { once: true });

	try {
		const response = await fetchFn(url, {
			...init,
			signal: controller.signal,
			// Nothing identifying is sent, and a retried lookup is never answered from cache.
			credentials: 'omit',
			cache: 'no-store'
		});
		return ok({ status: response.status, text: await response.text() });
	} catch {
		// fetch rejects with a TypeError for offline, DNS, TLS, and CORS failures alike; the
		// browser does not say which (EC-008).
		if (timedOut) return err({ code: 'timeout', host });
		if (signal?.aborted) return err({ code: 'aborted', host });
		return err({ code: 'network', host });
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	}
}

/**
 * Rate-limit signals besides HTTP 429: EIP-1474's -32005 "limit exceeded", and the wording
 * public endpoints use in the message (seen in T-035: "Too Many Requests").
 */
function isRateLimit(code: unknown, message: string): boolean {
	return code === -32005 || code === 429 || /rate.?limit|too many requests/i.test(message);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false };
	}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One JSON-RPC 2.0 call (EVM and Solana). The result may be `null`, which for a transaction
 * lookup means not found; see `orNotFound`.
 */
export async function jsonRpc(
	url: string,
	method: string,
	params: unknown[],
	options: RequestOptions = {}
): Promise<Result<unknown, LookupError>> {
	const sent = await send(
		url,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
		},
		options
	);
	if (!sent.ok) return sent;
	const host = hostOf(url);
	const { status, text } = sent.value;
	if (status === 429) return err({ code: 'rate-limited', host });

	const parsed = parseJson(text);
	const body = parsed.ok ? parsed.value : undefined;
	if (isObject(body) && isObject(body.error)) {
		const message = typeof body.error.message === 'string' ? body.error.message : '';
		if (isRateLimit(body.error.code, message)) return err({ code: 'rate-limited', host });
		return err(badResponse(host, `${String(body.error.code)}: ${message}`.slice(0, 200)));
	}
	if (status < 200 || status > 299) {
		if (isRateLimit(undefined, text)) return err({ code: 'rate-limited', host });
		return err(badResponse(host, `HTTP ${status}`));
	}
	if (!isObject(body) || body.jsonrpc !== '2.0' || !('result' in body)) {
		return err(badResponse(host, 'Not a JSON-RPC 2.0 response'));
	}
	return ok(body.result);
}

/**
 * GET from an Esplora REST API (Bitcoin, ADR-006). Esplora answers an unknown transaction with
 * HTTP 404 and the text "Transaction not found" (checked in T-035); any other 404, such as a
 * wrong base URL, is a bad response rather than "not found".
 */
export async function esploraGet(
	url: string,
	options: RequestOptions = {}
): Promise<Result<unknown, LookupError>> {
	const sent = await send(url, { method: 'GET' }, options);
	if (!sent.ok) return sent;
	const host = hostOf(url);
	const { status, text } = sent.value;
	if (status === 429) return err({ code: 'rate-limited', host });
	if (status === 404 && text.trim() === 'Transaction not found') {
		return err({ code: 'not-found', host });
	}
	if (status < 200 || status > 299) {
		if (isRateLimit(undefined, text)) return err({ code: 'rate-limited', host });
		return err(badResponse(host, `HTTP ${status}`));
	}
	const parsed = parseJson(text);
	return parsed.ok ? ok(parsed.value) : err(badResponse(host, 'Not JSON'));
}

/**
 * POST to Tron's HTTP API. An unknown transaction id comes back as `{}` with HTTP 200 (checked
 * in T-035), which the Tron parser reports as not found.
 */
export async function tronPost(
	url: string,
	body: Record<string, unknown>,
	options: RequestOptions = {}
): Promise<Result<unknown, LookupError>> {
	const sent = await send(
		url,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		},
		options
	);
	if (!sent.ok) return sent;
	const host = hostOf(url);
	const { status, text } = sent.value;
	if (status === 429) return err({ code: 'rate-limited', host });
	if (status < 200 || status > 299) {
		if (isRateLimit(undefined, text)) return err({ code: 'rate-limited', host });
		return err(badResponse(host, `HTTP ${status}`));
	}
	const parsed = parseJson(text);
	if (!parsed.ok || !isObject(parsed.value)) return err(badResponse(host, 'Not a JSON object'));
	const error = parsed.value.Error ?? parsed.value.error;
	if (typeof error === 'string') {
		if (isRateLimit(undefined, error)) return err({ code: 'rate-limited', host });
		return err(badResponse(host, error.slice(0, 200)));
	}
	return ok(parsed.value);
}

/** A JSON-RPC transaction lookup answered `null`: the endpoint does not know the hash. */
export function orNotFound(
	result: Result<unknown, LookupError>,
	url: string
): Result<unknown, LookupError> {
	if (result.ok && result.value === null) return err({ code: 'not-found', host: hostOf(url) });
	return result;
}
