<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLTextareaAttributes, 'value'> {
		value?: string;
		/** Monospace for values the user compares or copies: calldata, ABIs. */
		mono?: boolean;
		/**
		 * Grows with its content up to 12 rows, then scrolls (design 13.8). Uses CSS
		 * `field-sizing`; a browser without it (Firefox) keeps `rows` and the resize handle.
		 */
		grow?: boolean;
	}

	let { value = $bindable(''), mono = false, grow = false, rows = 4, ...rest }: Props = $props();

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
	class:grow
	style:--rows={grow ? rows : undefined}
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

	.grow {
		field-sizing: content;
		min-height: calc(var(--rows) * var(--leading-sm) + 2 * var(--space-2) + 2px);
		max-height: calc(12 * var(--leading-sm) + 2 * var(--space-2) + 2px);
		overflow-y: auto;
	}

	@supports (field-sizing: content) {
		.grow {
			resize: none;
		}
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		line-height: var(--leading-mono);
		overflow-wrap: anywhere;
	}
</style>
