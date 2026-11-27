import { networkById } from '#lib/config/networks.ts';
import { parseEndpointUrl } from '#lib/core/endpoint-url.ts';
import { formatKey } from '#lib/core/qa/keys.ts';
import {
	SCREENSHOT_EDGE_MAX,
	SCREENSHOTS_MAX,
	type ScreenshotType
} from '#lib/core/qa/screenshots.ts';
import { normalizeTags } from '#lib/core/qa/tags.ts';
import {
	FINDING_TYPES,
	PRIORITIES,
	RESULT_STATUSES,
	type CaseSnapshot,
	type Finding,
	type FindingType,
	type Priority,
	type ResultStatus,
	type Run,
	type RunStatus,
	type Screenshot,
	type ScreenshotOwner,
	type Session,
	type SessionStatus,
	type Step,
	type TestCase,
	type TestResult
} from '#lib/core/qa/types.ts';
import {
	caseErrors,
	findingErrors,
	resultErrors,
	runErrors,
	sessionErrors,
	type FieldError,
	type FieldProblem
} from '#lib/core/qa/validation.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { ThemePreference } from '#lib/state/theme.svelte.ts';
import type { EndpointOverride, Faucet, Wallet } from './schema.ts';

// The backup file (FR-003, docs/architecture.md section 3.2) and its hand-written import guards
// (ADR-008). Guards build fresh records from known fields only, so unknown fields in a file are
// dropped instead of being written.

export const APP_ID = 'qanchor';

/**
 * The backup format version, the file's `schemaVersion`. It follows the database schema only
 * when the backup content changes. Version 2 adds test cases, runs, and results (FR-091 AC-2),
 * version 3 screenshots, version 4 sessions and findings; older files are upgraded in memory by
 * UPGRADES (AC-3).
 */
export const BACKUP_VERSION = 4;

export interface BackupData {
	settings: { theme: ThemePreference };
	endpoints: EndpointOverride[];
	wallets: Wallet[];
	faucets: Faucet[];
	testCases: TestCase[];
	runs: Run[];
	results: TestResult[];
	sessions: Session[];
	findings: Finding[];
	screenshots: Screenshot[];
}

/** A screenshot as the file carries it: the image as base64, and no size, which the bytes give. */
export type FileScreenshot = Omit<Screenshot, 'bytes' | 'size'> & { data: string };

/** What an export writes: the data with each screenshot's image as base64 (FR-091 AC-2). */
export type FileData = Omit<BackupData, 'screenshots'> & { screenshots: FileScreenshot[] };

export interface BackupFile<D = BackupData> {
	app: typeof APP_ID;
	schemaVersion: number;
	exportedAt: string;
	data: D;
}

export type ImportError =
	| { code: 'not-json' }
	| { code: 'not-qanchor' }
	| { code: 'newer-version'; version: number }
	| { code: 'unsupported-version' }
	| { code: 'invalid'; detail: string };

