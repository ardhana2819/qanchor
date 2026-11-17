<script lang="ts">
	import { splitMatches } from './checklists.ts';

	let { text, filter }: { text: string; filter: string } = $props();
</script>

{#each splitMatches(text, filter) as part, i (i)}{#if part.match}<mark>{part.text}</mark
		>{:else}{part.text}{/if}{/each}

<style>
	mark {
		border-radius: 2px;
		background: var(--color-accent-subtle);
		color: inherit;
		font-weight: 600;
	}
</style>
