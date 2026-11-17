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
	/** Null for an EVM contract creation, or when there is no single native-value recipient. */
	to: string | null;
	/** Native value in the smallest unit; for a failed tx, the value it tried to send (EC-011). */
	valueBase: bigint | null;
	/** Total fee in the smallest unit; null while pending. Still set for a failed tx (EC-011). */
	fee: bigint | null;
	extra: EvmExtra | SolanaExtra;
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

/** Why a response could not be read as a transaction; reported as `bad-response` (FR-042 AC-5). */
export type TxParseError = string;
