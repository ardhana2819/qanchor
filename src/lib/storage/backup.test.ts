import { describe, expect, it } from 'vitest';
import {
	backupFileName,
	createBackup,
	describeImportError,
	parseBackup,
	type BackupData
} from './backup.ts';

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

const data: BackupData = {
	settings: { theme: 'dark' },
	endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
	wallets: [{ ...wallet }],
	faucets: [
		{ id: 'f-1', networkId: 'eth-sepolia', label: 'Team faucet', url: 'https://faucet.example.dev' }
	]
};

const NOW = new Date('2026-11-13T10:00:00.000Z');
const json = (value: unknown) => JSON.stringify(value);
const file = (patch: Record<string, unknown> = {}) => ({ ...createBackup(data, NOW), ...patch });
const withData = (patch: Record<string, unknown>) => file({ data: { ...data, ...patch } });

describe('createBackup', () => {
	it('carries app, schema version, export time, and data (FR-003 AC-1)', () => {
		expect(createBackup(data, NOW)).toEqual({
			app: 'qanchor',
			schemaVersion: 1,
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
		const empty = { settings: { theme: 'system' }, endpoints: [], wallets: [], faucets: [] };
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
		['schema version as text', json(file({ schemaVersion: '1' })), { code: 'unsupported-version' }],
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
