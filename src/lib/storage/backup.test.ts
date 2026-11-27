import { describe, expect, it } from 'vitest';
import {
	backupFileName,
	createBackup,
	describeImportError,
	parseBackup,
	UPGRADES,
	upgradeData,
	type BackupData
} from './backup.ts';
import { snapshotCase } from '#lib/core/qa/run.ts';
import type {
	CaseSnapshot,
	Finding,
	Run,
	Screenshot,
	Session,
	TestCase,
	TestResult
} from '#lib/core/qa/types.ts';

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

const screenshot: Screenshot = {
	id: 's-1',
	owner: ['result', 'r-1', 3],
	n: 1,
	mediaType: 'image/webp',
	width: 1920,
	height: 1080,
	size: 4,
	createdAt: 1794500000003,
	bytes: new Uint8Array([1, 2, 3, 250]).buffer
};

const session: Session = {
	id: 'ses-1',
	charter: 'Explore withdraw limits',
	release: 'v2.3.0',
	environment: 'Android 14',
	timeboxMinutes: 60,
	status: 'ended',
	startedAt: 1794500000000,
	pausedAt: null,
	pausedMs: 60000,
	endedAt: 1794503600000,
	createdAt: 1794500000000,
	updatedAt: 1794503600000
};

const finding: Finding = {
	id: 'fi-1',
	sessionId: 'ses-1',
	type: 'bug',
	text: 'Max ignores the fee',
	at: 720000,
	createdAt: 1794500720000,
	updatedAt: 1794500720000
};

/** The same screenshot as an export writes it. */
const fileScreenshot = {
	id: 's-1',
	owner: ['result', 'r-1', 3],
	n: 1,
	mediaType: 'image/webp',
	width: 1920,
	height: 1080,
	createdAt: 1794500000003,
	data: 'AQID+g=='
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
	results: [result],
	sessions: [session],
	findings: [finding],
	screenshots: [screenshot]
};

const NOW = new Date('2026-11-13T10:00:00.000Z');
const json = (value: unknown) => JSON.stringify(value);
const file = (patch: Record<string, unknown> = {}) => ({ ...createBackup(data, NOW), ...patch });
const withData = (patch: Record<string, unknown>) =>
	file({ data: { ...createBackup(data, NOW).data, ...patch } });
/** What parseBackup returns for `data`. */
const parsedFile = (d: BackupData = data) => ({
	app: 'qanchor',
	schemaVersion: 4,
	exportedAt: '2026-11-13T10:00:00.000Z',
	data: d
});

describe('createBackup', () => {
	it('carries app, schema version, export time, and data (FR-003 AC-1)', () => {
		expect(createBackup(data, NOW)).toEqual({
			app: 'qanchor',
			schemaVersion: 4,
			exportedAt: '2026-11-13T10:00:00.000Z',
			data: { ...data, screenshots: [fileScreenshot] }
		});
		expect(backupFileName(NOW)).toBe('qanchor-backup-2026-11-13.json');
	});
});

