import type { ScreenshotType } from './screenshots.ts';

// Records of the QA features (PRD section 10, ADR-015, architecture section 3.1 schema v3).
// Free text is stored exactly as typed and shown as text, never as HTML (FR-100 AC-8).

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
	critical: 'Critical',
	high: 'High',
	medium: 'Medium',
	low: 'Low'
};

/** A new case starts at Medium (FR-100 AC-6). */
export const DEFAULT_PRIORITY: Priority = 'medium';

export interface Step {
	action: string;
	/** Optional per step; a case needs an expected result here or at case level (FR-100 AC-2). */
	expected: string;
}

export interface TestCase {
	id: string;
	/** Shown as `TC-<number>`; assigned once and never reused (FR-100 AC-2). */
	number: number;
	title: string;
	preconditions: string;
	steps: Step[];
	expected: string;
	tags: string[];
	priority: Priority;
	createdAt: number;
	updatedAt: number;
}

/** The case as it was when a run was created; later edits never reach it (FR-110 AC-3). */
export type CaseSnapshot = Pick<
	TestCase,
	'id' | 'number' | 'title' | 'preconditions' | 'steps' | 'expected' | 'tags' | 'priority'
>;

export type RunStatus = 'in-progress' | 'completed';

export interface Run {
	id: string;
	name: string;
	release: string;
	environment: string;
	status: RunStatus;
	/** In key order (design 13.9). */
	cases: CaseSnapshot[];
	createdAt: number;
	updatedAt: number;
	completedAt: number | null;
}

/** "Untested" is not a status: an untested case has no result record. */
export const RESULT_STATUSES = ['pass', 'fail', 'blocked'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export interface TestResult {
	runId: string;
	caseNumber: number;
	status: ResultStatus;
	/** 1-based step of a failed result; 0 = not step-specific; null when no step was picked. */
	failedStep: number | null;
	actual: string;
	reason: string;
	notes: string;
	linkedIssue: string;
	updatedAt: number;
}

/**
 * What a screenshot belongs to (plan finding F-8): a result now, a session finding from T-068.
 * The owner is an array key, so one key range reads or deletes one result's screenshots or a whole
 * run's.
 */
export type ScreenshotOwner = ['result', runId: string, caseNumber: number];

/** Session timebox choices before Custom, in minutes (design 13.3 P2-06). */
export const TIMEBOX_PRESETS = [30, 60, 90] as const;
/** The timebox a new session starts with (design J-10). */
export const DEFAULT_TIMEBOX = 60;

export type SessionStatus = 'running' | 'paused' | 'ended';

/**
 * An exploratory session (FR-130, plan finding F-14). Time is never counted while the page is
 * open: elapsed time comes from these timestamps (finding F-15, EC-036).
 */
export interface Session {
	id: string;
	charter: string;
	release: string;
	environment: string;
	timeboxMinutes: number;
	status: SessionStatus;
	startedAt: number;
	/** When the running pause began; null unless paused. */
	pausedAt: number | null;
	/** Paused time before the current pause. */
	pausedMs: number;
	endedAt: number | null;
	createdAt: number;
	updatedAt: number;
}

export const FINDING_TYPES = ['bug', 'question', 'idea', 'note'] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
	bug: 'Bug',
	question: 'Question',
	idea: 'Idea',
	note: 'Note'
};

/** A new finding starts as a Note (design J-10). */
export const DEFAULT_FINDING_TYPE: FindingType = 'note';

/** One finding of a session (FR-131), in its own store so two tabs keep both (EC-033). */
export interface Finding {
	id: string;
	sessionId: string;
	type: FindingType;
	text: string;
	/** Session time when it was added, in ms (FR-131 AC-1). */
	at: number;
	createdAt: number;
	updatedAt: number;
}

export interface Screenshot {
	id: string;
	owner: ScreenshotOwner;
	/**
	 * 1-based: one more than the owner's highest when added, so removing one screenshot leaves the
	 * others' file names as they were (FR-122).
	 */
	n: number;
	mediaType: ScreenshotType;
	width: number;
	height: number;
	/** Bytes of the stored image. */
	size: number;
	createdAt: number;
	/** An ArrayBuffer, not a Blob: WebKit refuses Blobs in IndexedDB in a private window (T-057). */
	bytes: ArrayBuffer;
}

/** A screenshot without its image: what the page keeps in memory (NFR-004). */
export type ScreenshotMeta = Omit<Screenshot, 'bytes'>;

/**
 * What a new screenshot supplies; the owner, number, size, and time are set on save. The id is
 * set when the image is made, so a screenshot waiting for its result (plan finding F-7) keeps it.
 */
export type NewScreenshot = Pick<Screenshot, 'id' | 'mediaType' | 'width' | 'height' | 'bytes'>;
