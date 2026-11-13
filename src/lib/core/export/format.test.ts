import { describe, expect, it } from 'vitest';
import { formatRecords, toCsv, toJson } from './format.ts';

const fields = ['address', 'reason'];

describe('toCsv', () => {
	it('writes a header row and one CRLF-terminated line per record', () => {
		const csv = toCsv(
			[
				{ address: '0xabc', reason: 'ok' },
				{ address: '0xdef', reason: 'bad' }
			],
			fields
		);
		expect(csv).toBe('address,reason\r\n0xabc,ok\r\n0xdef,bad\r\n');
	});

	it('quotes fields with a comma, quote, CR, or LF and doubles quotes (RFC 4180, EC-017)', () => {
		const csv = toCsv(
			[
				{ address: 'a,b', reason: 'say "hi"' },
				{ address: 'line\nbreak', reason: 'cr\rhere' }
			],
			fields
		);
		expect(csv).toBe('address,reason\r\n"a,b","say ""hi"""\r\n"line\nbreak","cr\rhere"\r\n');
	});

	it('keeps values as text: leading zeros, long digits, and spaces survive (EC-018)', () => {
		const csv = toCsv([{ address: '0012345678901234567890', reason: ' padded ' }], fields);
		expect(csv).toBe('address,reason\r\n0012345678901234567890, padded \r\n');
	});

	it('writes only the header for no records, and empty text for a missing field', () => {
		expect(toCsv([], fields)).toBe('address,reason\r\n');
		expect(toCsv([{ address: 'x' }], fields)).toBe('address,reason\r\nx,\r\n');
	});

	it('keeps non-ASCII text as is', () => {
		expect(toCsv([{ address: 'Ma’ruf', reason: 'ñ' }], fields)).toContain('Ma’ruf,ñ');
	});
});

describe('toJson', () => {
	it('writes an array of objects with the fields in order, all values strings', () => {
		const json = toJson([{ reason: 'r', address: '007', extra: 'dropped' }], fields);
		expect(json).toBe('[\n  {\n    "address": "007",\n    "reason": "r"\n  }\n]\n');
		expect(JSON.parse(json)).toEqual([{ address: '007', reason: 'r' }]);
	});

	it('writes an empty array for no records', () => {
		expect(JSON.parse(toJson([], fields))).toEqual([]);
	});
});

describe('formatRecords', () => {
	it('picks the writer for the format', () => {
		const records = [{ address: 'a', reason: 'b' }];
		expect(formatRecords('csv', records, fields)).toBe(toCsv(records, fields));
		expect(formatRecords('json', records, fields)).toBe(toJson(records, fields));
	});
});
