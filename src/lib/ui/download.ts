/** How long the object URL stays valid; Safari can still be reading it right after click(). */
const REVOKE_AFTER_MS = 1000;

/** Saves text as a UTF-8 file through the browser's download, without any server (FR-004 AC-2). */
export function downloadText(filename: string, text: string, mime: string): void {
	const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
