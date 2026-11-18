<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		dataWords,
		decodeCall,
		splitCalldata,
		type DataWord,
		type DecodeError,
		type DecodedCall
	} from '#lib/core/abi/decode.ts';
	import { functionSignature, parseAbiOrSignature } from '#lib/core/abi/parse.ts';
	import { builtinFunction } from '#lib/core/abi/selectors.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import {
		argumentRows,
		CALLDATA_COPY,
		decodeErrorCopy,
		extraBytesCopy,
		type ArgumentRow
	} from './present.ts';

	// Calldata decoder (FR-050 to FR-053, design S-06). Everything runs in this page: an unknown
	// selector is shown as raw words and never looked up online (FR-051 AC-2, EC-015).

	type Outcome =
		| { kind: 'decoded'; call: DecodedCall; source: string; note?: string }
		| { kind: 'no-selector' }
		| { kind: 'unknown'; selector: string; words: DataWord[] }
		| { kind: 'error'; error: DecodeError };

	let calldataInput = $state('');
	let abiInput = $state('');
	let calldataError: string | undefined = $state();
	let abiError: string | undefined = $state();
	let outcome = $state<Outcome | null>(null);
	/** Bumped on every decode, so the table replays its enter animation for a new result. */
	let run = $state(0);
	let form: HTMLElement | undefined = $state();
	let output: HTMLElement | undefined = $state();

	onMount(() => {
		// Hand-off from tx lookup (FR-053): the input arrives in history state, not in the URL.
		const handed = page.state.calldata;
		if (handed) {
			calldataInput = handed;
			void decode();
		}
	});

	async function decode(): Promise<void> {
		const calldata = splitCalldata(calldataInput);
		calldataError = undefined;
		abiError = undefined;
		if (!calldata.ok && calldata.error !== 'no-selector') {
			calldataError = calldata.error === 'empty' ? CALLDATA_COPY.empty : CALLDATA_COPY.format;
		}
		const abi = abiInput.trim() === '' ? null : parseAbiOrSignature(abiInput);
		if (abi && !abi.ok) abiError = abi.error;
		if (calldataError || abiError) {
			// Nothing is decoded while an input is invalid (FR-052 AC-1, AC-5).
			outcome = null;
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		run++;
		outcome = resolve(calldata, abi);
		if (outcome.kind === 'error') {
			await tick();
			output?.querySelector<HTMLElement>('[role="alert"]')?.focus();
		}
	}

	function resolve(
		calldata: ReturnType<typeof splitCalldata>,
		abi: ReturnType<typeof parseAbiOrSignature> | null
	): Outcome {
		if (!calldata.ok) return { kind: 'no-selector' };
		if (abi?.ok) {
			const decoded = decodeCall(abi.value, calldata.value);
			const source = /^[[{]/.test(abiInput.trim()) ? 'Your ABI' : 'Your signature';
			return decoded.ok
				? { kind: 'decoded', call: decoded.value, source }
				: { kind: 'error', error: decoded.error };
		}
		const builtin = builtinFunction(calldata.value.selector);
		if (!builtin) {
			return {
				kind: 'unknown',
				selector: calldata.value.selector,
				words: dataWords(calldata.value.data)
			};
		}
		const decoded = decodeCall([builtin.fn], calldata.value);
		return decoded.ok
			? {
					kind: 'decoded',
					call: decoded.value,
					source: `Built-in · ${builtin.standards}`,
					note: builtin.note
				}
			: { kind: 'error', error: decoded.error };
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		void decode();
	}

	const rows = $derived(
		outcome?.kind === 'decoded' ? argumentRows(outcome.call.fn.inputs, outcome.call.args) : []
	);

	const argumentColumns: Column<ArgumentRow>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{ key: 'name', label: 'Name', value: (row) => row.name, mono: true },
		{ key: 'type', label: 'Type', value: (row) => row.type, mono: true },
		{ key: 'value', label: 'Value', value: (row) => row.value, mono: true }
	];

	const wordColumns: Column<DataWord & { index: number }>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{
			key: 'offset',
			label: 'Offset',
			value: (row) => `0x${row.offset.toString(16).padStart(2, '0')}`,
			mono: true
		},
		{ key: 'word', label: 'Word', value: (row) => row.hex, mono: true }
	];
</script>

<div bind:this={form}>
	<FormPanel aria-label="Decoder" onsubmit={submit} novalidate>
		<div class="fields">
			<Field
				label="Calldata"
				hint="Hex input data of an EVM transaction, with or without 0x."
				error={calldataError}
			>
				{#snippet children(control)}
					<Textarea
						{...control}
						mono
						rows={5}
						bind:value={calldataInput}
						oninput={() => (calldataError = undefined)}
						data-testid="calldata-input"
					/>
				{/snippet}
			</Field>
			<Field
				label="ABI or signature (optional)"
				hint="A signature such as transfer(address,uint256), or a JSON ABI. Without one, the built-in list of ERC-20, ERC-721, and ERC-1155 transfers and approvals is used."
				error={abiError}
			>
				{#snippet children(control)}
					<Textarea
						{...control}
						mono
						rows={4}
						bind:value={abiInput}
						oninput={() => (abiError = undefined)}
						data-testid="calldata-abi"
					/>
				{/snippet}
			</Field>
		</div>

		{#snippet footer()}
			<span class="summary">Ctrl+Enter (⌘+Enter on Mac) decodes from either field.</span>
			<Button type="submit" variant="primary" data-testid="calldata-decode">Decode</Button>
		{/snippet}
	</FormPanel>
</div>

<!-- Not a labelled region, like tx lookup: see the note there (T-040). -->
<section class="output" bind:this={output}>
	<h2>Result</h2>
	{#if outcome === null}
		<EmptyState>
			Paste calldata to decode it. Add an ABI or a signature for functions outside the built-in
			list.
		</EmptyState>
	{:else if outcome.kind === 'no-selector'}
		<div data-testid="calldata-no-selector">
			<Callout variant="info">{CALLDATA_COPY.noSelector}</Callout>
		</div>
	{:else if outcome.kind === 'error'}
		{@const copy = decodeErrorCopy(outcome.error)}
		<div data-testid="calldata-error">
			<Callout variant="danger" title={copy.title} role="alert">{copy.text}</Callout>
		</div>
	{:else if outcome.kind === 'unknown'}
		<div class="stack" data-testid="calldata-unknown">
			<Callout variant="info" title="Unknown selector">
				<span class="mono">{outcome.selector}</span> is not in the built-in list, and no online lookup
				is made. Add an ABI or a signature to decode the arguments.
			</Callout>
			<dl class="facts">
				<div>
					<dt>Selector</dt>
					<dd class="mono">{outcome.selector}</dd>
				</div>
				<div>
					<dt>Argument data</dt>
					<dd>{outcome.words.length} words</dd>
				</div>
			</dl>
			{#if outcome.words.length > 0}
				{#key run}
					<DataTable
						caption="Argument data in 32-byte words"
						columns={wordColumns}
						rows={outcome.words.map((word, i) => ({ ...word, index: i + 1 }))}
						rowKey={(row) => String(row.index)}
						rowTestId="calldata-word-row"
					>
						{#snippet actions(row)}
							<CopyButton label="Copy word {row.index}" value={row.hex} size="sm" />
						{/snippet}
					</DataTable>
				{/key}
			{/if}
		</div>
	{:else}
		{@const call = outcome.call}
		<div class="stack" data-testid="calldata-result">
			<div class="function">
				<span class="mono signature" data-testid="calldata-signature"
					>{functionSignature(call.fn)}</span
				>
				<CopyButton label="Copy signature" value={functionSignature(call.fn)} size="sm" />
				<Badge variant="neutral">{outcome.source}</Badge>
			</div>
			<dl class="facts">
				<div>
					<dt>Function</dt>
					<dd data-testid="calldata-function">{call.fn.name}</dd>
				</div>
				<div>
					<dt>Selector</dt>
					<dd class="mono" data-testid="calldata-selector">{call.selector}</dd>
				</div>
				<div>
					<dt>Arguments</dt>
					<dd>{call.args.length}</dd>
				</div>
			</dl>
			{#if outcome.note}
				<Callout variant="info">{outcome.note}</Callout>
			{/if}
			{#if call.extraBytes > 0}
				<div data-testid="calldata-extra">
					<Callout variant="warning">{extraBytesCopy(call.extraBytes)}</Callout>
				</div>
			{/if}
			{#if rows.length > 0}
				{#key run}
					<DataTable
						caption="Arguments"
						columns={argumentColumns}
						{rows}
						rowKey={(row) => row.key}
						rowTestId="calldata-arg-row"
					>
						{#snippet actions(row)}
							<CopyButton
								label="Copy {row.name || `argument ${row.index}`}"
								value={row.value}
								size="sm"
							/>
						{/snippet}
					</DataTable>
				{/key}
			{:else}
				<p class="muted">This function takes no arguments.</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.fields {
		display: grid;
		gap: var(--space-4);
	}

	.summary,
	.muted {
		color: var(--color-text-muted);
	}

	.output {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.function {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.signature {
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-8);
		margin: 0;
	}

	.facts dt {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.facts dd {
		margin: 0;
	}

	p {
		margin: 0;
	}
</style>
