<script lang="ts" module>
	/** Attributes the wrapped control must spread, so label, hint, and error are linked to it. */
	export interface FieldControl {
		id: string;
		'aria-describedby': string | undefined;
		'aria-invalid': 'true' | undefined;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		label: string;
		hint?: string;
		/** Shown below the control with an icon; also sets aria-invalid on it. */
		error?: string;
		children: Snippet<[FieldControl]>;
	}

	let { label, hint, error, children }: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const errorId = `${id}-error`;

	const control: FieldControl = $derived({
		id,
		'aria-describedby':
			[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
		'aria-invalid': error ? 'true' : undefined
	});
</script>

<div class="field">
	<label for={id}>{label}</label>
	{@render children(control)}
	{#if error}
		<p class="error" id={errorId}><Icon name="warning" size={14} />{error}</p>
	{/if}
	{#if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	label {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	p {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.hint {
		color: var(--color-text-subtle);
	}

	.error {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--color-danger);
	}
</style>
