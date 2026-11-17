/**
 * One transaction, the same shape for every chain (docs/architecture.md section 3, FR-040 AC-2).
 * Confirmed-only fields are `null` while pending, never zero (FR-040 AC-3, EC-010).
 */
export interface TxResult {
	status: 'success' | 'failed' | 'pending';
	/** Block number (EVM) or slot (Solana), in decimal; null while pending. */
	block: string | null;
	/** Null where the chain has no single sender (Bitcoin) or it is not known yet. */
	from: string | null;
	/**
	 * Null for an EVM contract creation, for Bitcoin (outputs instead), or when there is no single
	 * native-value recipient.
	 */
	to: string | null;
	/**
	 * Native value in the smallest unit; for a failed tx, the value it tried to send (EC-011). For
	 * Bitcoin, the total of all outputs. Null when not known yet (a pending Solana tx).
	 */
	valueBase: bigint | null;
	/**
	 * Total fee in the smallest unit; null while it is not known (a pending EVM or Solana tx). A
	 * pending Bitcoin tx already has a fixed fee. Still set for a failed tx (EC-011).
	 */
	fee: bigint | null;
	extra: EvmExtra | SolanaExtra | TronExtra | BitcoinExtra;
}

export interface EvmExtra {
	chain: 'evm';
	nonce: bigint;
	/** Calldata as 0x-prefixed hex; "0x" for a plain transfer. */
	input: string;
	gasLimit: bigint;
	gasUsed: bigint | null;
	effectiveGasPrice: bigint | null;
	/** OP Stack chains (Base) charge an L1 data fee on top of gas; included in `fee`. */
	l1Fee: bigint | null;
	/** The deployed contract, for a contract creation. */
	contractAddress: string | null;
}

export interface SolanaExtra {
	chain: 'solana';
	/** Unix seconds; null when the node does not know it, or while pending. */
	blockTime: number | null;
	computeUnits: bigint | null;
	/** The runtime error of a failed transaction, as the node's JSON. */
	error: string | null;
	version: 'legacy' | number | null;
}

export interface TronExtra {
	chain: 'tron';
	/** The contract type, e.g. TransferContract, TriggerSmartContract (ADR-006). */
	contractType: string;
	/** The node's result code, e.g. SUCCESS, REVERT, OUT_OF_ENERGY; null while pending. */
	result: string | null;
	/** Why it failed, as the node words it; null otherwise. */
	message: string | null;
	/** Calldata hex of a smart-contract call; null for other contract types. */
	input: string | null;
	energyUsed: bigint | null;
	/** Milliseconds since the epoch; null while pending. */
	blockTime: number | null;
}

export interface BitcoinInput {
	/** The spent output; null for a coinbase input, which spends nothing. */
	txid: string | null;
	vout: number | null;
	/** Null for a coinbase input, or a script with no address form. */
	address: string | null;
	value: bigint | null;
}

export interface BitcoinOutput {
	/** Null for an output with no address form, such as OP_RETURN. */
	address: string | null;
	/** Esplora's script type, e.g. v0_p2wpkh, v1_p2tr, op_return. */
	type: string;
	value: bigint;
}

export interface BitcoinExtra {
	chain: 'bitcoin';
	inputs: BitcoinInput[];
	outputs: BitcoinOutput[];
	/** Virtual size in vbytes: weight / 4, rounded up. */
	vsize: number;
	/** Unix seconds; null while pending. */
	blockTime: number | null;
}

/** Why a response could not be read as a transaction; reported as `bad-response` (FR-042 AC-5). */
export type TxParseError = string;