export function createBackup(data: BackupData, now: Date): BackupFile<FileData> {
	const screenshots = data.screenshots.map((shot): FileScreenshot => ({
		id: shot.id,
		owner: shot.owner,
		n: shot.n,
		mediaType: shot.mediaType,
		width: shot.width,
		height: shot.height,
		createdAt: shot.createdAt,
		data: new Uint8Array(shot.bytes).toBase64()
	}));
	return {
		app: APP_ID,
		schemaVersion: BACKUP_VERSION,
		exportedAt: now.toISOString(),
		data: { ...data, screenshots }
	};
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

/** An override must name a known network and pass the same URL rule as Settings (FR-041 AC-2). */
const endpointGuard: Guard<EndpointOverride> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const record = fields<EndpointOverride>({
		networkId: () => text(value, 'networkId', name),
		url: () => text(value, 'url', name)
	});
	if (!record.ok) return record;
	const network = networkById(record.value.networkId);
	if (!network) return err(`${name} is for an unknown network ("${record.value.networkId}").`);
	const url = parseEndpointUrl(record.value.url, { appendsPaths: network.protocol !== 'json-rpc' });
	if (!url.ok) return err(`${name} (${network.name}) does not have a valid https URL.`);
	return ok({ networkId: network.id, url: url.value });
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
function list<T>(
	value: unknown,
	noun: string,
	key: string,
	guard: Guard<T>,
	label: (item: Shape) => string = (item) => (typeof item.label === 'string' ? item.label : '')
): Result<T[], string> {
	if (!Array.isArray(value)) return err(`The ${key} list is missing.`);
	const records: T[] = [];
	for (const [index, item] of value.entries()) {
		const text = isObject(item) ? label(item) : '';
		const result = guard(
			item,
			`${noun} ${index + 1} of ${value.length}${text ? ` ("${text}")` : ''}`
		);
		if (!result.ok) return result;
		records.push(result.value);
	}
	return ok(records);
}

// ---- Phase 2 records (backup v2) ------------------------------------------------------------
// Field rules are the editor's own (lib/core/qa/validation.ts), so a file can hold nothing the
// app could not have saved.

const RUN_STATUSES: readonly RunStatus[] = ['in-progress', 'completed'];

function positiveInteger(record: Shape, key: string, name: string): Result<number, string> {
	const value = record[key];
	return Number.isSafeInteger(value) && (value as number) > 0
		? ok(value as number)
		: err(`${name} has no valid ${key}.`);
}

function oneOf<T extends string>(
	record: Shape,
	key: string,
	allowed: readonly T[],
	name: string
): Result<T, string> {
	const value = record[key];
	return allowed.includes(value as T) ? ok(value as T) : err(`${name} has an unknown ${key}.`);
}

function strings(record: Shape, key: string, name: string): Result<string[], string> {
	const value = record[key];
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
		? ok(value)
		: err(`${name} has no valid ${key}.`);
}

function steps(record: Shape, name: string): Result<Step[], string> {
	const value = record.steps;
	if (!Array.isArray(value)) return err(`${name} has no valid steps.`);
	const out: Step[] = [];
	for (const [index, step] of value.entries()) {
		const stepName = `${name}, step ${index + 1},`;
		if (!isObject(step)) return err(`${stepName} is not a record.`);
		const checked = fields<Step>({
			action: () => text(step, 'action', stepName, true),
			expected: () => text(step, 'expected', stepName, true)
		});
		if (!checked.ok) return checked;
		out.push(checked.value);
	}
	return ok(out);
}

/** "step 2 action", "title": the field a person would look for in the editor. */
function fieldLabel(field: string): string {
	const step = /^steps\.(\d+)\.(action|expected)$/.exec(field);
	if (step)
		return `step ${Number(step[1]) + 1} ${step[2] === 'action' ? 'action' : 'expected result'}`;
	const labels: Record<string, string> = {
		expected: 'expected result',
		actual: 'actual result',
		failedStep: 'failed step',
		linkedIssue: 'linked issue',
		cases: 'case count',
		timebox: 'timebox in minutes'
	};
	return labels[field] ?? field;
}

function describeProblem(field: string, problem: FieldProblem): string {
	const label = fieldLabel(field);
	switch (problem.kind) {
		case 'required':
			return `has no ${label}`;
		case 'too-long':
			return `has more than ${problem.max.toLocaleString('en-US')} characters in ${label}`;
		case 'too-many':
			return `has more than ${problem.max} ${label}`;
		case 'invalid-tag':
			return `has an invalid tag ("${problem.tag}")`;
		case 'no-expected':
			return 'has no expected result';
		case 'out-of-range':
			return `has a ${label} outside ${problem.min} to ${problem.max}`;
	}
}

function firstError<F extends string>(errors: FieldError<F>[], name: string): string | null {
	const first = errors[0];
	return first ? `${name} ${describeProblem(first.field, first.problem)}.` : null;
}

/** The fields a test case and a run's snapshot share, checked with the editor's rules. */
function caseFields(value: Shape, name: string): Result<CaseSnapshot, string> {
	const record = fields<CaseSnapshot>({
		id: () => text(value, 'id', name),
		number: () => positiveInteger(value, 'number', name),
		title: () => text(value, 'title', name, true),
		preconditions: () => text(value, 'preconditions', name, true),
		steps: () => steps(value, name),
		expected: () => text(value, 'expected', name, true),
		// Normalised as the editor does (FR-100 AC-5), then checked.
		tags: () => {
			const tags = strings(value, 'tags', name);
			return tags.ok ? ok(normalizeTags(tags.value)) : tags;
		},
		priority: () => oneOf<Priority>(value, 'priority', PRIORITIES, name)
	});
	if (!record.ok) return record;
	const problem = firstError(caseErrors(record.value), name);
	return problem ? err(problem) : record;
}

const testCaseGuard: Guard<TestCase> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const shared = caseFields(value, name);
	if (!shared.ok) return shared;
	const times = fields<Pick<TestCase, 'createdAt' | 'updatedAt'>>({
		createdAt: () => time(value, 'createdAt', name),
		updatedAt: () => time(value, 'updatedAt', name)
	});
	return times.ok ? ok({ ...shared.value, ...times.value }) : times;
};

