import { describe, expect, it } from 'vitest';
import { checkFaucetUrl, faucetHost, isWebLink } from './faucets.ts';

describe('checkFaucetUrl (FR-072)', () => {
	it.each([
		['https://faucet.example.dev', 'https://faucet.example.dev/'],
		['  https://faucet.example.dev/drip?x=1  ', 'https://faucet.example.dev/drip?x=1'],
		['HTTPS://Faucet.Example.dev/Path', 'https://faucet.example.dev/Path'],
		['http://localhost:8080/faucet', 'http://localhost:8080/faucet']
	])('accepts %j as %j', (text, href) => {
		expect(checkFaucetUrl(text)).toEqual({ ok: true, value: href });
	});

	it.each([
		['', 'empty'],
		['   ', 'empty'],
		['faucet.example.dev', 'invalid'],
		['https://', 'invalid'],
		['javascript:alert(1)', 'scheme'],
		['data:text/html,<p>hi</p>', 'scheme'],
		['ftp://faucet.example.dev', 'scheme'],
		['mailto:drip@example.dev', 'scheme']
	])('rejects %j: %s', (text, problem) => {
		expect(checkFaucetUrl(text)).toEqual({ ok: false, error: problem });
	});
});

describe('isWebLink', () => {
	it('allows http and https only, for links read from an imported backup', () => {
		expect(isWebLink('https://faucet.example.dev/')).toBe(true);
		expect(isWebLink('http://faucet.example.dev/')).toBe(true);
		expect(isWebLink('javascript:alert(1)')).toBe(false);
		expect(isWebLink('not a url')).toBe(false);
	});
});

describe('faucetHost', () => {
	it('shows the host, with a port when there is one', () => {
		expect(faucetHost('https://www.alchemy.com/faucets/base-sepolia')).toBe('www.alchemy.com');
		expect(faucetHost('http://localhost:8080/x')).toBe('localhost:8080');
	});

	it('falls back to the text when it is not a URL', () => {
		expect(faucetHost('not a url')).toBe('not a url');
	});
});
