/** How long the object URL stays valid; Safari can still be reading it right after click(). */
const REVOKE_AFTER_MS = 1000;

/** Saves text as a UTF-8 file through the browser's download, without any server (FR-004 AC-2). */
export function downloadText(filename: string, text: string, mime: string): void {
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/** Saves a file made in the page or a worker (a backup, FR-003 AC-1). */
export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
