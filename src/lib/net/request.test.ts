import { afterEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '#lib/core/result.ts';
import {
	TIMEOUT_MS,
	esploraGet,
	hostOf,
	jsonRpc,
	orNotFound,
	tronPost,
	type RequestOptions
} from './request.ts';

const URL_RPC = 'https://rpc.example.dev/v1';
const HOST = 'rpc.example.dev';

/** A fetch that answers with this status and body text. */
function answer(status: number, text: string) {
	return vi.fn<typeof fetch>(async () => new Response(text, { status }));
}

const rpcBody = (result: unknown) => JSON.stringify({ jsonrpc: '2.0', id: 1, result });

/** A fetch that never answers on its own, but rejects when its signal aborts, like a browser. */
function hanging() {
	return vi.fn<typeof fetch>(
		(_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('The operation was aborted.', 'AbortError'))
				);
			})
	);
}

/** A fetch whose headers arrive at once but whose body never finishes until aborted. */
function slowBody() {
	return vi.fn<typeof fetch>(async (_url, init) => {
		const text = () =>
			new Promise<string>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('The operation was aborted.', 'AbortError'))
				);
			});
		return { status: 200, text } as unknown as Response;
	});
}

const failing = () =>
	vi.fn<typeof fetch>(async () => {
		throw new TypeError('Failed to fetch');
	});

const with_ = (fetch: typeof globalThis.fetch, extra: RequestOptions = {}): RequestOptions => ({
	fetch,
	...extra
});

afterEach(() => {
	vi.useRealTimers();
});

describe('jsonRpc', () => {
	it('posts a JSON-RPC 2.0 request without credentials or cache, and returns the result', async () => {
		const fetch = answer(200, rpcBody('0x1'));

		expect(await jsonRpc(URL_RPC, 'eth_chainId', [], with_(fetch))).toEqual(ok('0x1'));

		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe(URL_RPC);
		expect(init?.method).toBe('POST');
		expect(init?.credentials).toBe('omit');
		expect(init?.cache).toBe('no-store');
		expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
		expect(JSON.parse(String(init?.body))).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_chainId',
			params: []
		});
	});

	it('returns a null result as is; orNotFound turns it into not-found (FR-042 AC-1)', async () => {
		const result = await jsonRpc(
			URL_RPC,
			'eth_getTransactionByHash',
			['0x00'],
			with_(answer(200, rpcBody(null)))
		);

		expect(result).toEqual(ok(null));
		expect(orNotFound(result, URL_RPC)).toEqual(err({ code: 'not-found', host: HOST }));
		expect(orNotFound(ok({ hash: '0x1' }), URL_RPC)).toEqual(ok({ hash: '0x1' }));
	});

	it('reports HTTP 429 and rate-limit errors in the body as rate-limited (FR-042 AC-2)', async () => {
		const bodies = [
			[429, ''],
			[
				200,
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32005, message: 'limit exceeded' }
				})
			],
			[
				200,
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32029, message: 'Too Many Requests, please slow down' }
				})
			],
			[503, 'Rate limit reached'],
			[
				403,
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32000, message: 'daily rate-limit hit' }
				})
			]
		] as const;
		for (const [status, text] of bodies) {
			expect(await jsonRpc(URL_RPC, 'm', [], with_(answer(status, text))), text).toEqual(
				err({ code: 'rate-limited', host: HOST })
			);
		}
	});

	it('reports a failed request as a network error, never as not found (FR-042 AC-3, EC-008)', async () => {
		expect(await jsonRpc(URL_RPC, 'm', [], with_(failing()))).toEqual(
			err({ code: 'network', host: HOST })
		);
	});

	it('times out after 10 seconds without an answer (FR-042 AC-4)', async () => {
		vi.useFakeTimers();
		const fetch = hanging();
		const pending = jsonRpc(URL_RPC, 'm', [], with_(fetch));

		await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
		expect(fetch.mock.calls[0]![1]?.signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect(await pending).toEqual(err({ code: 'timeout', host: HOST }));
		expect(TIMEOUT_MS).toBe(10_000);
	});

	it('times out when the body never finishes, not only the headers', async () => {
		vi.useFakeTimers();
		const pending = jsonRpc(URL_RPC, 'm', [], with_(slowBody(), { timeoutMs: 50 }));
		await vi.advanceTimersByTimeAsync(50);

		expect(await pending).toEqual(err({ code: 'timeout', host: HOST }));
	});

	it('reports a caller abort as aborted, before or during the request (NFR-019)', async () => {
		const before = new AbortController();
		before.abort();
		const fetch = answer(200, rpcBody('0x1'));
		expect(await jsonRpc(URL_RPC, 'm', [], with_(fetch, { signal: before.signal }))).toEqual(
			err({ code: 'aborted', host: HOST })
		);
		expect(fetch).not.toHaveBeenCalled();

		const during = new AbortController();
		const pending = jsonRpc(URL_RPC, 'm', [], with_(hanging(), { signal: during.signal }));
		during.abort();
		expect(await pending).toEqual(err({ code: 'aborted', host: HOST }));
	});

	it('clears its timer and listener once done', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const remove = vi.spyOn(controller.signal, 'removeEventListener');

		await jsonRpc(URL_RPC, 'm', [], with_(answer(200, rpcBody(1)), { signal: controller.signal }));

		expect(vi.getTimerCount()).toBe(0);
		expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
	});

	it('reports answers that are not valid JSON-RPC as bad-response (FR-042 AC-5)', async () => {
		const cases = [
			[200, '<html>Gateway</html>', 'Not a JSON-RPC 2.0 response'],
			[200, JSON.stringify({ id: 1, result: '0x1' }), 'Not a JSON-RPC 2.0 response'],
			[200, JSON.stringify({ jsonrpc: '2.0', id: 1 }), 'Not a JSON-RPC 2.0 response'],
			[200, JSON.stringify([rpcBody(1)]), 'Not a JSON-RPC 2.0 response'],
			[502, 'Bad gateway', 'HTTP 502'],
			[
				403,
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32602, message: 'Archive requests require a personal token' }
				}),
				'-32602: Archive requests require a personal token'
			],
			[
				200,
				JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32601, message: 'Method not found' }
				}),
				'-32601: Method not found'
			]
		] as const;
		for (const [status, text, detail] of cases) {
			expect(await jsonRpc(URL_RPC, 'm', [], with_(answer(status, text))), text).toEqual(
				err({ code: 'bad-response', host: HOST, detail })
			);
		}
	});
});

