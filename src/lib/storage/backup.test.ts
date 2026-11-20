import { describe, expect, it } from 'vitest';
import {
	backupFileName,
	createBackup,
	describeImportError,
	parseBackup,
	type BackupData
} from './backup.ts';
import { snapshotCase } from '#lib/core/qa/run.ts';
import type { CaseSnapshot, Run, TestCase, TestResult } from '#lib/core/qa/types.ts';

const wallet = {
	id: 'w-1',
	label: 'QA main',
	chain: 'evm',
	networkId: 'eth-sepolia',
	address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
	notes: '',
	createdAt: 1794500000000,
	updatedAt: 1794500000000
} as const;

const testCase: TestCase = {
	id: 'c-1',
	number: 3,
	title: 'Deposit USDT on Tron',
	preconditions: 'Logged in',
	steps: [
		{ action: 'Open Deposit', expected: '' },
		{ action: 'Pick USDT on Tron', expected: 'The address is shown' }
	],
	expected: '',
	tags: ['deposit', 'tron'],
	priority: 'high',
	createdAt: 1794500000000,
	updatedAt: 1794500000001
};

const snapshot: CaseSnapshot = snapshotCase(testCase);

const run: Run = {
	id: 'r-1',
	name: 'Smoke v2.3.0',
	release: 'v2.3.0',
	environment: 'Android 14',
	status: 'in-progress',
	cases: [snapshot],
	createdAt: 1794500000000,
	updatedAt: 1794500000000,
	completedAt: null
};

const result: TestResult = {
	runId: 'r-1',
	caseNumber: 3,
	status: 'fail',
	failedStep: 2,
	actual: 'No address',
	reason: '',
	notes: '',
	linkedIssue: 'PAY-123',
	updatedAt: 1794500000002
};

const data: BackupData = {
	settings: { theme: 'dark' },
	endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
	wallets: [{ ...wallet }],
	faucets: [
		{ id: 'f-1', networkId: 'eth-sepolia', label: 'Team faucet', url: 'https://faucet.example.dev' }
	],
	testCases: [testCase],
	runs: [run],
	results: [result]
};

const NOW = new Date('2026-11-13T10:00:00.000Z');
const json = (value: unknown) => JSON.stringify(value);
const file = (patch: Record<string, unknown> = {}) => ({ ...createBackup(data, NOW), ...patch });
const withData = (patch: Record<string, unknown>) => file({ data: { ...data, ...patch } });

describe('createBackup', () => {
	it('carries app, schema version, export time, and data (FR-003 AC-1)', () => {
		expect(createBackup(data, NOW)).toEqual({
			app: 'qanchor',
			schemaVersion: 2,
			exportedAt: '2026-11-13T10:00:00.000Z',
			data
		});
		expect(backupFileName(NOW)).toBe('qanchor-backup-2026-11-13.json');
	});
});