const runGuard: Guard<Run> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const record = fields<Run>({
		id: () => text(value, 'id', name),
		name: () => text(value, 'name', name, true),
		release: () => text(value, 'release', name, true),
		environment: () => text(value, 'environment', name, true),
		status: () => oneOf<RunStatus>(value, 'status', RUN_STATUSES, name),
		cases: () => list(value.cases, `${name}, case`, 'cases', snapshotGuard, caseLabel),
		createdAt: () => time(value, 'createdAt', name),
		updatedAt: () => time(value, 'updatedAt', name),
		completedAt: () => (value.completedAt === null ? ok(null) : time(value, 'completedAt', name))
	});
	if (!record.ok) return record;
	const run = record.value;
	const problem = firstError(runErrors({ ...run, caseCount: run.cases.length }), name);
	if (problem) return err(problem);
	const duplicate = firstDuplicate(run.cases.map((c) => c.number));
	if (duplicate !== null) return err(`${name} lists ${formatKey(duplicate)} twice.`);
	return ok({ ...run, cases: [...run.cases].sort((a, b) => a.number - b.number) });
};

const snapshotGuard: Guard<CaseSnapshot> = (value, name) =>
	isObject(value) ? caseFields(value, name) : err(`${name} is not a record.`);

/** `TC-<n>` for a valid case number, or '' so a broken record is named without a wrong key. */
function keyLabel(number: unknown): string {
	return Number.isSafeInteger(number) && (number as number) > 0 ? formatKey(number as number) : '';
}

function caseLabel(item: Shape): string {
	const key = keyLabel(item.number);
	const title = typeof item.title === 'string' ? item.title : '';
	return [key, title].filter(Boolean).join(' ');
}

const resultGuard: Guard<TestResult> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	return fields<TestResult>({
		runId: () => text(value, 'runId', name),
		caseNumber: () => positiveInteger(value, 'caseNumber', name),
		status: () => oneOf<ResultStatus>(value, 'status', RESULT_STATUSES, name),
		failedStep: () =>
			value.failedStep === null || Number.isSafeInteger(value.failedStep)
				? ok(value.failedStep as number | null)
				: err(`${name} has no valid failedStep.`),
		actual: () => text(value, 'actual', name, true),
		reason: () => text(value, 'reason', name, true),
		notes: () => text(value, 'notes', name, true),
		linkedIssue: () => text(value, 'linkedIssue', name, true),
		updatedAt: () => time(value, 'updatedAt', name)
	});
};

function resultLabel(item: Shape): string {
	return keyLabel(item.caseNumber);
}

function firstDuplicate<T>(values: readonly T[]): T | null {
	const seen = new Set<T>();
	for (const value of values) {
		if (seen.has(value)) return value;
		seen.add(value);
	}
	return null;
}

type Phase2 = Pick<BackupData, 'testCases' | 'runs' | 'results'>;

/**
 * Checks that the Phase 2 lists fit together: one test case per key and per id, one run per id,
 * and each result for a case in its run with the rules of that case's steps (ADR-015).
 */
