import { snapshotCase } from './run.ts';
import type { TestCase } from './types.ts';
import { TITLE_MAX } from './validation.ts';

/** The fields of a new case copied from `item`; the store gives it the next key (FR-102 AC-1). */
export type CaseCopy = Omit<TestCase, 'id' | 'number' | 'createdAt' | 'updatedAt'>;

const PREFIX = 'Copy of ';

/**
 * A copy of the case with the title prefixed "Copy of ", cut to the title limit so the copy is
 * always valid. Steps and tags are new arrays, so editing the copy never touches the original.
 */
export function copyOfCase(item: TestCase): CaseCopy {
	const { title, preconditions, steps, expected, tags, priority } = snapshotCase(item);
	return {
		title: `${PREFIX}${title}`.slice(0, TITLE_MAX),
		preconditions,
		steps,
		expected,
		tags,
		priority
	};
}
