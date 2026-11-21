<script lang="ts">
	interface Props {
		legend: string;
		options: readonly { value: string; label: string; disabled?: boolean }[];
		/** The checked values. */
		group?: string[];
		/** `inline`: options in one wrapping row, e.g. a filter (design 13.3 P2-01). */
		columns?: 1 | 2 | 'inline';
		/** Shown below the options; also marks the group invalid, e.g. "Select at least one field." */
		error?: string;
	}

	let { legend, options, group = $bindable([]), columns = 1, error }: Props = $props();

	const id = $props.id();
	const errorId = `${id}-error`;
</script>

<fieldset aria-describedby={error ? errorId : undefined}>
	<legend>{legend}</legend>
	<div class="options" class:two={columns === 2} class:inline={columns === 'inline'}>
		{#each options as option (option.value)}
			<label class:disabled={option.disabled}>
				<input type="checkbox" value={option.value} disabled={option.disabled} bind:group />
				{option.label}
			</label>
		{/each}
	</div>
	{#if error}
		<p class="error" id={errorId}>{error}</p>
	{/if}
</fieldset>

<style>
	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-2);
		padding: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	.options {
		display: grid;
		gap: 10px var(--space-4);
	}

	.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.inline {
		display: flex;
		flex-wrap: wrap;
		min-height: var(--control-md);
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.disabled {
		color: var(--color-text-subtle);
		cursor: not-allowed;
	}

	input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--color-accent);
	}

	.error {
		margin: var(--space-2) 0 0;
		color: var(--color-danger);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}
</style>