function crossCheck({ testCases, runs, results }: Phase2): string | null {
	const caseKey = firstDuplicate(testCases.map((c) => c.number));
	if (caseKey !== null) return `Two test cases have the key ${formatKey(caseKey)}.`;
	const caseId = firstDuplicate(testCases.map((c) => c.id));
	if (caseId !== null) return `Two test cases have the id "${caseId}".`;
	const runId = firstDuplicate(runs.map((r) => r.id));
	if (runId !== null) return `Two runs have the id "${runId}".`;

	const byId = new Map(runs.map((run) => [run.id, run]));
	const seen = new Set<string>();
	for (const [index, result] of results.entries()) {
		const name = `Result ${index + 1} of ${results.length} ("${formatKey(result.caseNumber)}")`;
		const run = byId.get(result.runId);
		if (!run) return `${name} belongs to no run in the file.`;
		const where = `${name} in run "${run.name}"`;
		const item = run.cases.find((c) => c.number === result.caseNumber);
		if (!item) return `${where} is for a case that is not in the run.`;
		const key = `${result.runId}\u0000${result.caseNumber}`;
		if (seen.has(key)) return `${where} is the second result for that case.`;
		seen.add(key);
		const problem = firstError(resultErrors(result, item.steps.length), where);
		if (problem) return problem;
	}
	return null;
}

function phase2Lists(data: Shape): Result<Phase2, string> {
	const lists = fields<Phase2>({
		testCases: () => list(data.testCases, 'Test case', 'testCases', testCaseGuard, caseLabel),
		runs: () =>
			list(data.runs, 'Run', 'runs', runGuard, (item) =>
				typeof item.name === 'string' ? item.name : ''
			),
		results: () => list(data.results, 'Result', 'results', resultGuard, resultLabel)
	});
	if (!lists.ok) return lists;
	const problem = crossCheck(lists.value);
	return problem ? err(problem) : lists;
}

// ---- Sessions and findings (backup v4) --------------------------------------------------------

const SESSION_STATUSES: readonly SessionStatus[] = ['running', 'paused', 'ended'];

function nullableTime(record: Shape, key: string, name: string): Result<number | null, string> {
	return record[key] === null ? ok(null) : time(record, key, name);
}

function duration(record: Shape, key: string, name: string): Result<number, string> {
	const value = record[key];
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? ok(value)
		: err(`${name} has no valid ${key}.`);
}

const sessionGuard: Guard<Session> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const record = fields<Session>({
		id: () => text(value, 'id', name),
		charter: () => text(value, 'charter', name, true),
		release: () => text(value, 'release', name, true),
		environment: () => text(value, 'environment', name, true),
		timeboxMinutes: () =>
			typeof value.timeboxMinutes === 'number'
				? ok(value.timeboxMinutes)
				: err(`${name} has no valid timeboxMinutes.`),
		status: () => oneOf<SessionStatus>(value, 'status', SESSION_STATUSES, name),
		startedAt: () => time(value, 'startedAt', name),
		pausedAt: () => nullableTime(value, 'pausedAt', name),
		pausedMs: () => duration(value, 'pausedMs', name),
		endedAt: () => nullableTime(value, 'endedAt', name),
		createdAt: () => time(value, 'createdAt', name),
		updatedAt: () => time(value, 'updatedAt', name)
	});
	if (!record.ok) return record;
	const session = record.value;
	const problem = firstError(sessionErrors(session), name);
	if (problem) return err(problem);
	// The clock fields must match the state, or the session time would be wrong (F-15).
	if ((session.status === 'paused') !== (session.pausedAt !== null))
		return err(`${name} has a pause time that does not match its state.`);
	if ((session.status === 'ended') !== (session.endedAt !== null))
		return err(`${name} has an end time that does not match its state.`);
	return record;
};

const findingGuard: Guard<Finding> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const record = fields<Finding>({
		id: () => text(value, 'id', name),
		sessionId: () => text(value, 'sessionId', name),
		type: () => oneOf<FindingType>(value, 'type', FINDING_TYPES, name),
		text: () => text(value, 'text', name, true),
		at: () => duration(value, 'at', name),
		createdAt: () => time(value, 'createdAt', name),
		updatedAt: () => time(value, 'updatedAt', name)
	});
	if (!record.ok) return record;
	const problem = firstError(findingErrors(record.value.text), name);
	return problem ? err(problem) : record;
};

type Sessions = Pick<BackupData, 'sessions' | 'findings'>;

/** One session per id, one finding per id, and each finding in a session of the file. */
function crossCheckSessions({ sessions, findings }: Sessions): string | null {
	const sessionId = firstDuplicate(sessions.map((s) => s.id));
	if (sessionId !== null) return `Two sessions have the id "${sessionId}".`;
	const findingId = firstDuplicate(findings.map((f) => f.id));
	if (findingId !== null) return `Two findings have the id "${findingId}".`;
	const ids = new Set(sessions.map((s) => s.id));
	for (const [index, finding] of findings.entries()) {
		if (!ids.has(finding.sessionId))
			return `Finding ${index + 1} of ${findings.length} belongs to no session in the file.`;
	}
	return null;
}

