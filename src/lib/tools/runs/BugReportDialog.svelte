<script lang="ts">
	import { tick } from 'svelte';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import {
		buildBugReport,
		renderReport,
		SUMMARY_MAX,
		type BugReport,
		type ReportFormat
	} from '#lib/core/qa/report.ts';
	import {
		PRIORITIES,
		PRIORITY_LABELS,
		type CaseSnapshot,
		type Priority,
		type Run,
		type TestResult
	} from '#lib/core/qa/types.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Field from '#lib/ui/Field.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { downloadBlob } from '#lib/ui/download.ts';
	import {
		copiedText,
		JIRA_CLOUD_HINT,
		readReportFormat,
		REPORT_FORMAT_OPTIONS,
		reportTitle,
		storeReportFormat
	} from './report-format.ts';
	import type { ShotItem } from './shots.svelte.ts';

	// The bug report of a saved failure (design 13.3 P2-05; FR-120 to FR-122). It is built from
	// the result each time it opens and never stored, so closing after an edit asks first
	// (FR-120 AC-5). The copy is the text the preview shows.

	interface Props {
		run: Run;
		item: CaseSnapshot;
		result: TestResult | undefined;
		/** The case's screenshots, in order; their file names are the attachments (FR-122). */
		shots: ShotItem[];
		/** The screenshots are still being read. */
		preparing: boolean;
	}

	let { run, item, result, shots, preparing }: Props = $props();

	/**
	 * Safari keeps only the last of several downloads started in one go, and Chrome may drop some,
	 * so Download all starts one file at a time.
	 */
	const DOWNLOAD_GAP_MS = 250;

	const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));

	/** The text fields after Labels, in the order of the copied report. */
	const TEXT_FIELDS = [
		['Environment', 'environment'],
		['Preconditions', 'preconditions'],
		['Steps to reproduce', 'steps'],
		['Expected result', 'expected'],
		['Actual result', 'actual'],
		['Notes', 'notes']
	] as const satisfies readonly (readonly [string, keyof BugReport])[];

	const uid = $props.id();
	const attachmentsId = `${uid}-attachments`;

	let open = $state(false);
	let discardOpen = $state(false);
	let report: BugReport = $state(blank());
	/** The report as built, to tell an edit (FR-120 AC-5). */
	let built = $state('');
	let format: ReportFormat = $state('markdown');
	let downloading = $state(false);

	const key = $derived(formatKey(item.number));
	const edited = $derived(open && JSON.stringify(report) !== built);
	const text = $derived(
		renderReport(
			report,
			shots.map((shot) => shot.fileName),
			format
		)
	);

	function blank(): BugReport {
		return {
			summary: '',
			priority: 'medium',
			labels: '',
			environment: '',
			preconditions: '',
			steps: '',
			expected: '',
			actual: '',
			notes: ''
		};
	}

	/** Opens the report built from the saved failure (FR-120 AC-1 to AC-4, AC-6). */
	export function show(): void {
		if (result?.status !== 'fail') return;
		report = buildBugReport(run, item, result);
		built = JSON.stringify(report);
		format = readReportFormat();
		discardOpen = false;
		open = true;
	}

	function close(): void {
		if (edited) discardOpen = true;
		else open = false;
	}

	function oncancel(event: Event): void {
		if (!edited) return;
		event.preventDefault();
		discardOpen = true;
	}

	async function discard(): Promise<void> {
		discardOpen = false;
		// The confirmation hands focus back first, so closing the report returns it to the button
		// that opened it.
		await tick();
		open = false;
	}

	function chooseFormat(next: ReportFormat): void {
		format = next;
		storeReportFormat(next);
	}

	function copy(): void {
		void clipboard.copy(text, copiedText(format));
	}

	async function downloadAll(): Promise<void> {
		if (downloading) return;
		downloading = true;
		for (const [i, shot] of shots.entries()) {
			if (i > 0) await new Promise((done) => setTimeout(done, DOWNLOAD_GAP_MS));
			downloadBlob(shot.fileName, shot.blob);
		}
		downloading = false;
	}
</script>

