import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from './result';

function parseCount(input: string): Result<number, 'not-a-number'> {
	const value = Number(input);
	return Number.isInteger(value) ? ok(value) : err('not-a-number');
}

describe('Result', () => {
	it('ok carries the value', () => {
		expect(ok(42)).toEqual({ ok: true, value: 42 });
	});

	it('err carries the error', () => {
		expect(err('timeout')).toEqual({ ok: false, error: 'timeout' });
	});

	it('narrows to the value or the error by the ok flag', () => {
		const good = parseCount('7');
		const bad = parseCount('seven');

		expect(good.ok && good.value).toBe(7);
		expect(!bad.ok && bad.error).toBe('not-a-number');
	});
});
