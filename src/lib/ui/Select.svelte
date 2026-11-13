<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	interface Props extends Omit<HTMLSelectAttributes, 'value'> {
		value?: string;
		options: readonly { value: string; label: string }[];
	}

	let { value = $bindable(''), options, ...rest }: Props = $props();
</script>

<!-- Native select for keyboard and picker behaviour; the themed chevron replaces the browser arrow. -->
<span class="wrap">
	<select {...rest} class="control" bind:value>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<span class="chevron"><Icon name="chevron" /></span>
</span>

<style>
	.wrap {
		position: relative;
		display: block;
	}

	select {
		appearance: none;
		padding-right: 34px;
		cursor: pointer;
	}

	.chevron {
		position: absolute;
		top: 50%;
		right: 10px;
		display: flex;
		transform: translateY(-50%);
		color: var(--color-text-muted);
		pointer-events: none;
	}

	select:disabled + .chevron {
		color: var(--color-text-subtle);
	}
</style>
