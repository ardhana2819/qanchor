<script lang="ts">
	import type { Network } from '#lib/config/networks.ts';
	import type { BitcoinInput, BitcoinOutput, TxResult } from '#lib/core/tx/types.ts';
	import type { Endpoint } from '#lib/net/endpoint.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import { amount, utc } from './present.ts';

	// The result panel (FR-040 AC-2, AC-3; design S-05): a definition list, mono values with a copy
	// button each. A field the chain has not settled yet reads "Not available while pending",
	// never 0 (AC-3). Bitcoin lists inputs and outputs instead of one sender and recipient.

	interface Props {
		tx: TxResult;
		network: Network;
		endpoint: Endpoint;
		hash: string;
	}

	let { tx, network, endpoint, hash }: Props = $props();

	interface Row {
		key: string;
		label: string;
		/** null: not available while pending. */
		value: string | null;
		/** A second line, e.g. the value in the smallest unit. */
		detail?: string;
		/** Monospace with a copy button. */
		copy?: boolean;
	}

	const PENDING = 'Not available while pending';
	const STATUS = {
		success: { variant: 'success', text: 'Success' },
		failed: { variant: 'danger', text: 'Failed' },
		pending: { variant: 'warning', text: 'Pending' }
	} as const;

	const money = (value: bigint | null): Pick<Row, 'value' | 'detail'> => {
		if (value === null) return { value: null };
		const { display, base } = amount(value, network);
		return { value: display, detail: base };
	};

	function recipient(): string | null {
		if (tx.to !== null) return tx.to;
		if (tx.extra.chain === 'evm') return 'None (contract creation)';
		return tx.status === 'pending' && tx.extra.chain === 'solana' ? null : 'No single recipient';
	}

	const rows: Row[] = $derived.by(() => {
		const e = tx.extra;
		const list: Row[] = [
			{ key: 'network', label: 'Network', value: network.name },
			{ key: 'hash', label: e.chain === 'solana' ? 'Signature' : 'Hash', value: hash, copy: true },
			{ key: 'block', label: e.chain === 'solana' ? 'Slot' : 'Block', value: tx.block, copy: true }
		];
		if (e.chain !== 'bitcoin') {
			list.push(
				{ key: 'from', label: 'From', value: tx.from, copy: true },
				{ key: 'to', label: 'To', value: recipient(), copy: tx.to !== null }
			);
		}
		list.push(
			{
				key: 'value',
				label: e.chain === 'bitcoin' ? 'Total output' : 'Value',
				...money(tx.valueBase)
			},
			{ key: 'fee', label: 'Fee', ...money(tx.fee) }
		);
		switch (e.chain) {
			case 'evm':
				list.push(
					{ key: 'nonce', label: 'Nonce', value: e.nonce.toString() },
					{
						key: 'gas',
						label: 'Gas used',
						value: e.gasUsed === null ? null : `${e.gasUsed} of ${e.gasLimit}`,
						detail: e.gasUsed === null ? `Gas limit ${e.gasLimit}` : undefined
					},
					{
						key: 'gas-price',
						label: 'Gas price',
						value: e.effectiveGasPrice === null ? null : `${e.effectiveGasPrice} wei`
					}
				);
				if (e.l1Fee !== null) list.push({ key: 'l1-fee', label: 'L1 data fee', ...money(e.l1Fee) });
				if (e.contractAddress !== null) {
					list.push({
						key: 'contract',
						label: 'Contract created',
						value: e.contractAddress,
						copy: true
					});
				}
				list.push({ key: 'input', label: 'Input data', value: e.input, copy: true });
				break;
			case 'solana':
				list.push(
					{
						key: 'time',
						label: 'Block time',
						value: e.blockTime === null ? null : utc(e.blockTime * 1000)
					},
					{ key: 'compute', label: 'Compute units', value: e.computeUnits?.toString() ?? null }
				);
				if (e.error !== null)
					list.push({ key: 'error', label: 'Error', value: e.error, copy: true });
				break;
			case 'tron':
				list.push(
					{ key: 'contract-type', label: 'Contract type', value: e.contractType },
					{ key: 'result', label: 'Result', value: e.result },
					{
						key: 'time',
						label: 'Block time',
						value: e.blockTime === null ? null : utc(e.blockTime)
					},
					{
						key: 'energy',
						label: 'Energy used',
						value: tx.status === 'pending' ? null : (e.energyUsed ?? 0n).toString()
					}
				);
				if (e.message !== null) list.push({ key: 'reason', label: 'Reason', value: e.message });
				if (e.input !== null)
					list.push({ key: 'input', label: 'Input data', value: e.input, copy: true });
				break;
			case 'bitcoin':
				list.push(
					{
						key: 'time',
						label: 'Block time',
						value: e.blockTime === null ? null : utc(e.blockTime * 1000)
					},
					{ key: 'size', label: 'Virtual size', value: `${e.vsize} vB` }
				);
				break;
		}
		return list;
	});

	const btc = (value: bigint | null) => (value === null ? '' : amount(value, network).display);

	const inputColumns: Column<BitcoinInput & { index: number }>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{
			key: 'address',
			label: 'Address',
			value: (row) =>
				row.txid === null ? 'Coinbase (new coins)' : (row.address ?? 'No address form'),
			mono: true
		},
		{ key: 'value', label: 'Value', value: (row) => btc(row.value), mono: true, numeric: true }
	];

	const outputColumns: Column<BitcoinOutput & { index: number }>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{
			key: 'address',
			label: 'Address',
			value: (row) => row.address ?? 'No address form',
			mono: true
		},
		{ key: 'type', label: 'Type', value: (row) => row.type },
		{ key: 'value', label: 'Value', value: (row) => btc(row.value), mono: true, numeric: true }
	];
