import { notify } from './notify.svelte.ts';

/**
 * Copy for every output (FR-004). Success shows the "Copied" toast, which the live region reads
 * out (AC-1). When the Clipboard API is missing, denied, or the page is not focused (EC-023), the
 * value is handed to the shell's fallback dialog, which shows the error and the value selected
 * for a manual copy (AC-3).
 */
class ClipboardState {
	/** Whether the fallback dialog is open. */
	failed = $state(false);
	/** The value that could not be copied. Kept after dismiss() so the dialog can fade out. */
	value = $state('');

	/** Copies the exact value, with nothing added. Returns whether the clipboard took it. */
	async copy(value: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// navigator.clipboard is undefined outside secure contexts, so that lands here too.
			this.value = value;
			this.failed = true;
			return false;
		}
		notify.showToast('Copied');
		return true;
	}

	dismiss(): void {
		this.failed = false;
	}
}

export const clipboard = new ClipboardState();
