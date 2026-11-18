<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLTextareaAttributes, 'value'> {
		value?: string;
		/** Monospace for values the user compares or copies: calldata, ABIs. */
		mono?: boolean;
	}

	let { value = $bindable(''), mono = false, rows = 4, ...rest }: Props = $props();

	// Enter adds a line, so Ctrl/Cmd+Enter submits the form the field is in.
	function submitOnModEnter(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}
</script>

<textarea
	{...rest}
	{rows}
	class="control"
	class:mono
	spellcheck="false"
	autocomplete="off"
	bind:value
	onkeydown={(event) => {
		submitOnModEnter(event);
		rest.onkeydown?.(event);
	}}></textarea>

<style>
	textarea {
		display: block;
		height: auto;
		min-height: var(--control-md);
		padding: var(--space-2) var(--space-3);
		resize: vertical;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		line-height: var(--leading-mono);
		overflow-wrap: anywhere;
	}
</style>
