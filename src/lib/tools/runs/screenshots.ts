import { formatKey } from '#lib/core/qa/keys.ts';
import { SCREENSHOTS_MAX } from '#lib/core/qa/screenshots.ts';

// Screenshots in run execution (design 13.5, 13.7, 13.8; FR-112, EC-029): what a paste does,
// and the copy around the screenshot area.

/** The files a paste carries; a screenshot tool puts its image here as a file. */
export function pastedFiles(data: Pick<DataTransfer, 'files'> | null): File[] {
	return data ? [...data.files] : [];
}

/**
 * What a paste in the result panel does (EC-029): an image wins, also in a text field; a paste
 * without one keeps its usual meaning in a text field and is refused elsewhere.
 */
export function pasteAction(
	files: readonly File[],
	inTextField: boolean
): 'default' | 'no-image' | 'add' {
	if (files.some((file) => file.type.startsWith('image/'))) return 'add';
	if (inTextField) return 'default';
	return files.length > 0 ? 'add' : 'no-image';
}

/** Whether a paste lands where text is typed. */
export function isTextField(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || target.matches('textarea, input:not([type="radio"])');
}

/** Alt text and buttons' names (design 13.8): "Screenshot 2 of TC-12". */
export const shotName = (caseNumber: number, n: number) =>
	`Screenshot ${n} of ${formatKey(caseNumber)}`;

/** The live region after an add (design 13.7). */
export const addedText = (count: number) => `Screenshot added, ${count} of ${SCREENSHOTS_MAX}.`;

/** A GIF keeps its first frame (EC-030); said when it is added, as the record does not keep it. */
export const firstFrameText = (file: string) => `Only the first frame of ${file} was added.`;
