<script lang="ts">
	import { normalizeTags, suggestTags } from '#lib/core/qa/tags.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import type { FieldControl } from './Field.svelte';
	import TagChip from './TagChip.svelte';

	interface Props extends FieldControl {
		/** Stored form (normalised); invalid tags stay so the form can name them (FR-100 AC-5). */
		tags: string[];
		/** Tags used anywhere so far, offered through a native `<datalist>`. */
		known: Iterable<string>;
		/** Test id prefix for the chips and the input. */
		testId?: string;
	}

	let { tags = $bindable(), known, testId, ...control }: Props = $props();

	let text = $state('');
	let input: HTMLInputElement | undefined = $state();
	const listId = $derived(`${control.id}-suggestions`);
	const suggestions = $derived(suggestTags(known, text, tags));

	function add(entries: string[]): void {
		const next = normalizeTags([...tags, ...entries]);
		if (next.length !== tags.length) tags = next;
	}

	// A comma ends a tag, typed or pasted ("smoke, deposit"); the text after the last comma stays.
	function oninput(): void {
		if (!text.includes(',')) return;
		const parts = text.split(',');
		text = parts.pop() ?? '';
		add(parts);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && text.trim() !== '') {
			// Adds the tag instead of submitting the form; an empty field lets Enter submit.
			event.preventDefault();
			add([text]);
			text = '';
		} else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
			remove(tags.length - 1);
		}
	}

	// Text left in the field still counts, so leaving it never drops a tag silently.
	function onblur(): void {
		if (text.trim() === '') return;
		add([text]);
		text = '';
	}

	function remove(index: number): void {
		const removed = tags[index];
		tags = tags.toSpliced(index, 1);
		notify.announce(`Removed tag ${removed}`);
		input?.focus();
	}
</script>

<div class="control tag-input">
	{#if tags.length > 0}
		<ul class="chips">
			{#each tags as tag, index (tag)}
				<li data-testid={testId ? `${testId}-chip` : undefined}>
					<TagChip {tag} onremove={() => remove(index)} />
				</li>
			{/each}
		</ul>
	{/if}
	<input
		{...control}
		bind:this={input}
		bind:value={text}
		type="text"
		list={listId}
		autocomplete="off"
		spellcheck="false"
		data-testid={testId ? `${testId}-input` : undefined}
		{oninput}
		{onkeydown}
		{onblur}
	/>
	<datalist id={listId}>
		{#each suggestions as suggestion (suggestion)}
			<option value={suggestion}></option>
		{/each}
	</datalist>
</div>

<style>
	.tag-input {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		height: auto;
		min-height: var(--control-md);
		padding: 3px var(--space-1) 3px 3px;
	}

	.tag-input:has(input[aria-invalid='true']) {
		border-color: var(--color-danger);
	}

	.tag-input:has(input:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		max-width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	input {
		flex: 1 1 8ch;
		min-width: 8ch;
		height: 28px;
		padding: 0 var(--space-2);
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	input:focus-visible {
		outline: none;
	}
</style>