function sessionLists(data: Shape): Result<Sessions, string> {
	const lists = fields<Sessions>({
		sessions: () =>
			list(data.sessions, 'Session', 'sessions', sessionGuard, (item) =>
				typeof item.charter === 'string' ? item.charter : ''
			),
		findings: () => list(data.findings, 'Finding', 'findings', findingGuard, () => '')
	});
	if (!lists.ok) return lists;
	const problem = crossCheckSessions(lists.value);
	return problem ? err(problem) : lists;
}

// ---- Screenshots (backup v3) ------------------------------------------------------------------

const MEDIA_TYPES: readonly ScreenshotType[] = ['image/webp', 'image/jpeg'];

/**
 * Canonical base64 only: whole groups of four, with padding only at the end. `fromBase64` alone
 * would also accept spaces and line breaks.
 */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function owner(record: Shape, name: string): Result<ScreenshotOwner, string> {
	const value = record.owner;
	const id = (part: unknown) => typeof part === 'string' && part !== '';
	if (Array.isArray(value) && value.length === 3 && id(value[1])) {
		if (value[0] === 'result' && Number.isSafeInteger(value[2]) && value[2] > 0)
			return ok(['result', value[1], value[2]]);
		if (value[0] === 'finding' && id(value[2])) return ok(['finding', value[1], value[2]]);
	}
	return err(`${name} has no valid owner.`);
}

function edge(record: Shape, key: string, name: string): Result<number, string> {
	const value = record[key];
	return Number.isSafeInteger(value) &&
		(value as number) >= 1 &&
		(value as number) <= SCREENSHOT_EDGE_MAX
		? ok(value as number)
		: err(`${name} has a ${key} outside 1 to ${SCREENSHOT_EDGE_MAX} px.`);
}

function image(record: Shape, name: string): Result<ArrayBuffer, string> {
	const value = record.data;
	if (typeof value !== 'string' || value === '') return err(`${name} has no image data.`);
	if (!BASE64.test(value)) return err(`${name} has image data that is not valid base64.`);
	return ok(Uint8Array.fromBase64(value, { lastChunkHandling: 'strict' }).buffer);
}

const screenshotGuard: Guard<Screenshot> = (value, name) => {
	if (!isObject(value)) return err(`${name} is not a record.`);
	const record = fields<Omit<Screenshot, 'size'>>({
		id: () => text(value, 'id', name),
		owner: () => owner(value, name),
		n: () => positiveInteger(value, 'n', name),
		mediaType: () =>
			MEDIA_TYPES.includes(value.mediaType as ScreenshotType)
				? ok(value.mediaType as ScreenshotType)
				: err(`${name} has a media type other than WebP or JPEG.`),
		width: () => edge(value, 'width', name),
		height: () => edge(value, 'height', name),
		createdAt: () => time(value, 'createdAt', name),
		bytes: () => image(value, name)
	});
	return record.ok ? ok({ ...record.value, size: record.value.bytes.byteLength }) : record;
};

function screenshotLabel(item: Shape): string {
	return Array.isArray(item.owner) && item.owner[0] === 'result' ? keyLabel(item.owner[2]) : '';
}

/**
 * Checks that each screenshot belongs to a result or a finding in the file, with one id per
 * screenshot, one number per screenshot of an owner, and at most SCREENSHOTS_MAX per owner
 * (FR-091 AC-5).
 */
