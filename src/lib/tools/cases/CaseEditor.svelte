<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { copyOfCase } from '#lib/core/qa/duplicate.ts';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import { PRIORITIES } from '#lib/core/qa/types.ts';
	import { caseErrors, type CaseField } from '#lib/core/qa/validation.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FooterBar from '#lib/ui/FooterBar.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import PageState from '#lib/ui/PageState.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TagInput from '#lib/ui/TagInput.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { draftFields, draftFromCase, emptyDraft, errorsByField, sameFields } from './draft.ts';
	import {
		deleteBody,
		deletedText,
		duplicatedText,
		PRIORITY_LABELS,
		SAVE_ERRORS
	} from './present.ts';
	import StepsEditor from './StepsEditor.svelte';

	// Test case editor (design 13.3 P2-02; FR-100, FR-102). `/cases/new` and `/cases/edit?id=`;
	// the ID is read after mount (T-047), so the prerendered page holds only the loading state.

	let { mode }: { mode: 'new' | 'edit' } = $props();

	let mounted = $state(false);
	let form: HTMLDivElement | undefined = $state();
	let draft = $state(emptyDraft());
	let baseline = $state(emptyDraft());
	/** The record the draft was loaded from ("new" for a new case); a change of ID reloads it. */
	let loadedFor: string | null = $state(null);
	let attempted = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	let deleteOpen = $state(false);
	let removing = $state(false);
	/** Set while leaving after a delete, so the gone record does not flash "not found". */
	let deleted = $state(false);
	let discardOpen = $state(false);
	let pendingUrl: URL | null = null;

	const id = $derived(
		mode === 'edit' && mounted ? (page.shallow?.url ?? page.url).searchParams.get('id') : null
	);
	const storage = $derived(
		testCases.status === 'unavailable' || runs.status === 'unavailable'
			? 'unavailable'
			: testCases.status === 'ready' && runs.status === 'ready'
				? 'ready'
				: 'loading'
	);
	const record = $derived(id ? testCases.list.find((c) => c.id === id) : undefined);
	const key = $derived(record ? formatKey(record.number) : '');
	const errors = $derived(
		attempted ? errorsByField(caseErrors(draftFields(draft))) : new Map<CaseField, string>()
	);
	const dirty = $derived(loadedFor !== null && !sameFields(draft, baseline));
	const knownTags = $derived(testCases.list.flatMap((c) => c.tags));
	const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

	onMount(() => {
		mounted = true;
		// EC-028: an edit URL without an ID goes to the list, replacing itself so Back skips it.
		if (mode === 'edit' && !(page.shallow?.url ?? page.url).searchParams.get('id')) {
			void goto(resolve('/cases'), { replace: true });
			return;
		}
		void testCases.load();
		void runs.load();
	});

	// Fills the form once the record is read, and again when the route shows another record.
	$effect(() => {
		if (storage !== 'ready') return;
		const wanted = mode === 'new' ? 'new' : (record?.id ?? null);
		if (wanted === null || wanted === loadedFor) return;
		const fresh = record && mode === 'edit' ? draftFromCase(record) : emptyDraft();
		draft = fresh;
		baseline = $state.snapshot(fresh);
		loadedFor = wanted;
		attempted = false;
		saveError = '';
	});

	// FR-100 AC-7: in-app navigation asks with a QAnchor dialog; a reload or closing the tab
	// gets the browser's own prompt, since no page dialog can run then (decisions, T-047).
	beforeNavigate((nav) => {
		if (!dirty) return;
		nav.cancel();
		if (nav.type === 'leave' || !nav.to) return;
		pendingUrl = nav.to.url;
		discardOpen = true;
	});

	function discard(): void {
		baseline = $state.snapshot(draft);
		discardOpen = false;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- an in-app URL SvelteKit already resolved for the cancelled navigation
		if (pendingUrl) void goto(pendingUrl);
	}

	/** Focus on the first field with a problem (FR-100 AC-3, NFR-008). */
	function focusField(field: CaseField): void {
		const box = form?.querySelector(`[data-field="${field}"]`);
		const target =
			box?.querySelector<HTMLElement>('input, textarea, select') ??
			(box instanceof HTMLElement ? box : null);
		target?.focus();
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		attempted = true;
		const first = caseErrors(draftFields(draft))[0];
		if (first) {
			await tick();
			focusField(first.field);
			return;
		}
		saving = true;
		saveError = '';
		const fields = draftFields(draft);
		const saved =
			mode === 'new' || !record
				? await testCases.create(fields)
				: await testCases.update(record.id, fields);
		saving = false;
		if (!saved.ok) {
			saveError = SAVE_ERRORS[saved.error];
			return;
		}
		baseline = $state.snapshot(draft);
		notify.showToast(`Saved ${formatKey(saved.value.number)}.`);
		// A new case continues in its own edit URL, so a reload or a shared link finds it.
		if (mode === 'new') {
			void goto(resolve(`/cases/edit?id=${encodeURIComponent(saved.value.id)}`), {
				replace: true
			});
		}
	}

	async function duplicate(): Promise<void> {
		if (!record) return;
		const created = await testCases.create(copyOfCase(record));
		if (!created.ok) {
			notify.showToast(SAVE_ERRORS[created.error]);
			return;
		}
		notify.showToast(duplicatedText(created.value.number));
		// FR-102 AC-1: the copy opens in the editor.
		void goto(resolve(`/cases/edit?id=${encodeURIComponent(created.value.id)}`));
	}

	async function remove(): Promise<void> {
		if (!record || removing) return;
		removing = true;
		const { number } = record;
		const removed = await testCases.remove(record.id);
		removing = false;
		deleteOpen = false;
		if (!removed.ok) {
			notify.showToast(SAVE_ERRORS[removed.error]);
			return;
		}
		deleted = true;
		baseline = $state.snapshot(draft);
		notify.showToast(deletedText(number));
		void goto(resolve('/cases'));
	}
