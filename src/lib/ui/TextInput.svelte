<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'type' | 'value'> {
		value?: string;
		/** Monospace for values the user compares or copies: addresses, hashes, amounts. */
		mono?: boolean;
		/** Unit shown inside the right edge, e.g. "gwei". Visual only: name the unit in the label too. */
		suffix?: string;
		/**
		 * "numeric" shows a number keypad but keeps a text field: counts and decimals are validated
		 * as text, with no spinner arrows (design section 6, FR-010 AC-3).
		 */
		inputmode?: 'text' | 'numeric' | 'decimal';
	}

	let {
		value = $bindable(''),
		mono = false,
		suffix,
		inputmode = 'text',
		...rest
	}: Props = $props();
</script>

<span class="wrap">
	<input
		{...rest}
		type="text"
		{inputmode}
		class="control"
		class:mono
		class:has-suffix={suffix}
		spellcheck="false"
		autocomplete="off"
		bind:value
	/>
	{#if suffix}
		<span class="suffix" aria-hidden="true">{suffix}</span>
	{/if}
</span>

<style>
	.wrap {
		position: relative;
		display: block;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	.has-suffix {
		padding-right: calc(var(--space-3) + 6ch);
	}

	.suffix {
		position: absolute;
		top: 50%;
		right: var(--space-3);
		transform: translateY(-50%);
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		pointer-events: none;
	}
</style>
