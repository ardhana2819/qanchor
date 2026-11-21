<script lang="ts">
	import type { Priority } from '#lib/core/qa/types.ts';
	import Badge from './Badge.svelte';

	let { priority }: { priority: Priority } = $props();

	// Text always shown, no status icon: a priority is not a verdict (design 13.5).
	const BADGES = {
		critical: ['danger', 'Critical'],
		high: ['warning', 'High'],
		medium: ['neutral', 'Medium'],
		low: ['subtle', 'Low']
	} as const satisfies Record<Priority, readonly [string, string]>;

	const [variant, label] = $derived(BADGES[priority]);
</script>

<Badge {variant} icon={null}>{label}</Badge>
