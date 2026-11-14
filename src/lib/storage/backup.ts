import { err, ok, type Result } from '#lib/core/result.ts';
import type { ThemePreference } from '#lib/state/theme.svelte.ts';
import { DB_VERSION, type EndpointOverride, type Faucet, type Wallet } from './schema.ts';

// The backup file (FR-003, docs/architecture.md section 3.2) and its hand-written import guards
// (ADR-008). Guards build fresh records from known fields only, so unknown fields in a file are
// dropped instead of being written.

export const APP_ID = 'qanchor';

export interface BackupData {
	settings: { theme: ThemePreference };
	endpoints: EndpointOverride[];
	wallets: Wallet[];
	faucets: Faucet[];
}

export interface BackupFile {
	app: typeof APP_ID;
	schemaVersion: number;
	exportedAt: string;
	data: BackupData;
}

export type ImportError =
	| { code: 'not-json' }
	| { code: 'not-qanchor' }
	| { code: 'newer-version'; version: number }
	| { code: 'unsupported-version' }
	| { code: 'invalid'; detail: string };

export function createBackup(data: BackupData, now: Date): BackupFile {
	return { app: APP_ID, schemaVersion: DB_VERSION, exportedAt: now.toISOString(), data };
}

export function backupFileName(now: Date): string {
	return `qanchor-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Plain text for an import error: the reason only; the page adds "Nothing was changed." */
export function describeImportError(error: ImportError): string {
	switch (error.code) {
		case 'not-json':
			return 'The file is not valid JSON. It may be incomplete or not a QAnchor backup.';
		case 'not-qanchor':
			return 'This is not a QAnchor backup file.';
		case 'newer-version':
			return `Unknown schema version ${error.version}. This backup comes from a newer version of QAnchor.`;
		case 'unsupported-version':
			return 'The schema version is missing or not supported.';
		case 'invalid':
			return error.detail;
	}
}

type Guard<T> = (value: unknown, name: string) => Result<T, string>;
type Shape = Record<string, unknown>;

const isObject = (value: unknown): value is Shape =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function text(
	record: Shape,
	key: string,
	name: string,
	allowEmpty = false
): Result<string, string> {
	const value = record[key];
	if (typeof value !== 'string') return err(`${name} has no ${key}.`);
	if (!allowEmpty && value.trim() === '') return err(`${name} has an empty ${key}.`);
	return ok(value);
}

function time(record: Shape, key: string, name: string): Result<number, string> {
	const value = record[key];
	return typeof value === 'number' && Number.isFinite(value)
		? ok(value)
		: err(`${name} has no valid ${key}.`);
}

/** Collects named fields, stopping at the first problem. */
function fields<T>(checks: { [K in keyof T]: () => Result<T[K], string> }): Result<T, string> {
	const out = {} as T;
	for (const key of Object.keys(checks) as (keyof T)[]) {
		const result = checks[key]();
		if (!result.ok) return result;
		out[key] = result.value;
	}
	return ok(out);
}

const CHAINS: readonly Wallet['chain'][] = ['evm', 'bitcoin', 'solana', 'tron'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const endpointGuard: Guard<EndpointOverride> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	return fields<EndpointOverride>({
		networkId: () => text(value, 'networkId', name),
		url: () => text(value, 'url', name)
	});
};

const walletGuard: Guard<Wallet> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	return fields<Wallet>({
		id: () => text(value, 'id', name),
		label: () => text(value, 'label', name, true),
		chain: () =>
			CHAINS.includes(value.chain as Wallet['chain'])
				? ok(value.chain as Wallet['chain'])
				: err(`${name} has an unknown chain.`),
		networkId: () => text(value, 'networkId', name),
		address: () => text(value, 'address', name),
		notes: () => text(value, 'notes', name, true),
		createdAt: () => time(value, 'createdAt', name),
		updatedAt: () => time(value, 'updatedAt', name)
	});
};

const faucetGuard: Guard<Faucet> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	return fields<Faucet>({
		id: () => text(value, 'id', name),
		networkId: () => text(value, 'networkId', name),
		label: () => text(value, 'label', name, true),
		url: () => text(value, 'url', name)
	});
};

/** Names records the way a person counts them: "Wallet 4 of 6 ("QA main")". */
function list<T>(value: unknown, noun: string, key: string, guard: Guard<T>): Result<T[], string> {
	if (!Array.isArray(value)) return err(`The ${key} list is missing.`);
	const records: T[] = [];
	for (const [index, item] of value.entries()) {
		const label =
			isObject(item) && typeof item.label === 'string' && item.label ? ` ("${item.label}")` : '';
		const result = guard(item, `${noun} ${index + 1} of ${value.length}${label}`);
		if (!result.ok) return result;
		records.push(result.value);
	}
	return ok(records);
}

/** Parses and checks a whole backup before anything is written (FR-003 AC-4, EC-020). */
export function parseBackup(json: string): Result<BackupFile, ImportError> {
	let file: unknown;
	try {
		file = JSON.parse(json);
	} catch {
		return err({ code: 'not-json' });
	}
	if (!isObject(file) || file.app !== APP_ID) return err({ code: 'not-qanchor' });

	const version = file.schemaVersion;
	if (typeof version === 'number' && Number.isInteger(version) && version > DB_VERSION) {
		return err({ code: 'newer-version', version });
	}
	if (version !== DB_VERSION) return err({ code: 'unsupported-version' });

	const exportedAt = file.exportedAt;
	if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
		return err({ code: 'invalid', detail: 'The export date is missing or not a date.' });
	}
	if (!isObject(file.data)) return err({ code: 'invalid', detail: 'The data section is missing.' });
	const data = file.data;
	if (!isObject(data.settings) || !THEMES.includes(data.settings.theme as ThemePreference)) {
		return err({ code: 'invalid', detail: 'The theme setting is missing or not recognised.' });
	}

	const checked = fields<Omit<BackupData, 'settings'>>({
		endpoints: () => list(data.endpoints, 'Endpoint override', 'endpoints', endpointGuard),
		wallets: () => list(data.wallets, 'Wallet', 'wallets', walletGuard),
		faucets: () => list(data.faucets, 'Faucet link', 'faucets', faucetGuard)
	});
	if (!checked.ok) return err({ code: 'invalid', detail: checked.error });

	return ok({
		app: APP_ID,
		schemaVersion: version,
		exportedAt,
		data: { settings: { theme: data.settings.theme as ThemePreference }, ...checked.value }
	});
}
