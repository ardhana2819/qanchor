export type ThemePreference = 'system' | 'light' | 'dark';

/** Also read by the pre-paint script in src/app.html; keep both in sync (ADR-014). */
export const THEME_STORAGE_KEY = 'qanchor.theme';

/** Anything other than an explicit light or dark choice means "follow the system". */
export function parseThemePreference(value: string | null): ThemePreference {
	return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * The theme preference (FR-002). "system" removes `data-theme`, so CSS `light-dark()` follows
 * the OS setting live without any listener (AC-3); "light" and "dark" pin `color-scheme`.
 */
class ThemeState {
	preference = $state<ThemePreference>('system');

	/** Syncs with what the pre-paint script applied. Browser only: call from onMount. */
	load(): void {
		this.preference = parseThemePreference(readStored());
	}

	/** Applies immediately; returns false when the choice could not be saved for later visits. */
	set(next: ThemePreference): boolean {
		this.preference = next;
		if (next === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = next;
		return store(next);
	}
}

export const theme = new ThemeState();

function readStored(): string | null {
	try {
		return localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		// Storage blocked by browser settings: the system theme applies, as the pre-paint script did.
		return null;
	}
}

function store(preference: ThemePreference): boolean {
	try {
		if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, preference);
		return true;
	} catch {
		return false;
	}
}
