<script lang="ts">
	import { tick } from 'svelte';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import { issueHref } from '#lib/core/qa/run.ts';
	import type { CaseSnapshot, ResultStatus, TestResult } from '#lib/core/qa/types.ts';
	import { resultErrors, type ResultField } from '#lib/core/qa/validation.ts';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import ResultControl from '#lib/ui/ResultControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import ResultScreenshots from './ResultScreenshots.svelte';
	import { isTextField, pastedFiles, pasteAction } from './screenshots.ts';
	import type { RunShots } from './shots.svelte.ts';
	import {
		failedStepOptions,
		isSaved,
		resultErrorsByField,
		saveStatusText,
		type ResultForm
	} from './execution.ts';

	// The result panel of one case (design 13.3 P2-04 item 3; FR-111 AC-2 to AC-6, FR-123).
	// Pass is saved at once. Fail and Blocked need their text first and are saved with Save
	// result; until then the case keeps its stored status (AC-3, AC-4). Once a result is stored,
	// a field that changes is saved when it loses focus, if the form is valid.

	interface Props {
		runId: string;
		item: CaseSnapshot;
		result: TestResult | undefined;
		form: ResultForm;
		completed: boolean;
		/** The run page's screenshots (FR-112). */
		shots: RunShots;
		/** Opens the bug report of the saved failure (FR-120). */
		onreport: () => void;
		/** Stores the form as the case's result; false when the write failed. */
		onsave: (form: ResultForm, how: 'status' | 'submit' | 'field') => Promise<boolean>;
	}

	let {
		runId,
		item,
		result,
		form = $bindable(),
		completed,
		shots,
		onreport,
		onsave
	}: Props = $props();

	let panel: HTMLDivElement | undefined = $state();
	let screenshots: ResultScreenshots | undefined = $state();
	let attempted = $state(false);

	const key = $derived(formatKey(item.number));
	const draft = $derived(form.status === null ? null : { ...form, status: form.status });
	const problems = $derived(draft ? resultErrors(draft, item.steps.length) : []);
	const errors = $derived(
		attempted ? resultErrorsByField(problems) : new Map<ResultField, string>()
	);
	const saved = $derived(isSaved(form, result));
	const needsSave = $derived(
		!completed && (form.status === 'fail' || form.status === 'blocked') && !saved
	);
	const stepOptions = $derived(failedStepOptions(item.steps));
	const issueLink = $derived(saved && result ? issueHref(result.linkedIssue) : null);
	// A report is built from the stored failure, so the form must match it (design 13.3 P2-04).
	const canReport = $derived(form.status === 'fail' && saved && result?.status === 'fail');

	/**
	 * Picks a status. Pass is saved at once; Fail and Blocked wait for their text. `focus` moves
	 * focus to the first required field, for the F and B shortcuts (design 13.4).
	 */
	export async function setStatus(status: ResultStatus, focus = false): Promise<void> {
		if (completed) return;
		form.status = status;
		attempted = false;
		if (status === 'pass') {
			if (problems.length === 0 && !isSaved(form, result)) await onsave(form, 'status');
			return;
		}
		if (focus) {
			await tick();
			focusField(status === 'fail' ? 'actual' : 'reason');
		}
	}

	function focusField(field: ResultField): void {
		panel
			?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input, textarea, select)`)
			?.focus();
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!needsSave) return;
		attempted = true;
		const first = problems[0];
		if (first) {
			await tick();
			focusField(first.field);
			return;
		}
		await onsave(form, 'submit');
	}

	// Paste anywhere in the panel (design 13.5, EC-029): an image wins, also in a text field.
	function onpaste(event: ClipboardEvent): void {
		if (completed || !screenshots) return;
		const files = pastedFiles(event.clipboardData);
		const action = pasteAction(files, isTextField(event.target));
		if (action === 'default') return;
		event.preventDefault();
		if (action === 'add') void screenshots.add(files);
		else screenshots.refuse({ kind: 'no-image' });
	}

	// A stored result keeps up with its fields: a change is saved when the field loses focus.
	async function fieldChanged(): Promise<void> {
		if (completed || !result || form.status !== result.status || saved) return;
		if (problems.length > 0) {
			attempted = true;
			return;
		}
		await onsave(form, 'field');
	}
</script>

<div class="result-panel" bind:this={panel} {onpaste} data-testid="run-result">
	<FormPanel aria-label="Result of {key}" onsubmit={submit} onchange={fieldChanged}>
		<ResultControl
			legend="Result of {key}"
			value={form.status}
			onchange={(status) => setStatus(status)}
			readonly={completed}
			shortcuts
		/>

		{#if form.status !== null}
			<div class="fields">
				{#if form.status === 'fail'}
					<div data-field="failedStep">
						<Field label="Failed step" error={errors.get('failedStep')}>
							{#snippet children(control)}
								<Select
									{...control}
									options={stepOptions}
									bind:value={
										() => String(form.failedStep ?? 0), (value) => (form.failedStep = Number(value))
									}
									disabled={completed}
									data-testid="run-failed-step"
								/>
							{/snippet}
						</Field>
					</div>
				{/if}
				{#if form.status === 'fail' || form.status === 'blocked'}
					<div data-field="linkedIssue">
						<Field
							label="Linked issue (optional)"
							hint="An issue key such as PAY-123, or its URL."
							error={errors.get('linkedIssue')}
						>
							{#snippet children(control)}
								<TextInput
									{...control}
									bind:value={form.linkedIssue}
									readonly={completed}
									spellcheck="false"
									data-testid="run-linked-issue"
								/>
							{/snippet}
						</Field>
						{#if issueLink}
							<!-- An external page: resolve() is for the app's own routes. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								class="issue-link"
								href={issueLink}
								target="_blank"
								rel="noopener noreferrer"
								data-testid="run-issue-link">Open linked issue</a
							>
						{/if}
					</div>
				{/if}
				{#if form.status === 'fail'}
					<div data-field="actual" class="wide">
						<Field label="Actual result" error={errors.get('actual')}>
							{#snippet children(control)}
								<Textarea
									{...control}
									rows={3}
									grow
									bind:value={form.actual}
									readonly={completed}
									data-testid="run-actual"
								/>
							{/snippet}
						</Field>
					</div>
				{/if}
				{#if form.status === 'blocked'}
					<div data-field="reason" class="wide">
						<Field label="Reason" error={errors.get('reason')}>
							{#snippet children(control)}
								<Textarea
									{...control}
									rows={3}
									grow
									bind:value={form.reason}
									readonly={completed}
									data-testid="run-reason"
								/>
							{/snippet}
						</Field>
					</div>
				{/if}
				<div data-field="notes" class="wide">
					<Field label="Notes (optional)" error={errors.get('notes')}>
						{#snippet children(control)}
							<Textarea
								{...control}
								rows={2}
								grow
								bind:value={form.notes}
								readonly={completed}
								data-testid="run-notes"
							/>
						{/snippet}
					</Field>
				</div>
				<!-- Shown with a status: a screenshot waits for its result's first save (F-7). -->
				<div class="wide">
					<ResultScreenshots
						bind:this={screenshots}
						{shots}
						{runId}
						caseNumber={item.number}
						readonly={completed}
					/>
				</div>
			</div>
		{/if}

		{#snippet footer()}
			<p class="save-status" class:pending={needsSave} data-testid="run-save-status">
				{#if completed}
					<Icon name="info" size={14} />
				{:else if needsSave}
					<Icon name="dot" size={14} />
				{:else if saved && result}
					<Icon name="check" size={14} />
				{/if}
				{saveStatusText(form, result, completed)}
			</p>
			{#if canReport || needsSave}
				<div class="footer-actions">
					{#if canReport}
						<Button onclick={onreport} data-testid="run-create-report">
							<Icon name="bug" />Create bug report
						</Button>
					{/if}
					{#if needsSave}
						<Button type="submit" variant="primary" data-testid="run-save-result"
							>Save result</Button
						>
					{/if}
				</div>
			{/if}
		{/snippet}
	</FormPanel>
</div>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.issue-link {
		display: inline-block;
		margin-top: var(--space-1);
		color: var(--color-accent);
		font-size: var(--text-xs);
	}

	.save-status {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: var(--control-md);
		margin: 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
	}

	.footer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.save-status.pending {
		color: var(--color-warning);
	}

	@media (max-width: 639px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
