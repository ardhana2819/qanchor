import { describe, expect, it } from 'vitest';
import {
	functionSelector,
	functionSignature,
	parseAbiJson,
	parseAbiOrSignature,
	parseSignature
} from './parse.ts';
import type { AbiFunction } from './types.ts';

function sig(text: string): AbiFunction {
	const result = parseSignature(text);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

describe('parseSignature', () => {
	it.each([
		['transfer(address,uint256)', 'transfer(address,uint256)'],
		['function transfer(address to, uint256 amount)', 'transfer(address,uint256)'],
		['  transfer ( address , uint256 )  ', 'transfer(address,uint256)'],
		['f(uint,int)', 'f(uint256,int256)'],
		[
			'f(uint8,int16,bytes1,bytes32,bool,string,bytes)',
			'f(uint8,int16,bytes1,bytes32,bool,string,bytes)'
		],
		['f((uint256,string)[2],tuple(address))', 'f((uint256,string)[2],(address))'],
		['f(uint256[][3],(bool,(bytes)[])[])', 'f(uint256[][3],(bool,(bytes)[])[])'],
		['f(string memory name, bytes calldata)', 'f(string,bytes)'],
		['f(address payable to, address payable)', 'f(address,address)'],
		['noArgs()', 'noArgs()'],
		['_$x()', '_$x()']
	])('reads %s as %s', (text, canonical) => {
		expect(functionSignature(sig(text))).toBe(canonical);
	});

	it('keeps parameter names, including in tuples', () => {
		const fn = sig('function swap((address payable token, uint24 fee) params, uint256 amount)');
		expect(fn.name).toBe('swap');
		expect(fn.inputs.map((p) => p.name)).toEqual(['params', 'amount']);
		const [params] = fn.inputs;
		expect(params.type.kind === 'tuple' && params.type.components.map((c) => c.name)).toEqual([
			'token',
			'fee'
		]);
	});

	it.each([
		['', 'Enter a function signature, e.g. transfer(address,uint256).'],
		['   ', 'Enter a function signature, e.g. transfer(address,uint256).'],
		['transfer', 'Expected "(" at the end.'],
		['transfer(address', 'Expected "," at the end.'],
		['transfer(address,)', 'Expected a type at character 18.'],
		['transfer address', 'Expected "(" at character 10, found "a".'],
		['1f()', 'Expected a function name at character 1.'],
		['f(uint256) x', 'Unexpected "x" at character 12.'],
		['f(uint7)', 'Unknown type "uint7".'],
		['f(uint0)', 'Unknown type "uint0".'],
		['f(uint264)', 'Unknown type "uint264".'],
		['f(uint12)', 'Unknown type "uint12".'],
		['f(int255)', 'Unknown type "int255".'],
		['f(uint256 payable x)', 'Expected "," at character 19, found "x".'],
		['f(uint08)', 'Unknown type "uint08".'],
		['f(bytes0)', 'Unknown type "bytes0".'],
		['f(bytes33)', 'Unknown type "bytes33".'],
		['f(fixed128x18)', 'Unknown type "fixed128x18".'],
		['f(function)', 'Unknown type "function".'],
		['f(())', 'A tuple needs at least one component.'],
		['f(uint256[0])', 'Array length "0" must be a whole number from 1.'],
		['f(uint256[01])', 'Array length "01" must be a whole number from 1.'],
		[
			'f(uint256[99999999999999999])',
			'Array length "99999999999999999" must be a whole number from 1.'
		],
		['f(uint256[x])', 'Expected "]" at character 11, found "x".']
	])('rejects %j: %s', (text, message) => {
		expect(parseSignature(text)).toEqual({ ok: false, error: message });
	});
});

describe('functionSelector', () => {
	// Published selectors: the Solidity ABI specification examples and ERC-20 / Uniswap V3.
	it.each([
		['baz(uint32,bool)', '0xcdcd77c0'],
		['bar(bytes3[2])', '0xfce353f6'],
		['sam(bytes,bool,uint256[])', '0xa5643bf2'],
		['f(uint256,uint32[],bytes10,bytes)', '0x8be65246'],
		['g(uint256[][],string[])', '0x2289b18c'],
		['transfer(address,uint256)', '0xa9059cbb'],
		['function approve(address spender, uint amount)', '0x095ea7b3'],
		['transferFrom(address,address,uint256)', '0x23b872dd'],
		[
			'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
			'0x414bf389'
		]
	])('%s -> %s', (text, selector) => {
		expect(functionSelector(sig(text))).toBe(selector);
	});
});

describe('parseAbiJson', () => {
	const erc20 = [
		{
			type: 'function',
			name: 'transfer',
			inputs: [
				{ name: 'to', type: 'address' },
				{ name: 'amount', type: 'uint256' }
			],
			outputs: [{ name: '', type: 'bool' }]
		},
		{ type: 'event', name: 'Transfer', inputs: [] },
		{ type: 'constructor', inputs: [] },
		{ name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }] }
	];

	it('reads the functions, skipping events and constructors; no type means function', () => {
		const result = parseAbiJson(JSON.stringify(erc20));
		expect(result.ok && result.value.map(functionSignature)).toEqual([
			'transfer(address,uint256)',
			'balanceOf(address)'
		]);
		expect(result.ok && result.value[0].inputs.map((p) => p.name)).toEqual(['to', 'amount']);
	});

	it('reads a build artifact with an abi array', () => {
		const result = parseAbiJson(JSON.stringify({ contractName: 'Token', abi: erc20 }));
		expect(result.ok && result.value.length).toBe(2);
	});

	it('reads tuples and arrays of tuples from components', () => {
		const abi = [
			{
				type: 'function',
				name: 'exactInputSingle',
				inputs: [
					{
						name: 'params',
						type: 'tuple',
						components: [
							{ name: 'tokenIn', type: 'address' },
							{ name: 'tokenOut', type: 'address' },
							{ name: 'fee', type: 'uint24' },
							{ name: 'recipient', type: 'address' },
							{ name: 'deadline', type: 'uint256' },
							{ name: 'amountIn', type: 'uint256' },
							{ name: 'amountOutMinimum', type: 'uint256' },
							{ name: 'sqrtPriceLimitX96', type: 'uint160' }
						]
					}
				]
			},
			{
				type: 'function',
				name: 'batch',
				inputs: [
					{
						name: 'orders',
						type: 'tuple[2][]',
						components: [
							{ name: 'maker', type: 'address' },
							{ name: 'legs', type: 'tuple[]', components: [{ name: 'id', type: 'uint' }] }
						]
					},
					{ type: 'bytes' }
				]
			}
		];
		const result = parseAbiJson(JSON.stringify(abi));
		expect(result.ok && result.value.map(functionSelector)[0]).toBe('0x414bf389');
		expect(result.ok && functionSignature(result.value[1])).toBe(
			'batch((address,(uint256)[])[2][],bytes)'
		);
		expect(result.ok && result.value[1].inputs[1].name).toBe('');
	});

	it.each([
		['', 'Paste a JSON ABI.'],
		['[{"type":"function",', 'The ABI is not valid JSON.'],
		['{"name":"transfer"}', 'The ABI must be a JSON array of entries.'],
		['"transfer(address,uint256)"', 'The ABI must be a JSON array of entries.'],
		['[]', 'The ABI has no functions.'],
		['[{"type":"event","name":"Transfer","inputs":[]}]', 'The ABI has no functions.'],
		['[1]', 'Entry 1 is not an object.'],
		['[{"type":"function"}]', 'Entry 1 has no valid function name.'],
		['[{"type":"function","name":"a b"}]', 'Entry 1 has no valid function name.'],
		['[{"type":"function","name":"f","inputs":{}}]', 'Entry 1 (f): "inputs" is not an array.'],
		['[{"name":"f","inputs":[1]}]', 'Entry 1 (f), input 1 is not an object.'],
		[
			'[{"name":"f","inputs":[{"name":1,"type":"bool"}]}]',
			'Entry 1 (f), input 1: "name" is not a string.'
		],
		['[{"name":"f","inputs":[{"name":"x"}]}]', 'Entry 1 (f), input "x" has no "type".'],
		[
			'[{"name":"f","inputs":[{"type":"uint7"}]}]',
			'Entry 1 (f), input 1 has an unknown type "uint7".'
		],
		[
			'[{"name":"f","inputs":[{"type":"uint256 "}]}]',
			'Entry 1 (f), input 1 has an unknown type "uint256 ".'
		],
		[
			'[{"name":"f","inputs":[{"type":"(uint256)"}]}]',
			'Entry 1 (f), input 1 has an unknown type "(uint256)".'
		],
		[
			'[{"name":"f","inputs":[{"name":"t","type":"tuple"}]}]',
			'Entry 1 (f), input "t" is a tuple without "components".'
		],
		[
			'[{"name":"f","inputs":[{"type":"tuple[]","components":[]}]}]',
			'Entry 1 (f), input 1 is a tuple without "components".'
		],
		[
			'[{"name":"f","inputs":[{"type":"uint256[0]"}]}]',
			'Array length "0" must be a whole number from 1.'
		],
		[
			'[{"name":"ok","inputs":[]},{"name":"f","inputs":[{"name":"t","type":"tuple","components":[{"type":"foo"}]}]}]',
			'Entry 2 (f), input "t", input 1 has an unknown type "foo".'
		]
	])('rejects %j: %s', (text, message) => {
		expect(parseAbiJson(text)).toEqual({ ok: false, error: message });
	});
});

describe('parseAbiOrSignature', () => {
	it('reads a signature as one function', () => {
		const result = parseAbiOrSignature('  transfer(address,uint256)\n');
		expect(result.ok && result.value.map(functionSignature)).toEqual(['transfer(address,uint256)']);
	});

	it('reads text starting with [ or { as a JSON ABI', () => {
		const abi = '[{"name":"f","inputs":[{"type":"bool"}]}]';
		for (const text of [abi, ` ${abi}`, `{"abi":${abi}}`]) {
			const result = parseAbiOrSignature(text);
			expect(result.ok && result.value.map(functionSignature)).toEqual(['f(bool)']);
		}
	});

	it('gives the JSON or signature error for its form', () => {
		expect(parseAbiOrSignature('[{')).toEqual({ ok: false, error: 'The ABI is not valid JSON.' });
		expect(parseAbiOrSignature('f(uint7)')).toEqual({ ok: false, error: 'Unknown type "uint7".' });
	});
});
