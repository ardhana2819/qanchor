<script lang="ts">
	import { onDestroy } from 'svelte';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		/** Copied exactly as given (FR-004 AC-1). */
		value: string;
		/** Names the object: "Copy address 3", "Copy wei" (design section 9). */
		label: string;
		size?: 'sm' | 'md';
		/** For an empty value: copying nothing would still show "Copied". */
		disabled?: boolean;
	}

	let { value, label, size = 'md', disabled = false }: Props = $props();

	/** How long the check mark stays before the copy icon returns (design 2.4). */
	const CONFIRM_MS = 1400;

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(): Promise<void> {
		if (!(await clipboard.copy(value))) return;
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), CONFIRM_MS);
	}

	onDestroy(() => clearTimeout(timer));
</script>

<IconButton {label} {size} {disabled} onclick={copy}>
	<!-- Copy confirmation (design 2.4): the icons swap with opacity and scale only. -->
	<span class="icons" class:copied>
		<span class="copy"><Icon name="copy" /></span>
		<span class="check"><Icon name="check" /></span>
	</span>
</IconButton>

<style>
	.icons {
		display: grid;
	}

	.icons > span {
		display: flex;
		grid-area: 1 / 1;
		transition:
			opacity var(--duration-base) var(--ease-out),
			transform var(--duration-base) var(--ease-spring);
	}

	.check {
		color: var(--color-success);
		opacity: 0;
		transform: scale(0.5);
	}

	.copied .copy {
		opacity: 0;
		transform: scale(0.5);
	}

	.copied .check {
		opacity: 1;
		transform: none;
	}
</style>