</script>

<div class="result" data-testid="tx-result">
	<div class="head">
		<Badge variant={STATUS[tx.status].variant}>{STATUS[tx.status].text}</Badge>
		<span class="endpoint">
			from {endpoint.host}{endpoint.isOverride ? ' (your endpoint)' : ''}
		</span>
	</div>

	<dl>
		{#each rows as row (row.key)}
			<div class="row" data-testid="tx-row" data-field={row.key}>
				<dt>{row.label}</dt>
				<dd>
					<span class="text">
						{#if row.value === null}
							<span class="na">{PENDING}</span>
						{:else}
							<span class:mono={row.copy || row.detail !== undefined} class="value"
								>{row.value}</span
							>
							{#if row.detail}<span class="detail mono">{row.detail}</span>{/if}
						{/if}
					</span>
					{#if row.copy && row.value !== null}
						<CopyButton value={row.value} label="Copy {row.label.toLowerCase()}" size="sm" />
					{/if}
				</dd>
			</div>
		{/each}
	</dl>

	{#if tx.extra.chain === 'bitcoin'}
		<h3>Inputs</h3>
		<DataTable
			caption="Inputs"
			columns={inputColumns}
			rows={tx.extra.inputs.map((input, i) => ({ ...input, index: i + 1 }))}
			rowKey={(row) => String(row.index)}
			rowTestId="tx-input-row"
		/>
		<h3>Outputs</h3>
		<DataTable
			caption="Outputs"
			columns={outputColumns}
			rows={tx.extra.outputs.map((output, i) => ({ ...output, index: i + 1 }))}
			rowKey={(row) => String(row.index)}
			rowTestId="tx-output-row"
		/>
	{/if}
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.endpoint {
		color: var(--color-text-muted);
	}

	dl {
		margin: 0;
		border-top: 1px solid var(--color-border);
	}

	.row {
		display: grid;
		grid-template-columns: 10rem minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
	}

	dt {
		color: var(--color-text-muted);
	}

	dd {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	.value {
		overflow-wrap: anywhere;
	}

	/* Calldata can be kilobytes long: keep it to a few lines, scrollable. */
	[data-field='input'] .value {
		max-height: 7.5rem;
		overflow-y: auto;
	}

	.detail,
	.na {
		color: var(--color-text-muted);
	}

	.detail {
		overflow-wrap: anywhere;
	}

	h3 {
		margin: var(--space-6) 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-1);
		}
	}
</style>
