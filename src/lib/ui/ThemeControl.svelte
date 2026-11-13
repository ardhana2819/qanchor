<script lang="ts">
	import { onMount } from 'svelte';
	import { theme, type ThemePreference } from '#lib/state/theme.svelte.ts';
	import SegmentedControl from './SegmentedControl.svelte';

	const options: { value: ThemePreference; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// The prerendered HTML cannot know the stored choice; the pre-paint script already applied it,
	// so this only brings the radios in line after hydration.
	onMount(() => theme.load());
</script>

<SegmentedControl
	legend="Theme"
	{options}
	value={theme.preference}
	onchange={(next) => theme.set(next)}
/>