describe('parseBackup', () => {
	it('accepts its own export unchanged (round trip)', () => {
		expect(parseBackup(json(createBackup(data, NOW)))).toEqual({
			ok: true,
			value: createBackup(data, NOW)
		});
	});

	it('accepts a backup with no records', () => {
		const empty = {
			settings: { theme: 'system' },
			endpoints: [],
			wallets: [],
			faucets: [],
			testCases: [],
			runs: [],
			results: []
		};
		expect(parseBackup(json(file({ data: empty }))).ok).toBe(true);
	});

	it('drops fields it does not know instead of writing them', () => {
		const result = parseBackup(
			json(withData({ wallets: [{ ...wallet, privateKey: '0xabc', extra: 1 }] }))
		);
		expect(result.ok && result.value.data.wallets[0]).toEqual(wallet);
	});

	it.each([
		['not JSON', 'label,address\nQA main,0x5a\n', { code: 'not-json' }],
		['truncated', json(file()).slice(0, 60), { code: 'not-json' }],
		['an array', '[]', { code: 'not-qanchor' }],
		['another app', json({ version: '12.4.1', metamask: {} }), { code: 'not-qanchor' }],
		[
			'a newer schema (EC-020)',
			json(file({ schemaVersion: 3 })),
			{ code: 'newer-version', version: 3 }
		],
		['schema version 0', json(file({ schemaVersion: 0 })), { code: 'unsupported-version' }],
		['schema version as text', json(file({ schemaVersion: '2' })), { code: 'unsupported-version' }],
		['schema version 1.5', json(file({ schemaVersion: 1.5 })), { code: 'unsupported-version' }],
		['no schema version', json(file({ schemaVersion: undefined })), { code: 'unsupported-version' }]
	])('rejects %s', (_, input, error) => {
		expect(parseBackup(input)).toEqual({ ok: false, error });
	});

	it.each([
		[
			'no export date',
			file({ exportedAt: 'yesterday' }),
			'The export date is missing or not a date.'
		],
		['no data', file({ data: null }), 'The data section is missing.'],
		[
			'an unknown theme',
			withData({ settings: { theme: 'neon' } }),
			'The theme setting is missing or not recognised.'
		],
		[
			'no settings',
			withData({ settings: undefined }),
			'The theme setting is missing or not recognised.'
		],
		['no wallets list', withData({ wallets: undefined }), 'The wallets list is missing.'],
		['endpoints as an object', withData({ endpoints: {} }), 'The endpoints list is missing.'],
		[
			'a wallet with no address',
			withData({ wallets: [wallet, wallet, wallet, { ...wallet, address: undefined }] }),
			'Wallet 4 of 4 ("QA main") has no address.'
		],
		[
			'a wallet with a blank address',
			withData({ wallets: [{ ...wallet, address: '   ' }] }),
			'Wallet 1 of 1 ("QA main") has an empty address.'
		],
		[
			'a wallet on an unknown chain',
			withData({ wallets: [{ ...wallet, label: '', chain: 'dogecoin' }] }),
			'Wallet 1 of 1 has an unknown chain.'
		],
		[
			'a wallet with a text timestamp',
			withData({ wallets: [{ ...wallet, createdAt: '2026-11-13' }] }),
			'Wallet 1 of 1 ("QA main") has no valid createdAt.'
		],
		[
			'a wallet that is not a record',
			withData({ wallets: ['0x5a'] }),
			'Wallet 1 of 1 is not a record.'
		],
		[
			'an endpoint with no URL',
			withData({ endpoints: [{ networkId: 'eth-sepolia' }] }),
			'Endpoint override 1 of 1 has no url.'
		],
		[
			'endpoint for an unknown network',
			withData({ endpoints: [{ networkId: 'dogecoin', url: 'https://rpc.example.dev' }] }),
			'Endpoint override 1 of 1 is for an unknown network ("dogecoin").'
		],
		[
			'endpoint with a plain http URL',
			withData({ endpoints: [{ networkId: 'eth', url: 'http://rpc.example.dev' }] }),
			'Endpoint override 1 of 1 (Ethereum) does not have a valid https URL.'
		],
		[
			'Esplora endpoint with a query',
			withData({
				endpoints: [{ networkId: 'bitcoin', url: 'https://esplora.example.dev/api?k=1' }]
			}),
			'Endpoint override 1 of 1 (Bitcoin) does not have a valid https URL.'
		],
		[
			'a faucet link with no URL',
			withData({ faucets: [{ id: 'f', networkId: 'n', label: 'Drip' }] }),
			'Faucet link 1 of 1 ("Drip") has no url.'
		]
	])('rejects %s with a reason a person can act on', (_, input, detail) => {
		expect(parseBackup(json(input))).toEqual({ ok: false, error: { code: 'invalid', detail } });
	});
});

describe('describeImportError', () => {
	it('names the reason for each error code', () => {
		expect(describeImportError({ code: 'newer-version', version: 3 })).toBe(
			'Unknown schema version 3. This backup comes from a newer version of QAnchor.'
		);
		expect(describeImportError({ code: 'not-qanchor' })).toBe('This is not a QAnchor backup file.');
		expect(describeImportError({ code: 'invalid', detail: 'x' })).toBe('x');
		expect(describeImportError({ code: 'not-json' })).toMatch(/^The file is not valid JSON/);
		expect(describeImportError({ code: 'unsupported-version' })).toMatch(/schema version/);
	});
});

