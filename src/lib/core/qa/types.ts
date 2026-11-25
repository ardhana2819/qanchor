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
 * What a screenshot belongs to (plan finding F-8): a result now, a session finding in slice 2c.
 * The owner is an array key, so one key range reads or deletes one result's screenshots or a whole
 * run's.
 */
export type ScreenshotOwner = ['result', runId: string, caseNumber: number];

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
