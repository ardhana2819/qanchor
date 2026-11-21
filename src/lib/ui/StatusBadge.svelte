<script lang="ts" module>
	import type { ResultStatus, RunStatus } from '#lib/core/qa/types.ts';

	/** A case's result in a run (untested has no record) or a run's own status (design 13.5). */
	export type Status = ResultStatus | 'untested' | RunStatus;
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
		completed: ['success', 'Completed']
	} as const satisfies Record<Status, readonly [string, string]>;

	const [variant, label] = $derived(BADGES[status]);
</script>

<Badge {variant}>{label}</Badge>