function crossCheckScreenshots(
	screenshots: readonly Screenshot[],
	{ runs, results, findings }: Pick<BackupData, 'runs' | 'results' | 'findings'>
): string | null {
	const id = firstDuplicate(screenshots.map((s) => s.id));
	if (id !== null) return `Two screenshots have the id "${id}".`;
	const owners = new Set([
		...results.map((r) => ownerKey(['result', r.runId, r.caseNumber])),
		...findings.map((f) => ownerKey(['finding', f.sessionId, f.id]))
	]);
	const runNames = new Map(runs.map((run) => [run.id, run.name]));
	const numbers = new Map<string, Set<number>>();
	for (const [index, shot] of screenshots.entries()) {
		const name = `Screenshot ${index + 1} of ${screenshots.length}${ownerLabel(shot.owner, runNames)}`;
		const key = ownerKey(shot.owner);
		if (!owners.has(key))
			return `${name} belongs to no ${shot.owner[0] === 'result' ? 'result' : 'finding'} in the file.`;
		const taken = numbers.get(key) ?? new Set<number>();
		if (taken.has(shot.n)) return `${name} has the same number as another screenshot.`;
		if (taken.size >= SCREENSHOTS_MAX)
			return `${name} is one more than the ${SCREENSHOTS_MAX} a ${shot.owner[0]} can have.`;
		taken.add(shot.n);
		numbers.set(key, taken);
	}
	return null;
}

function ownerKey(owner: ScreenshotOwner): string {
	return owner.join('\u0000');
}

/** ' ("TC-12") in run "Smoke"' for a result's screenshot; '' for a finding's. */
function ownerLabel(owner: ScreenshotOwner, runNames: ReadonlyMap<string, string>): string {
	if (owner[0] !== 'result') return '';
	const run = runNames.get(owner[1]);
	return ` ("${formatKey(owner[2])}")${run === undefined ? '' : ` in run "${run}"`}`;
}

// ---- Version steps (plan note N-1) --------------------------------------------------------------

/**
 * One data transform per version step, applied in order to a file's data before it is checked,
 * so the guards only know the current format. A step adds what that version introduced; a
 * list an older file should not have is replaced, not trusted.
 */
export const UPGRADES: Readonly<Record<number, (data: Shape) => Shape>> = {
	2: (data) => ({ ...data, testCases: [], runs: [], results: [] }),
	3: (data) => ({ ...data, screenshots: [] }),
	4: (data) => ({ ...data, sessions: [], findings: [] })
};

/** Brings a file's data from `version` to BACKUP_VERSION. */
export function upgradeData(data: Shape, version: number): Shape {
	let out = data;
	for (let next = version + 1; next <= BACKUP_VERSION; next++) out = UPGRADES[next](out);
	return out;
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
	if (typeof version === 'number' && Number.isInteger(version) && version > BACKUP_VERSION) {
		return err({ code: 'newer-version', version });
	}
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return err({ code: 'unsupported-version' });
	}

	const exportedAt = file.exportedAt;
	if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
		return err({ code: 'invalid', detail: 'The export date is missing or not a date.' });
	}
	if (!isObject(file.data)) return err({ code: 'invalid', detail: 'The data section is missing.' });
	const data = upgradeData(file.data, version);
	if (!isObject(data.settings) || !THEMES.includes(data.settings.theme as ThemePreference)) {
		return err({ code: 'invalid', detail: 'The theme setting is missing or not recognised.' });
	}

	const checked = fields<Pick<BackupData, 'endpoints' | 'wallets' | 'faucets'>>({
		endpoints: () => list(data.endpoints, 'Endpoint override', 'endpoints', endpointGuard),
		wallets: () => list(data.wallets, 'Wallet', 'wallets', walletGuard),
		faucets: () => list(data.faucets, 'Faucet link', 'faucets', faucetGuard)
	});
	if (!checked.ok) return err({ code: 'invalid', detail: checked.error });
	const phase2 = phase2Lists(data);
	if (!phase2.ok) return err({ code: 'invalid', detail: phase2.error });
	const sessions = sessionLists(data);
	if (!sessions.ok) return err({ code: 'invalid', detail: sessions.error });
	const screenshots = list(
		data.screenshots,
		'Screenshot',
		'screenshots',
		screenshotGuard,
		screenshotLabel
	);
	if (!screenshots.ok) return err({ code: 'invalid', detail: screenshots.error });
	const problem = crossCheckScreenshots(screenshots.value, {
		...phase2.value,
		...sessions.value
	});
	if (problem) return err({ code: 'invalid', detail: problem });

	return ok({
		app: APP_ID,
		schemaVersion: BACKUP_VERSION,
		exportedAt,
		data: {
			settings: { theme: data.settings.theme as ThemePreference },
			...checked.value,
			...phase2.value,
			...sessions.value,
			screenshots: screenshots.value
		}
	});
}