<Dialog bind:open title={reportTitle(key)} large {oncancel}>
	<div class="report" data-testid="bug-report">
		<div class="fields">
			<div class="wide">
				<Field label="Summary">
					{#snippet children(control)}
						<TextInput
							{...control}
							bind:value={report.summary}
							maxlength={SUMMARY_MAX}
							autofocus
							data-testid="bug-report-summary"
						/>
					{/snippet}
				</Field>
			</div>
			<div>
				<Field label="Priority">
					{#snippet children(control)}
						<Select
							{...control}
							options={PRIORITY_OPTIONS}
							bind:value={() => report.priority, (value) => (report.priority = value as Priority)}
							data-testid="bug-report-priority"
						/>
					{/snippet}
				</Field>
			</div>
			<div class="two">
				<Field label="Labels">
					{#snippet children(control)}
						<TextInput
							{...control}
							mono
							bind:value={report.labels}
							data-testid="bug-report-labels"
						/>
					{/snippet}
				</Field>
			</div>
			{#each TEXT_FIELDS as [label, field] (field)}
				<div class="wide">
					<Field {label}>
						{#snippet children(control)}
							<Textarea
								{...control}
								rows={2}
								grow
								bind:value={report[field]}
								data-testid="bug-report-{field}"
							/>
						{/snippet}
					</Field>
				</div>
			{/each}
		</div>

		<section class="attachments" aria-labelledby={attachmentsId}>
			<h3 id={attachmentsId}>Attachments</h3>
			{#if preparing}
				<p class="muted">Preparing screenshots…</p>
			{:else if shots.length === 0}
				<p class="muted">No screenshots on this result.</p>
			{:else}
				<ul>
					{#each shots as shot (shot.id)}
						<li data-testid="bug-report-attachment">
							<img src={shot.src} alt={shot.name} />
							<span class="file mono">{shot.fileName}</span>
							<IconButton
								label="Download {shot.fileName}"
								onclick={() => downloadBlob(shot.fileName, shot.blob)}
							>
								<Icon name="download" />
							</IconButton>
						</li>
					{/each}
				</ul>
				{#if shots.length > 1}
					<div>
						<Button
							size="sm"
							loading={downloading}
							onclick={downloadAll}
							data-testid="bug-report-download-all"
						>
							<Icon name="download" />Download all
						</Button>
					</div>
				{/if}
			{/if}
		</section>

		<details class="preview">
			<summary>Preview the copied text</summary>
			<!-- Focusable so keyboard users can scroll it (axe scrollable-region-focusable). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre
				role="region"
				aria-label="Report text"
				tabindex="0"
				data-testid="bug-report-preview">{text}</pre>
		</details>
	</div>

	{#snippet actions()}
		<div class="format">
			<SegmentedControl
				legend="Report format"
				options={REPORT_FORMAT_OPTIONS}
				value={format}
				onchange={chooseFormat}
			/>
			{#if format === 'jira'}
				<span class="hint" data-testid="bug-report-jira-hint">{JIRA_CLOUD_HINT}</span>
			{/if}
		</div>
		<span class="spacer"></span>
		<Button variant="ghost" onclick={close} data-testid="bug-report-close">Close</Button>
		<Button variant="primary" onclick={copy} data-testid="bug-report-copy">
			<Icon name="copy" />Copy report
		</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={discardOpen} title="Discard your edits to this report?" destructive>
	<p>The report is not saved. Generating it again starts from the result.</p>
	{#snippet actions()}
		<Button autofocus onclick={() => (discardOpen = false)}>Keep editing</Button>
		<Button variant="danger" onclick={discard} data-testid="bug-report-discard">Discard</Button>
	{/snippet}
</Dialog>

<style>
	.report {
		display: grid;
		gap: var(--space-6);
		color: var(--color-text);
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.two {
		grid-column: span 2;
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.mono {
		font-family: var(--font-mono);
	}

	ul {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
	}

	img {
		width: 64px;
		height: 42px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		object-fit: cover;
	}

	.file {
		overflow: hidden;
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.preview summary {
		padding: var(--space-2) var(--space-3);
		color: var(--color-text-muted);
		font-weight: 500;
		cursor: pointer;
	}

	.preview pre {
		max-height: 320px;
		margin: 0;
		padding: var(--space-3);
		overflow: auto;
		border-top: 1px solid var(--color-border);
		border-radius: 0 0 var(--radius-md) var(--radius-md);
		background: var(--color-surface);
		font: 400 var(--text-xs) / 1.25rem var(--font-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.format {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.hint {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.spacer {
		flex: 1;
	}

	@media (max-width: 639px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}

		.two {
			grid-column: auto;
		}

		.format {
			flex-basis: 100%;
		}
	}
</style>