describe('parseBackup', () => {
	it('accepts its own export unchanged (round trip)', () => {
		expect(parseBackup(json(createBackup(data, NOW)))).toEqual({ ok: true, value: parsedFile() });
	});

	it('accepts a backup with no records', () => {
		const empty = {
			settings: { theme: 'system' },
			endpoints: [],
			wallets: [],
			faucets: [],
			testCases: [],
			runs: [],
			results: [],
			sessions: [],
			findings: [],
			screenshots: []
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
			json(file({ schemaVersion: 5 })),
			{ code: 'newer-version', version: 5 }
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
		expect(parsed.ok && parsed.value).toEqual(
			parsedFile({
				...data,
				testCases: [],
				runs: [],
				results: [],
				sessions: [],
				findings: [],
				screenshots: []
			})
		);
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

describe('backup v3: screenshots (FR-091 AC-2, AC-5)', () => {
	const v2 = () => {
		const current: Record<string, unknown> = { ...createBackup(data, NOW).data };
		delete current.screenshots;
		return { ...file(), schemaVersion: 2, data: current };
	};
	const detail = (input: unknown) => {
		const parsed = parseBackup(json(input));
		if (parsed.ok) return null;
		return parsed.error.code === 'invalid' ? parsed.error.detail : parsed.error;
	};
	const withShots = (...shots: unknown[]) => withData({ screenshots: shots });
	const name = 'Screenshot 1 of 1 ("TC-3")';

	it('writes each image as base64 with its media type, and no size', () => {
		expect(createBackup(data, NOW).data.screenshots).toEqual([fileScreenshot]);
	});

	it('reads the image back and takes the size from the bytes, not the file', () => {
		const parsed = parseBackup(json(withShots({ ...fileScreenshot, size: 99, extra: true })));
		expect(parsed.ok && parsed.value.data.screenshots).toEqual([screenshot]);
	});

	it('a v2 file is upgraded in memory with no screenshots (EC-037)', () => {
		const parsed = parseBackup(json(v2()));
		expect(parsed.ok && parsed.value).toEqual(
			parsedFile({ ...data, sessions: [], findings: [], screenshots: [] })
		);
	});

	it('a v2 file ignores screenshots it should not have', () => {
		const parsed = parseBackup(json({ ...v2(), data: { ...v2().data, screenshots: 'x' } }));
		expect(parsed.ok && parsed.value.data.screenshots).toEqual([]);
	});

	it('a v3 file needs the screenshots list', () => {
		expect(detail(withData({ screenshots: undefined }))).toBe('The screenshots list is missing.');
	});

	it.each([
		['not a record', 'shot', 'Screenshot 1 of 1 is not a record.'],
		['no image data', { ...fileScreenshot, data: '' }, `${name} has no image data.`],
		[
			'image data with a space',
			{ ...fileScreenshot, data: 'AQID +g==' },
			`${name} has image data that is not valid base64.`
		],
		[
			'image data with a line break',
			{ ...fileScreenshot, data: 'AQID\n+g==' },
			`${name} has image data that is not valid base64.`
		],
		[
			'image data cut short',
			{ ...fileScreenshot, data: 'AQID+g' },
			`${name} has image data that is not valid base64.`
		],
		[
			'image data with a character outside base64',
			{ ...fileScreenshot, data: 'AQID-g==' },
			`${name} has image data that is not valid base64.`
		],
		['image data as numbers', { ...fileScreenshot, data: [1, 2, 3] }, `${name} has no image data.`],
		[
			'a PNG media type',
			{ ...fileScreenshot, mediaType: 'image/png' },
			`${name} has a media type other than WebP or JPEG.`
		],
		['no owner', { ...fileScreenshot, owner: undefined }, 'Screenshot 1 of 1 has no valid owner.'],
		[
			'an owner of another kind',
			{ ...fileScreenshot, owner: ['note', 'r-1', 3] },
			'Screenshot 1 of 1 has no valid owner.'
		],
		[
			'a finding owner with a number for the finding',
			{ ...fileScreenshot, owner: ['finding', 'r-1', 3] },
			'Screenshot 1 of 1 has no valid owner.'
		],
		[
			'an owner with case 0',
			{ ...fileScreenshot, owner: ['result', 'r-1', 0] },
			'Screenshot 1 of 1 has no valid owner.'
		],
		['number 0', { ...fileScreenshot, n: 0 }, 'Screenshot 1 of 1 ("TC-3") has no valid n.'],
		[
			'width 0',
			{ ...fileScreenshot, width: 0 },
			'Screenshot 1 of 1 ("TC-3") has a width outside 1 to 1920 px.'
		],
		[
			'height over 1,920 px',
			{ ...fileScreenshot, height: 1921 },
			'Screenshot 1 of 1 ("TC-3") has a height outside 1 to 1920 px.'
		],
		[
			'no creation time',
			{ ...fileScreenshot, createdAt: '2026' },
			'Screenshot 1 of 1 ("TC-3") has no valid createdAt.'
		],
		[
			'a result that is not in the file',
			{ ...fileScreenshot, owner: ['result', 'r-1', 4] },
			'Screenshot 1 of 1 ("TC-4") in run "Smoke v2.3.0" belongs to no result in the file.'
		],
		[
			'a run that is not in the file',
			{ ...fileScreenshot, owner: ['result', 'r-9', 3] },
			'Screenshot 1 of 1 ("TC-3") belongs to no result in the file.'
		]
	])('rejects a screenshot with %s, naming it', (_, shot, expected) => {
		expect(detail(withShots(shot))).toBe(expected);
	});

	it('accepts five screenshots of a result and refuses a sixth (FR-112 AC-6)', () => {
		const shots = Array.from({ length: 6 }, (_, i) => ({
			...fileScreenshot,
			id: `s-${i}`,
			n: i + 1
		}));
		expect(detail(withShots(...shots.slice(0, 5)))).toBeNull();
		expect(detail(withShots(...shots))).toBe(
			'Screenshot 6 of 6 ("TC-3") in run "Smoke v2.3.0" is one more than the 5 a result can have.'
		);
	});

	it('refuses two screenshots with one id, or one number for a result', () => {
		expect(detail(withShots(fileScreenshot, { ...fileScreenshot, n: 2 }))).toBe(
			'Two screenshots have the id "s-1".'
		);
		expect(detail(withShots(fileScreenshot, { ...fileScreenshot, id: 's-2' }))).toBe(
			'Screenshot 2 of 2 ("TC-3") in run "Smoke v2.3.0" has the same number as another screenshot.'
		);
	});

	it('accepts the largest edge and JPEG', () => {
		const shot = { ...fileScreenshot, mediaType: 'image/jpeg', width: 1, height: 1920 };
		expect(detail(withShots(shot))).toBeNull();
	});
});

describe('backup v4: sessions and findings (FR-091 AC-2, AC-5)', () => {
	const v3 = () => {
		const current: Record<string, unknown> = { ...createBackup(data, NOW).data };
		delete current.sessions;
		delete current.findings;
		return { ...file(), schemaVersion: 3, data: current };
	};
	const detail = (input: unknown) => {
		const parsed = parseBackup(json(input));
		if (parsed.ok) return null;
		return parsed.error.code === 'invalid' ? parsed.error.detail : parsed.error;
	};
	const sessionName = 'Session 1 of 1 ("Explore withdraw limits")';
	const findingShot = {
		...fileScreenshot,
		id: 's-9',
		owner: ['finding', 'ses-1', 'fi-1']
	};

	it('round-trips sessions, findings, and a finding screenshot', () => {
		const withShot: BackupData = {
			...data,
			screenshots: [screenshot, { ...screenshot, id: 's-9', owner: ['finding', 'ses-1', 'fi-1'] }]
		};
		const parsed = parseBackup(json(createBackup(withShot, NOW)));
		expect(parsed.ok && parsed.value).toEqual(parsedFile(withShot));
	});

	it('a v3 file is upgraded in memory with no sessions or findings (EC-037)', () => {
		const parsed = parseBackup(json(v3()));
		expect(parsed.ok && parsed.value).toEqual(parsedFile({ ...data, sessions: [], findings: [] }));
	});

	it('a v4 file needs both lists', () => {
		expect(detail(withData({ sessions: undefined }))).toBe('The sessions list is missing.');
		expect(detail(withData({ findings: 'x' }))).toBe('The findings list is missing.');
	});

	it('drops unknown fields on sessions and findings', () => {
		const parsed = parseBackup(
			json(
				withData({
					sessions: [{ ...session, secret: 1 }],
					findings: [{ ...finding, extra: true }]
				})
			)
		);
		expect(parsed.ok && [parsed.value.data.sessions, parsed.value.data.findings]).toEqual([
			[session],
			[finding]
		]);
	});

	it.each([
		['no charter', { ...session, charter: ' ' }, `Session 1 of 1 ("${' '}") has no charter.`],
		[
			'a timebox of 4 minutes',
			{ ...session, timeboxMinutes: 4 },
			`${sessionName} has a timebox in minutes outside 5 to 480.`
		],
		[
			'a timebox that is not a number',
			{ ...session, timeboxMinutes: '60' },
			`${sessionName} has no valid timeboxMinutes.`
		],
		['an unknown status', { ...session, status: 'done' }, `${sessionName} has an unknown status.`],
		[
			'a negative paused time',
			{ ...session, pausedMs: -1 },
			`${sessionName} has no valid pausedMs.`
		],
		[
			'an end time on a running session',
			{ ...session, status: 'running' },
			`${sessionName} has an end time that does not match its state.`
		],
		[
			'a paused session without its pause time',
			{ ...session, status: 'paused', endedAt: null },
			`${sessionName} has a pause time that does not match its state.`
		],
		[
			'a pause time that is not a time',
			{ ...session, pausedAt: 'soon' },
			`${sessionName} has no valid pausedAt.`
		]
	])('rejects a session with %s, naming it', (_, value, expected) => {
		expect(detail(withData({ sessions: [value] }))).toBe(expected);
	});

	it.each([
		['no text', { ...finding, text: '' }, 'Finding 1 of 1 has no text.'],
		['an unknown type', { ...finding, type: 'risk' }, 'Finding 1 of 1 has an unknown type.'],
		['a negative session time', { ...finding, at: -5 }, 'Finding 1 of 1 has no valid at.'],
		[
			'a session that is not in the file',
			{ ...finding, sessionId: 'ses-9' },
			'Finding 1 of 1 belongs to no session in the file.'
		]
	])('rejects a finding with %s, naming it', (_, value, expected) => {
		expect(detail(withData({ findings: [value] }))).toBe(expected);
	});

	it('refuses two sessions or two findings with one id', () => {
		expect(detail(withData({ sessions: [session, session] }))).toBe(
			'Two sessions have the id "ses-1".'
		);
		expect(detail(withData({ findings: [finding, finding] }))).toBe(
			'Two findings have the id "fi-1".'
		);
	});

	it('accepts a screenshot of a finding in the file and refuses one of a missing finding', () => {
		expect(detail(withData({ screenshots: [findingShot] }))).toBeNull();
		expect(
			detail(withData({ screenshots: [{ ...findingShot, owner: ['finding', 'ses-1', 'fi-9'] }] }))
		).toBe('Screenshot 1 of 1 belongs to no finding in the file.');
		// The finding exists, but in another session than the owner names.
		expect(
			detail(withData({ screenshots: [{ ...findingShot, owner: ['finding', 'ses-9', 'fi-1'] }] }))
		).toBe('Screenshot 1 of 1 belongs to no finding in the file.');
	});

	it('refuses a sixth screenshot of a finding (FR-112 AC-6)', () => {
		const shots = Array.from({ length: 6 }, (_, i) => ({ ...findingShot, id: `f-${i}`, n: i + 1 }));
		expect(detail(withData({ screenshots: shots.slice(0, 5) }))).toBeNull();
		expect(detail(withData({ screenshots: shots }))).toBe(
			'Screenshot 6 of 6 is one more than the 5 a finding can have.'
		);
	});
});

describe('version steps (plan note N-1)', () => {
	it('has one step for every version after 1', () => {
		expect(Object.keys(UPGRADES).map(Number)).toEqual([2, 3, 4]);
	});

	it('each step adds what its version introduced and keeps the rest', () => {
		expect(UPGRADES[2]({ wallets: [1], testCases: 'x' })).toEqual({
			wallets: [1],
			testCases: [],
			runs: [],
			results: []
		});
		expect(UPGRADES[3]({ runs: [1], screenshots: 'x' })).toEqual({ runs: [1], screenshots: [] });
		expect(UPGRADES[4]({ runs: [1], sessions: 'x' })).toEqual({
			runs: [1],
			sessions: [],
			findings: []
		});
	});

	it('runs every step after the file version, in order', () => {
		expect(upgradeData({ wallets: [] }, 1)).toEqual({
			wallets: [],
			testCases: [],
			runs: [],
			results: [],
			screenshots: [],
			sessions: [],
			findings: []
		});
		expect(upgradeData({ runs: [1] }, 2)).toEqual({
			runs: [1],
			screenshots: [],
			sessions: [],
			findings: []
		});
		expect(upgradeData({ screenshots: [1] }, 3)).toEqual({
			screenshots: [1],
			sessions: [],
			findings: []
		});
		expect(upgradeData({ sessions: [1] }, 4)).toEqual({ sessions: [1] });
	});
});