</script>

<svelte:head>
	<title>{mode === 'new' ? 'New test case' : key ? `Edit ${key}` : 'Test case'} · QAnchor</title>
</svelte:head>

{#if storage === 'loading' || (mode === 'edit' && !mounted) || deleted}
	<p class="muted" data-testid="case-editor-loading">Loading test case…</p>
{:else if storage === 'unavailable'}
	<div data-testid="case-editor-unavailable">
		<Callout variant="warning" title="Storage unavailable">
			Test cases need storage, which is unavailable in this tab, for example in a private window.
			Nothing can be saved here.
		</Callout>
	</div>
{:else if mode === 'edit' && !record}
	<div data-testid="case-editor-not-found">
		<PageState title="Test case not found">
			It may have been deleted, or it was created in another browser.
			{#snippet action()}
				<a href={resolve('/cases')}>Back to test cases</a>
			{/snippet}
		</PageState>
	</div>
{:else if loadedFor !== null}
	<header class="page-header">
		<div>
			{#if key}<p class="key" data-testid="case-editor-key">{key}</p>{/if}
			<h1>{mode === 'new' ? 'New test case' : 'Edit test case'}</h1>
		</div>
		{#if mode === 'edit'}
			<div class="header-actions">
				<Button variant="ghost" onclick={duplicate} data-testid="case-editor-duplicate">
					Duplicate
				</Button>
				<Button
					variant="ghost"
					onclick={() => (deleteOpen = true)}
					data-testid="case-editor-delete"
				>
					Delete
				</Button>
			</div>
		{/if}
	</header>

	<div class="editor" bind:this={form}>
		<FormPanel aria-label={mode === 'new' ? 'New test case' : `Edit ${key}`} onsubmit={save}>
			<div class="fields">
				<div data-field="title">
					<Field label="Title" error={errors.get('title')}>
						{#snippet children(control)}
							<TextInput {...control} bind:value={draft.title} data-testid="case-editor-title" />
						{/snippet}
					</Field>
				</div>

				<div class="row">
					<Field label="Priority">
						{#snippet children(control)}
							<Select
								{...control}
								options={priorityOptions}
								bind:value={draft.priority}
								data-testid="case-editor-priority"
							/>
						{/snippet}
					</Field>
					<div data-field="tags">
						<Field
							label="Tags"
							hint="Enter or comma adds a tag; Backspace in the empty field removes the last."
							error={errors.get('tags')}
						>
							{#snippet children(control)}
								<TagInput
									{...control}
									bind:tags={draft.tags}
									known={knownTags}
									testId="case-editor-tags"
								/>
							{/snippet}
						</Field>
					</div>
				</div>

				<div data-field="preconditions">
					<Field label="Preconditions" error={errors.get('preconditions')}>
						{#snippet children(control)}
							<Textarea
								{...control}
								rows={3}
								grow
								bind:value={draft.preconditions}
								data-testid="case-editor-preconditions"
							/>
						{/snippet}
					</Field>
				</div>

				<StepsEditor bind:steps={draft.steps} {errors} />

				<div data-field="expected">
					<Field
						label="Expected result"
						hint="Required if no step has an expected result."
						error={errors.get('expected')}
					>
						{#snippet children(control)}
							<Textarea
								{...control}
								rows={2}
								grow
								bind:value={draft.expected}
								data-testid="case-editor-expected"
							/>
						{/snippet}
					</Field>
				</div>
			</div>

			<FooterBar>
				{#snippet status()}
					{#if saveError}
						<span class="save-error" role="alert" data-testid="case-editor-save-error"
							>{saveError}</span
						>
					{:else if dirty}
						<span data-testid="case-editor-status">Unsaved changes</span>
					{/if}
				{/snippet}
				{#snippet actions()}
					<Button onclick={() => goto(resolve('/cases'))} data-testid="case-editor-cancel">
						Cancel
					</Button>
					<Button type="submit" variant="primary" loading={saving} data-testid="case-editor-save">
						{saving ? 'Saving…' : 'Save'}
					</Button>
				{/snippet}
			</FooterBar>
		</FormPanel>
	</div>
{/if}

<Dialog bind:open={deleteOpen} title={`Delete ${key}?`} destructive>
	<p data-testid="case-editor-delete-runs">
		{record ? deleteBody(runs.runsWith(record.id).length) : ''}
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			loading={removing}
			onclick={remove}
			data-testid="case-editor-confirm-delete"
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<Dialog
	bind:open={discardOpen}
	title={mode === 'new' ? 'Discard this new test case?' : `Discard your changes to ${key}?`}
	destructive
>
	<p>Your edits have not been saved.</p>
	{#snippet actions()}
		<Button autofocus onclick={() => (discardOpen = false)} data-testid="case-editor-keep-editing">
			Keep editing
		</Button>
		<Button variant="danger" onclick={discard} data-testid="case-editor-discard">Discard</Button>
	{/snippet}
</Dialog>

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		max-width: 820px;
		margin-bottom: var(--space-6);
	}

	.key {
		margin: 0;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	.header-actions {
		display: flex;
		gap: var(--space-1);
	}

	.editor {
		max-width: 820px;
	}

	.fields {
		display: grid;
		gap: var(--space-6);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		align-items: start;
		gap: var(--space-4);
	}

	.save-error {
		color: var(--color-danger);
	}

	@media (max-width: 639px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