describe('backup v2 (FR-091)', () => {
	const v1 = () => {
		const { settings, endpoints, wallets, faucets } = data;
		return { ...file(), schemaVersion: 1, data: { settings, endpoints, wallets, faucets } };
	};
	const invalid = (input: unknown) => {
		const parsed = parseBackup(json(input));
		return parsed.ok ? null : parsed.error;
	};
	const detail = (input: unknown) => {
		const error = invalid(input);
		return error?.code === 'invalid' ? error.detail : error;
	};

	it('a v1 file is upgraded in memory with empty Phase 2 lists (AC-3, EC-037)', () => {
		const parsed = parseBackup(json(v1()));
		expect(parsed.ok && parsed.value).toEqual({
			...file(),
			data: { ...data, testCases: [], runs: [], results: [] }
		});
	});

	it('a v1 file ignores Phase 2 lists it should not have', () => {
		const parsed = parseBackup(json({ ...v1(), data: { ...v1().data, testCases: 'x' } }));
		expect(parsed.ok && parsed.value.data.testCases).toEqual([]);
	});

	it('a v2 file needs every Phase 2 list', () => {
		expect(detail(withData({ results: undefined }))).toBe('The results list is missing.');
		expect(detail(withData({ testCases: {} }))).toBe('The testCases list is missing.');
	});

	it('normalises tags as the editor does, and sorts a run by key', () => {
		const other = { ...snapshot, id: 'c-0', number: 1 };
		const parsed = parseBackup(
			json(
				withData({
					testCases: [{ ...testCase, tags: [' Deposit', 'deposit', 'TRON'] }],
					runs: [{ ...run, cases: [snapshot, other] }]
				})
			)
		);
		expect(parsed.ok && parsed.value.data.testCases[0]!.tags).toEqual(['deposit', 'tron']);
		expect(parsed.ok && parsed.value.data.runs[0]!.cases.map((c) => c.number)).toEqual([1, 3]);
	});

	it('drops unknown fields on Phase 2 records', () => {
		const parsed = parseBackup(
			json(
				withData({
					testCases: [{ ...testCase, secret: 1 }],
					results: [{ ...result, screenshot: 'x' }]
				})
			)
		);
		expect(parsed.ok && parsed.value.data.testCases[0]).toEqual(testCase);
		expect(parsed.ok && parsed.value.data.results[0]).toEqual(result);
	});

	it.each([
		[
			'a test case with a title over the limit',
			withData({ testCases: [{ ...testCase, title: 'a'.repeat(201) }] }),
			'Test case 1 of 1 ("TC-3 ' + 'a'.repeat(201) + '") has more than 200 characters in title.'
		],
		[
			'a test case with exactly the title limit',
			withData({ testCases: [{ ...testCase, title: 'a'.repeat(200) }] }),
			null
		],
		[
			'a test case with a blank step action',
			withData({ testCases: [{ ...testCase, steps: [{ action: ' ', expected: 'x' }] }] }),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron") has no step 1 action.'
		],
		[
			'a test case with no expected result',
			withData({ testCases: [{ ...testCase, steps: [], expected: '' }] }),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron") has no expected result.'
		],
		[
			'a test case with 11 tags',
			withData({
				testCases: [{ ...testCase, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }]
			}),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron") has more than 10 tags.'
		],
		[
			'a test case with an invalid tag',
			withData({ testCases: [{ ...testCase, tags: ['a b'] }] }),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron") has an invalid tag ("a b").'
		],
		[
			'a test case with key 0',
			withData({ testCases: [{ ...testCase, number: 0 }] }),
			'Test case 1 of 1 ("Deposit USDT on Tron") has no valid number.'
		],
		[
			'a test case with an unknown priority',
			withData({ testCases: [{ ...testCase, priority: 'urgent' }] }),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron") has an unknown priority.'
		],
		[
			'a step that is not a record',
			withData({ testCases: [{ ...testCase, steps: ['Open'] }] }),
			'Test case 1 of 1 ("TC-3 Deposit USDT on Tron"), step 1, is not a record.'
		],
		[
			'two test cases with one key (EC-039)',
			withData({ testCases: [testCase, { ...testCase, id: 'c-2' }] }),
			'Two test cases have the key TC-3.'
		],
		[
			'two test cases with one id',
			withData({ testCases: [testCase, { ...testCase, number: 4 }] }),
			'Two test cases have the id "c-1".'
		],
		[
			'a run with no cases',
			withData({ runs: [{ ...run, cases: [] }], results: [] }),
			'Run 1 of 1 ("Smoke v2.3.0") has a case count outside 1 to 500.'
		],
		[
			'a run with an unknown status',
			withData({ runs: [{ ...run, status: 'paused' }] }),
			'Run 1 of 1 ("Smoke v2.3.0") has an unknown status.'
		],
		[
			'a run listing one case twice',
			withData({ runs: [{ ...run, cases: [snapshot, snapshot] }] }),
			'Run 1 of 1 ("Smoke v2.3.0") lists TC-3 twice.'
		],
		[
			'a snapshot over a limit',
			withData({ runs: [{ ...run, cases: [{ ...snapshot, preconditions: 'a'.repeat(5001) }] }] }),
			'Run 1 of 1 ("Smoke v2.3.0"), case 1 of 1 ("TC-3 Deposit USDT on Tron") has more than 5,000 characters in preconditions.'
		],
		[
			'two runs with one id',
			withData({ runs: [run, { ...run, name: 'Again' }] }),
			'Two runs have the id "r-1".'
		],
		[
			'a result for a run that is not in the file',
			withData({ results: [{ ...result, runId: 'r-9' }] }),
			'Result 1 of 1 ("TC-3") belongs to no run in the file.'
		],
		[
			'a result for a case that is not in its run (FR-091 AC-5)',
			withData({ results: [{ ...result, caseNumber: 4 }] }),
			'Result 1 of 1 ("TC-4") in run "Smoke v2.3.0" is for a case that is not in the run.'
		],
		[
			'two results for one case',
			withData({ results: [result, { ...result, status: 'pass' }] }),
			'Result 2 of 2 ("TC-3") in run "Smoke v2.3.0" is the second result for that case.'
		],
		[
			'a failed result without the actual result',
			withData({ results: [{ ...result, actual: ' ' }] }),
			'Result 1 of 1 ("TC-3") in run "Smoke v2.3.0" has no actual result.'
		],
		[
			'a failed step past the last step',
			withData({ results: [{ ...result, failedStep: 3 }] }),
			'Result 1 of 1 ("TC-3") in run "Smoke v2.3.0" has a failed step outside 0 to 2.'
		],
		[
			'a result with an unknown status',
			withData({ results: [{ ...result, status: 'untested' }] }),
			'Result 1 of 1 ("TC-3") has an unknown status.'
		]
	])('%s', (_, input, expected) => {
		expect(detail(input)).toBe(expected);
	});
});
