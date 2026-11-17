import { describe, expect, it } from 'vitest';
import { parseEndpointUrl } from './endpoint-url.ts';
import { err, ok } from './result.ts';

const rpc = { appendsPaths: false };
const base = { appendsPaths: true };

describe('parseEndpointUrl (FR-041 AC-2)', () => {
	it('accepts https URLs, trimmed and without trailing slashes', () => {
		expect(parseEndpointUrl('https://rpc.example.dev', rpc)).toEqual(ok('https://rpc.example.dev'));
		expect(parseEndpointUrl('  https://rpc.example.dev/v3/abc123//  ', rpc)).toEqual(
			ok('https://rpc.example.dev/v3/abc123')
		);
		expect(parseEndpointUrl('https://node.example.dev:8545/', rpc)).toEqual(
			ok('https://node.example.dev:8545')
		);
	});

	it('accepts http only on localhost, any port', () => {
		expect(parseEndpointUrl('http://localhost:8545', rpc)).toEqual(ok('http://localhost:8545'));
		expect(parseEndpointUrl('http://localhost', rpc)).toEqual(ok('http://localhost'));
		for (const url of [
			'http://rpc.example.dev',
			'http://127.0.0.1:8545',
			'http://[::1]:8545',
			'http://localhost.example.dev',
			'ws://localhost:8546',
			'wss://rpc.example.dev',
			'ftp://example.dev',
			'javascript:alert(1)',
			'data:text/plain,hi'
		]) {
			expect(parseEndpointUrl(url, rpc), url).toEqual(err('not-https'));
		}
	});

	it('rejects empty, relative, and malformed input', () => {
		for (const input of ['', '   ']) expect(parseEndpointUrl(input, rpc)).toEqual(err('empty'));
		for (const input of ['rpc.example.dev', '/rpc', 'https://', 'https://exa mple.dev']) {
			expect(parseEndpointUrl(input, rpc), input).toEqual(err('invalid'));
		}
	});

	it('rejects a user name or password in the URL', () => {
		for (const input of ['https://user:pass@rpc.example.dev', 'https://key@rpc.example.dev']) {
			expect(parseEndpointUrl(input, rpc), input).toEqual(err('credentials'));
		}
	});

	it('allows a query on a JSON-RPC URL, but not on a base URL that paths are added to', () => {
		expect(parseEndpointUrl('https://rpc.example.dev/?apikey=abc', rpc)).toEqual(
			ok('https://rpc.example.dev/?apikey=abc')
		);
		for (const input of [
			'https://esplora.example.dev/api?x=1',
			'https://esplora.example.dev/api#top'
		]) {
			expect(parseEndpointUrl(input, base), input).toEqual(err('query'));
		}
		expect(parseEndpointUrl('https://mempool.space/testnet4/api/', base)).toEqual(
			ok('https://mempool.space/testnet4/api')
		);
	});
});
