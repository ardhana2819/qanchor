import { DEFAULT_TIMEBOX } from '#lib/core/qa/types.ts';
import { sessionErrors, type SessionField } from '#lib/core/qa/validation.ts';
import type { SessionInput } from '#lib/state/sessions.svelte.ts';
import {
	sessionErrorsByField,
	timeboxChoiceOf,
	timeboxMinutes,
	type TimeboxChoice
} from './present.ts';

/**
 * The fields of Start session and Edit details (FR-130 AC-1, AC-6): errors show once a save was
 * tried, and what is saved is trimmed.
 */
export class SessionForm {
	charter = $state('');
	choice: TimeboxChoice = $state(`${DEFAULT_TIMEBOX}` as TimeboxChoice);
	custom = $state('');
	release = $state('');
	environment = $state('');
	attempted = $state(false);

	constructor(from?: SessionInput) {
		if (!from) return;
		this.charter = from.charter;
		({ choice: this.choice, custom: this.custom } = timeboxChoiceOf(from.timeboxMinutes));
		this.release = from.release;
		this.environment = from.environment;
	}

	get draft() {
		return {
			charter: this.charter,
			timeboxMinutes: timeboxMinutes(this.choice, this.custom),
			release: this.release,
			environment: this.environment
		};
	}

	get errors(): Map<SessionField, string> {
		return sessionErrorsByField(this.attempted ? sessionErrors(this.draft) : []);
	}

	/** What a save writes, trimmed. */
	get input(): SessionInput {
		return {
			charter: this.charter.trim(),
			timeboxMinutes: this.draft.timeboxMinutes,
			release: this.release.trim(),
			environment: this.environment.trim()
		};
	}

	/** Shows the errors from now on; returns the first field with one, or null when valid. */
	validate(): SessionField | null {
		this.attempted = true;
		return sessionErrors(this.draft)[0]?.field ?? null;
	}
}