describe('esploraGet', () => {
	const TX = 'https://mempool.space/api/tx/abc';

	it('returns the parsed JSON body', async () => {
		const fetch = answer(200, JSON.stringify({ txid: 'abc' }));

		expect(await esploraGet(TX, with_(fetch))).toEqual(ok({ txid: 'abc' }));
		expect(fetch.mock.calls[0]![1]?.method).toBe('GET');
	});

	it("reports Esplora's 404 'Transaction not found' as not-found (FR-042 AC-1)", async () => {
		expect(await esploraGet(TX, with_(answer(404, 'Transaction not found')))).toEqual(
			err({ code: 'not-found', host: 'mempool.space' })
		);
	});

	it('reports any other 404, such as a wrong base URL, as bad-response', async () => {
		expect(await esploraGet(TX, with_(answer(404, 'Not Found')))).toEqual(
			err({ code: 'bad-response', host: 'mempool.space', detail: 'HTTP 404' })
		);
	});

	it('classifies 429, network failure, and a non-JSON body', async () => {
		expect(await esploraGet(TX, with_(answer(429, '')))).toEqual(
			err({ code: 'rate-limited', host: 'mempool.space' })
		);
		expect(await esploraGet(TX, with_(failing()))).toEqual(
			err({ code: 'network', host: 'mempool.space' })
		);
		expect(await esploraGet(TX, with_(answer(200, 'not json')))).toEqual(
			err({ code: 'bad-response', host: 'mempool.space', detail: 'Not JSON' })
		);
	});
});

describe('tronPost', () => {
	const TRON = 'https://api.trongrid.io/wallet/gettransactionbyid';

	it('posts the body and returns the object, including the {} of an unknown id', async () => {
		const fetch = answer(200, '{}');

		expect(await tronPost(TRON, { value: 'ab' }, with_(fetch))).toEqual(ok({}));
		expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ value: 'ab' });
	});

	it('reports an Error field as bad-response, or rate-limited when it says so', async () => {
		expect(
			await tronPost(
				TRON,
				{},
				with_(answer(200, JSON.stringify({ Error: 'class java.lang.NullPointerException : null' })))
			)
		).toEqual(
			err({
				code: 'bad-response',
				host: 'api.trongrid.io',
				detail: 'class java.lang.NullPointerException : null'
			})
		);
		expect(
			await tronPost(TRON, {}, with_(answer(200, JSON.stringify({ Error: 'rate limit exceeded' }))))
		).toEqual(err({ code: 'rate-limited', host: 'api.trongrid.io' }));
	});

	it('classifies 429, HTTP errors, and bodies that are not a JSON object', async () => {
		expect(await tronPost(TRON, {}, with_(answer(429, '')))).toEqual(
			err({ code: 'rate-limited', host: 'api.trongrid.io' })
		);
		expect(await tronPost(TRON, {}, with_(answer(500, 'oops')))).toEqual(
			err({ code: 'bad-response', host: 'api.trongrid.io', detail: 'HTTP 500' })
		);
		for (const text of ['[]', 'null', 'nope']) {
			expect(await tronPost(TRON, {}, with_(answer(200, text))), text).toEqual(
				err({ code: 'bad-response', host: 'api.trongrid.io', detail: 'Not a JSON object' })
			);
		}
	});
});

describe('hostOf', () => {
	it('names the host with its port, or returns the text when it is not a URL', () => {
		expect(hostOf('https://data-seed-prebsc-1-s1.bnbchain.org:8545')).toBe(
			'data-seed-prebsc-1-s1.bnbchain.org:8545'
		);
		expect(hostOf('not a url')).toBe('not a url');
	});
});
