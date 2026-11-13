/** How long a toast stays on screen (design section 6). */
export const TOAST_DURATION_MS = 4000;

/**
 * Confirmations for the one polite live region and the toast in the app shell (design S-00,
 * FR-004 AC-1). A toast is never the only place a message appears: the page that triggers it
 * keeps its own visible state, and the live region reads it out.
 */
class NotifyState {
	/** Text for the polite live region; screen readers read each change. */
	announcement = $state('');
	/** Visible toast text; empty when no toast is shown. */
	toast = $state('');

	#timer: ReturnType<typeof setTimeout> | undefined;

	/** Reads a message out without showing anything, e.g. "12 addresses generated". */
	announce(message: string): void {
		// Clearing first makes a repeated message ("Copied" twice) count as a change.
		this.announcement = '';
		queueMicrotask(() => (this.announcement = message));
	}

	/** Shows a toast for TOAST_DURATION_MS and reads it out. */
	showToast(message: string): void {
		clearTimeout(this.#timer);
		this.toast = message;
		this.announce(message);
		this.#timer = setTimeout(() => (this.toast = ''), TOAST_DURATION_MS);
	}
}

export const notify = new NotifyState();
