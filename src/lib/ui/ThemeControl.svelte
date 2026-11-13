<script lang="ts">
	import { onMount } from 'svelte';
	import { theme, type ThemePreference } from '#lib/state/theme.svelte.ts';

	const options: { value: ThemePreference; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// The prerendered HTML cannot know the stored choice; the pre-paint script already applied it,
	// so this only brings the radios in line after hydration.
	onMount(() => theme.load());
</script>

<fieldset class="segmented">
	<legend>Theme</legend>
	{#each options as option (option.value)}
		<label>
			<input
				type="radio"
				name="theme"
				value={option.value}
				checked={theme.preference === option.value}
				onchange={() => theme.set(option.value)}
			/>
			<span>{option.label}</span>
		</label>
	{/each}
</fieldset>

<style>
	.segmented {
		display: flex;
		gap: 2px;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}

	legend {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	label {
		flex: 1;
		position: relative;
	}

	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	span {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: var(--control-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		transition:
			background-color var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out);
	}

	label:hover span {
		color: var(--color-text);
	}

	input:checked + span {
		background: var(--color-bg);
		color: var(--color-text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	input:focus-visible + span {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}
</style>
