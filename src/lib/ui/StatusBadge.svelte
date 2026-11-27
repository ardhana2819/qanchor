<script lang="ts" module>
	import type { ResultStatus, RunStatus, SessionStatus } from '#lib/core/qa/types.ts';

	/** A case's result in a run (untested has no record), a run's or a session's status (13.5). */
	export type Status = ResultStatus | 'untested' | RunStatus | SessionStatus;
</script>

<script lang="ts">
	import Badge from './Badge.svelte';

	let { status }: { status: Status } = $props();

	const BADGES = {
		pass: ['success', 'Pass'],
		fail: ['danger', 'Fail'],
		blocked: ['warning', 'Blocked'],
		untested: ['neutral', 'Untested'],
		'in-progress': ['neutral', 'In progress'],
		completed: ['success', 'Completed'],
		running: ['neutral', 'Running'],
		paused: ['subtle', 'Paused'],
		ended: ['success', 'Ended']
	} as const satisfies Record<Status, readonly [string, string]>;

	const [variant, label] = $derived(BADGES[status]);
</script>

<Badge {variant}>{label}</Badge>
