# QAnchor: Product Requirements Document

* Status: APPROVED (owner, 2026-11-12)
* Version: 0.3
* Date: 2026-11-12
* Sources: `CLAUDE.md` (project context), `docs/decisions.md` (agreed features, kickoff decisions, PRD reviews 1 and 2)

Conventions used in this document:

* Every requirement in this document is approved. Items that were proposals or assumptions in earlier drafts were approved as a block in review 2.
* **[VERIFY]**: a factual detail that must be confirmed against a primary source before the related code ships. All are listed in [section 9.3](#93-to-verify-before-implementation). Approval of this PRD does not make these facts true.
* **OQ-nn**: a reference to an entry in [Open questions](#9-open-questions).
* Requirement IDs: `US-` user story, `FR-` functional requirement, `NFR-` non-functional requirement, `EC-` edge case. IDs are stable from this version on; retired IDs are not reused (FR-013 is retired).

---

## 1. Overview

QAnchor is a browser-only web app that makes manual QA work easier, with a focus on blockchain/crypto testing. It is a personal tool and an interview portfolio piece.

It is not another TestRail/Qase clone. The differentiator is (a) a blockchain toolkit that produces the awkward test data crypto features need (valid and deliberately invalid addresses, amount edge cases, unit conversions, tx and calldata inspection), and (b) later, a test case generator that understands the crypto domain.

The app has no backend and no login. All data stays in the browser (IndexedDB) and can be exported/imported as JSON. It never displays or stores private keys or mnemonics.

The MVP is built in four phases:

1. Blockchain toolkit + dummy data (this PRD, full detail)
2. Test cases, test runs, bug reports (outline)
3. PRD generator (outline)
4. Demo mode (outline)

The app is deployed to Cloudflare Pages at the end of slice 1a and redeployed on every merge to `main` from then on, so a live link exists early (NFR-021).

## 2. Goals and non-goals

### Goals

* G-1: Produce correct crypto test data (addresses, amounts, units) faster than assembling it by hand from explorers, wallets, and ad hoc scripts.
* G-2: Make negative testing easy: every invalid sample states *why* it is invalid, so it can be pasted straight into a test case or bug report.
* G-3: Generate realistic Indonesian dummy data (names, +62 phones, addresses, NIK, NPWP, bank accounts) reproducibly from a seed.
* G-4: Stay lightweight: meet the performance budget in `CLAUDE.md` (see NFR-001 to NFR-006).
* G-5: Serve as a portfolio piece: clean code, real tests, CI, a documented product process, and a live link from slice 1a onward.

### Non-goals

* Replacing a full test management system (TestRail, Qase, Testmo).
* Multi-user collaboration, accounts, sync, or any backend.
* Handling real funds or storing secrets. QAnchor never displays or stores private keys or mnemonics.
* Signing or broadcasting transactions. Phase 1 is read-only toward every chain.
* Faucet automation (links only).
* Mobile-first layout. Desktop-first; small screens must not break but are not optimized.

## 3. Target user

* Primary: the owner, a manual QA engineer who tests crypto/fintech products (deposit, withdraw, swap, staking, stock features) and needs test data and checklists daily. Single user.
* Secondary (from the first deploy at the end of slice 1a): interviewers or peers who open the live link for a few minutes. They have no API key and no context, so the app must be understandable without setup.

The primary user is comfortable with crypto terms (EIP-55, bech32, decimals, calldata), so the UI explains *why a sample is invalid* but does not teach blockchain basics.

## 4. Feature list per phase

### Phase 1: Blockchain toolkit + dummy data (detailed in section 5)

| Area | Feature | Requirements |
| --- | --- | --- |
| App shell | Navigation, theme, local persistence, JSON export/import, output actions | FR-001 to FR-004 |
| Address generator | Valid and invalid addresses per chain, address validator | FR-010 to FR-012, FR-014 |
| Amount edge cases | Edge-case amounts from token parameters | FR-020 to FR-022 |
| Unit converter | Exact conversion between chain units | FR-030 to FR-032 |
| Tx lookup | Look up a tx hash over public RPC | FR-040 to FR-043 |
| Calldata decoder | Decode EVM calldata | FR-050 to FR-053 |
| Checklists | Domain checklists/templates | FR-060 to FR-061 |
| Testnet wallet tracker | Track testnet addresses + faucet links | FR-070 to FR-073 |
| Dummy data | Indonesian dummy data with seed, presets, export | FR-080 to FR-084 |

Phase 1 is delivered in three slices, each ending in a working, tested state:

* 1a: app shell, unit converter, amount edge cases, address generator and validator. Ends with the first production deploy to Cloudflare Pages; every later merge to `main` deploys automatically.
* 1b: dummy data, checklists
* 1c: tx lookup, calldata decoder, testnet wallet tracker (everything that needs the network)

### Phase 2: Test cases, test runs, bug reports (outline)

* Test case CRUD (title, preconditions, steps, expected result, tags, priority).
* Test runs: select cases, mark pass/fail/blocked, paste screenshots (compressed before storage), notes.
* Bug report generator in Jira format from a failed step (pre-filled steps, expected vs actual, environment, attachments).
* Exploratory session notes (timeboxed session, charter, findings).
* Release summary (run results rolled up per release).
* Phase 1 hooks: checklists convertible to test cases or test runs; generated data insertable into steps.
* Routing note: pages for user-created records (one test case, one run) have IDs unknown at build time and cannot be prerendered. They need the client-rendered fallback page (NFR-022) or IDs carried in the query string. To be settled in the tech plan for this phase.
* Requirement IDs to be assigned when this phase is detailed.

### Phase 3: PRD generator (outline)

* Input: upload PDF/DOCX/MD or paste text (pdfjs-dist + mammoth, lazy-loaded on this page only).
* Output chain: numbered editable requirements -> ambiguity detection as a PM question list -> test cases (positive, negative, boundary, auto-injected blockchain edge cases) -> source quote per test case -> traceability matrix -> test run -> bug report.
* Claude API, BYOK, client-side, behind a generic provider interface. The UI must warn that the key is stored in the browser. This is the first and only secret the app stores; the "never stores private keys or mnemonics" statement stays true, but the wording of NFR-012 must be revisited then.
* Requirement IDs to be assigned when this phase is detailed.

### Phase 4: Demo mode (outline)

* Demo mode: a sample crypto PRD (e.g. "Withdraw USDT multi-network") with pre-generated results, usable without an API key.
* Deployment already exists from slice 1a; this phase adds no deploy work.
* MVP is done when phases 1 to 4 are done and deployed.

## 5. Requirements (Phase 1)

### 5.1 User stories

| ID | Story |
| --- | --- |
| US-001 | As a QA engineer, I want valid addresses for a given chain and address type so that I can run positive tests on address fields without opening a wallet. |
| US-002 | As a QA engineer, I want deliberately invalid addresses, each with the reason it is invalid, so that I can run negative tests and write precise bug reports. |
| US-003 | As a QA engineer, I want a list of edge-case amounts for a token's decimals, balance, fee, and limits so that I do not forget boundary cases. |
| US-004 | As a QA engineer, I want exact unit conversion (wei/gwei/ether, sats/BTC, lamports/SOL) so that I can verify amounts shown by the app under test. |
| US-005 | As a QA engineer, I want to look up a tx hash on the right chain so that I can confirm status, amount, and fee without switching between explorers. |
| US-006 | As a QA engineer, I want to decode EVM calldata so that I can verify that the app under test sent the intended function and arguments. |
| US-007 | As a QA engineer, I want ready-made checklists for crypto flows so that I can cover domain-specific risks consistently. |
| US-008 | As a QA engineer, I want one place to keep my testnet addresses and faucet links so that I can find a funded test address quickly. |
| US-009 | As a QA engineer, I want realistic Indonesian dummy data that I can regenerate from a seed and export so that I can fill KYC and payment forms and seed databases. |
| US-010 | As a QA engineer, I want my settings and saved items to persist locally and be exportable so that I do not lose them when I clear or switch browsers. |
| US-011 | As a user, I want light and dark themes that follow my system setting so that the tool is comfortable to use all day. |
| US-012 | As a QA engineer, I want to paste any address and learn which chain, type, and network it belongs to and whether it is valid, so that I can triage an address from a bug report or a log. |

### 5.2 Functional requirements

Acceptance criteria use Given/When/Then.

#### App shell

**FR-001: Navigation and routes** (US-010)

Each Phase 1 tool has its own route and is reachable from a persistent navigation. Every route is prerendered to static HTML at build time; tool code is loaded only when its route is opened.

* AC-1: Given the app is loaded, When I look at the navigation, Then I see one entry for each tool that has shipped, plus Settings. When Phase 1 is complete the entries are: Address generator, Amount edge cases, Unit converter, Tx lookup, Calldata decoder, Checklists, Testnet wallets, Dummy data. Tools not yet shipped are not listed; the roadmap lives in the README.
* AC-2: Given I am on any route, When I reload the browser or open its URL directly, Then the same route is shown, served as that route's own prerendered HTML.
* AC-3: Given I open an unknown URL, When the app loads, Then I see a not-found state with a link back to the default route.
* AC-4: Given I use only the keyboard, When I press Tab from the top of the page, Then I can reach every navigation entry and activate it with Enter, with a visible focus indicator.
* AC-5: Given a fresh load of the default route, When I inspect network requests, Then no crypto library chunk and no dataset chunk has been requested.
* AC-6: Given the built output, When I inspect a tool route's HTML file before any script runs, Then it already contains the page heading, navigation, and the tool's static form and text.
* AC-7: Given the default route, When it loads, Then it shows a toolkit index listing the shipped tools with a one-line description each (no dashboard).

**FR-002: Theme** (US-011)

* AC-1: Given no stored preference and the OS is in dark mode, When the app loads, Then the dark theme is applied before first paint (no light flash), including on prerendered pages.
* AC-2: Given the theme control offers System / Light / Dark, When I choose Light, Then the light theme applies immediately and persists across reloads.
* AC-3: Given the preference is System, When the OS theme changes while the app is open, Then the app theme follows without a reload.

**FR-003: Local persistence and JSON export/import** (US-010)

User data (settings, RPC overrides, testnet wallet entries, and any saved state added later) is stored in IndexedDB. The user can export all of it to one JSON file and import it back. No secret is ever stored, so exports contain none.

* AC-1: Given I have saved data, When I choose Export, Then a JSON file downloads containing a schema version, an export timestamp, and all stored records.
* AC-2: Given a valid export file, When I import it, Then I am shown a summary (record counts per type) and must confirm before anything is written.
* AC-3: Given I confirm an import, When it completes, Then all existing data has been replaced by the file content ("replace all") and a success message shows the counts.
* AC-4: Given a file that is not valid JSON, has an unknown schema version, or fails validation, When I import it, Then nothing is written and an error names the reason.
* AC-5: Given a prerendered page that shows stored data, When it loads, Then a loading state is shown until IndexedDB has been read, and the empty state appears only if there is really no data.

**FR-004: Output actions** (US-001 to US-009)

Every tool that produces output offers the same actions with the same behavior.

* AC-1: Given a single output value, When I activate its Copy control, Then the exact value is on the clipboard (no added whitespace) and a non-blocking confirmation is announced to assistive technology.
* AC-2: Given a multi-row output, When I choose Copy all or Download, Then I get all rows in the selected format, not only the visible ones.
* AC-3: Given the Clipboard API is unavailable or denied, When I activate Copy, Then an error message is shown and the value stays selectable for manual copy.

#### Address generator

Supported in Phase 1: EVM; Bitcoin legacy (P2PKH), script hash (P2SH), SegWit (P2WPKH), Taproot (P2TR); Solana; Tron. XRP, Stellar, and TON follow as a separate task after Phase 1.

**FR-010: Generate valid addresses** (US-001)

* AC-1: Given I select a chain, an address type (where the chain has several), a network (mainnet/testnet, where the encoding differs), and a count N, When I generate, Then exactly N addresses are shown.
* AC-2: Given any generated valid address, When it is checked by the app's own validator for that chain/type/network, Then it passes (EVM: 20 bytes with correct EIP-55 checksum; P2PKH and P2SH: Base58Check with the network's version byte for that type; P2WPKH: bech32 with witness v0 and a 20-byte program; P2TR: bech32m with witness v1 and a 32-byte program; Solana: Base58 of exactly 32 bytes; Tron: Base58Check with prefix byte 0x41, starting with `T`).
* AC-3: Given N is 0, negative, non-numeric, or above 500, When I try to generate, Then generation is blocked and a field error states the allowed range.
* AC-4: Given addresses are generated, When I generate again with the same inputs, Then a different set is produced. Addresses come from the browser CSPRNG; there is no seed option for addresses.
* AC-5: Given unit tests with published test vectors for each encoding, When they run, Then generated/encoded outputs match the vectors.
* AC-6: Given any generation, When it completes, Then no private key is displayed, exported, or stored. Each address is derived from a freshly generated key pair so that it is a real, well-formed address, and the key material is discarded as soon as the address is derived.

**FR-011: Generate invalid address variants** (US-002)

For a selected chain/type, the tool produces invalid variants. Each variant has a stable ID, a label, and a one-sentence reason.

Decided variants: wrong EIP-55 checksum; wrong length; testnet vs mainnet prefix; look-alike address from another chain.

Additional variants: invalid character for the encoding; corrupted Base58Check / bech32 checksum; bech32 vs bech32m mix-up (v1 program encoded as bech32); mixed-case bech32; missing `0x` prefix; leading/trailing whitespace; embedded zero-width character; empty string.

* AC-1: Given I select a chain/type and one or more variants, When I generate, Then each row shows the address, the variant label, and the reason it is invalid.
* AC-2: Given any generated invalid variant, When it is checked by the app's own validator for the *selected* chain/type/network, Then it fails. This is enforced by automated tests for every variant.
* AC-3: Given the "look-alike from another chain" variant, When it is generated, Then the address is valid on its source chain, the row names that source chain, and it fails the selected chain's validator (for example a Tron address offered for an EVM field).
* AC-4: Given a variant does not apply to the selected chain (for example EIP-55 checksum on Solana), When I view the variant list, Then that variant is not offered.
* AC-5: Given samples that are valid but risky rather than invalid (all-lowercase EVM address, zero address), When they are offered, Then they are in a separate "valid but risky" group and never labeled invalid. (EC-004)

**FR-012: Address output and export** (US-001, US-002)

* AC-1: Given generated rows, When I export as CSV or JSON, Then each record contains: address, chain, type, network, validity (valid / invalid / valid-but-risky), variant ID, and reason.
* AC-2: Given no generation has happened yet, When I open the tool, Then I see an empty state explaining what to select, and export controls are disabled.

**FR-013: retired.** Opt-in private key display was dropped in review 2 so that the app never shows a private key (see FR-010 AC-6 and NFR-012). The ID is not reused.

**FR-014: Address validator** (US-012)

Part of the address generator route. Uses the same validators that back FR-010 and FR-011. Runs fully in the browser.

* AC-1: Given I paste an address that is valid for exactly one supported chain/type/network, When it is checked, Then I see "valid" with that chain, type, and network.
* AC-2: Given an address whose format is valid for more than one chain or network (for example an EVM address, which is the same on every EVM network and on EVM mainnet and testnet), When it is checked, Then all matches are listed and the result states that the format alone cannot tell them apart.
* AC-3: Given an address that matches no supported format, When it is checked, Then I see "not valid for any supported chain", and where a specific defect can be determined (bad checksum, wrong length, invalid character, bech32/bech32m mix-up) that defect is named along with the chain it nearly matches.
* AC-4: Given input with leading/trailing whitespace or invisible characters, When it is checked, Then the result reports that defect explicitly instead of trimming it silently, and also shows the verdict for the trimmed value.
* AC-5: Given empty input, When the field is cleared, Then no verdict and no error are shown.
* AC-6: Given any validation, When network requests are inspected, Then none was made.

#### Amount edge cases

**FR-020: Token parameters** (US-003)

* AC-1: Given the tool is open, When I enter decimals (integer 0 to 36), and optionally balance, network fee, minimum, and maximum, Then the inputs are validated on change and invalid fields show an error stating the allowed format.
* AC-2: Given built-in presets, When I pick one, Then decimals are filled in: ETH 18, BTC 8, SOL 9, TRX 6, USDT on Ethereum 6, USDT on Tron 6, USDT on BNB Smart Chain 18. **[VERIFY]** each value against the token contract before release.
* AC-3: Given optional parameters are left empty, When I generate, Then cases that depend on them are omitted, and a note lists which cases were omitted and why.

**FR-021: Generate edge-case amounts** (US-003)

Decided categories: token decimals, dust, fee > balance, comma vs dot, scientific notation, above max.

* AC-1: Given decimals D, When I generate, Then the list includes at least: the smallest unit (`1 × 10^-D`), a value with exactly D decimal places, a value with D+1 decimal places (too precise), zero, a negative value, a comma-decimal value (`1,5`), a thousands-separated value (`1,000.50` and `1.000,50`), a scientific-notation value (`1e-7`), a value with leading zeros, and a value with surrounding whitespace.
* AC-2: Given balance B and fee F are set, When I generate, Then the list includes: exactly B, B minus F, B minus F plus one smallest unit, B plus one smallest unit, and a fee-greater-than-balance case.
* AC-3: Given minimum and maximum are set, When I generate, Then the list includes min, min minus one smallest unit, max, and max plus one smallest unit.
* AC-4: Given any generated case, When I read its row, Then it shows the literal input string, a category, and what the case is meant to probe. It does not assert what the app under test must do, since that depends on that app's spec.
* AC-5: Given balance, fee, min, or max with more than D decimal places, When I generate, Then generation is blocked with a field error.
* AC-6: Given values with up to 78 digits, When boundary values are computed, Then results are exact (integer arithmetic on base units, no floating point).

**FR-022: Amount output** (US-003)

* AC-1: Given generated cases, When I export as CSV or JSON, Then each record contains the input string, category, and purpose; the input string is preserved byte-for-byte (including whitespace and separators).

#### Unit converter

**FR-030: Exact unit conversion** (US-004)

Decided units: wei/gwei/ether, sats (and BTC), lamports (and SOL). Also sun/TRX.

* AC-1: Given I pick a unit family and type a value in any one unit field, When the value is valid, Then all other unit fields of that family update with the exact converted value.
* AC-2: Given `1` ether, When converted, Then gwei shows `1000000000` and wei shows `1000000000000000000`. Given `1` BTC, Then sats shows `100000000`. Given `1` SOL, Then lamports shows `1000000000`.
* AC-3: Given a value that is inexact in binary floating point, such as `0.1` ether, When converted, Then the result is exact (`100000000000000000` wei, no rounding artefacts).
* AC-4: Given a value up to 2^256 − 1 in the smallest unit, When converted to larger units, Then no precision is lost and no scientific notation is shown.

**FR-031: Converter input validation** (US-004)

* AC-1: Given a value with more decimal places than the unit allows (for example `0.5` wei), When entered, Then the other fields are not updated and an error states the unit's maximum decimal places.
* AC-2: Given empty input, When the field is cleared, Then all fields clear and no error is shown.
* AC-3: Given non-numeric text, a negative number, or scientific notation, When entered, Then an error is shown and no conversion happens.
* AC-4: Given a value containing `,` (for example `1,5` or `1,000`), When entered, Then it is rejected with a hint to use `.` as the decimal separator and no thousands separators. The tool never guesses which one a comma means.

**FR-032: Custom decimals** (US-004)

* AC-1: Given I choose "custom token" and enter decimals D (0 to 36), When I type a base-unit value, Then the display-unit value is shown exactly, and vice versa (for example D=6: `1500000` base units = `1.5`).

#### Tx lookup

Decided: direct calls to public endpoints, user-overridable URL, clear error states, explorer API keys optional (BYOK).

* Chains: Ethereum, BNB Smart Chain, Polygon, Arbitrum, Base, Solana, Tron, Bitcoin.
* Networks: mainnet plus one testnet for every chain.
* Protocol: JSON-RPC for every chain except Bitcoin. Bitcoin uses an Esplora-style REST API (for example mempool.space), because Bitcoin has no public JSON-RPC that browsers can call.
* Tron: Ethereum-compatible JSON-RPC or native HTTP API, to be chosen in the tech plan after verifying both from a browser.
* No default endpoint is listed until it has been verified to allow cross-origin browser requests.

**FR-040: Look up a transaction** (US-005)

* AC-1: Given I select a chain and network and paste a tx hash, When I submit, Then a loading state is shown, the submit control is disabled until the request settles, and exactly one lookup is in flight.
* AC-2: Given the tx exists and is confirmed, When the lookup succeeds, Then I see at least: status (success/failed), block number or slot, sender, recipient, native value in both smallest and display unit, and fee. EVM additionally shows nonce and input data; Bitcoin shows inputs and outputs instead of a single sender/recipient.
* AC-3: Given the tx is known but not yet confirmed, When the lookup returns, Then the status is "pending" and confirmed-only fields are shown as not available, not as zero.
* AC-4: Given a hash that does not match the selected chain's format (EVM/Tron/Bitcoin: 64 hex chars, EVM with `0x`; Solana: Base58 signature), When I submit, Then no network request is made and a field error explains the expected format.
* AC-5: Given I navigate away during a lookup, When the route unmounts, Then the request is aborted and no state update occurs afterward.
* AC-6: Given a lookup has completed, When the app is idle, Then no further requests are made (no polling, no auto-refresh).

**FR-041: Endpoint configuration** (US-005)

* AC-1: Given each supported network has a default public endpoint URL (RPC, or REST base URL for Bitcoin), When I open Settings, Then I can see the default and set an override per network.
* AC-2: Given I enter an override that is not a syntactically valid `https://` URL (or `http://localhost` for local nodes), When I save, Then it is rejected with a field error.
* AC-3: Given an override is saved, When I run a lookup on that network, Then the request goes to the override, and "Reset to default" restores the default.
* AC-4: Given an EVM override, When a lookup runs, Then the endpoint's `eth_chainId` is compared with the selected network and a mismatch is reported as a network-mismatch error instead of showing data from the wrong chain.

**FR-042: Lookup error states** (US-005)

* AC-1: Given the endpoint answers that the tx is unknown, When the lookup returns, Then I see "Transaction not found on <network>" with a hint to check the selected network.
* AC-2: Given the endpoint responds with HTTP 429 or a rate-limit error, When the lookup returns, Then I see a rate-limit message that suggests retrying later or setting a custom endpoint URL.
* AC-3: Given the request fails at the network level (offline, DNS, blocked by CORS), When it fails, Then I see a connection error naming the endpoint host. The message says the request could not be completed; it does not claim the tx does not exist.
* AC-4: Given no response within 10 seconds, When the timeout fires, Then the request is aborted and a timeout error is shown.
* AC-5: Given a response that is not valid for the protocol (JSON-RPC, or the expected REST shape for Bitcoin) or lacks expected fields, When parsed, Then an "unexpected response" error is shown and nothing is rendered as tx data.
* AC-6: Given any error state, When it is shown, Then a Retry control is available and focus moves to the error message.

**FR-043: Open in explorer** (US-005)

* AC-1: Given a syntactically valid hash and a selected network, When I activate "Open in explorer", Then the network's block explorer tx page opens in a new tab with `rel="noopener noreferrer"`.

#### Calldata decoder

Scope: EVM calldata only in Phase 1.

**FR-050: Decode with a user-supplied ABI or signature** (US-006)

* AC-1: Given calldata hex and a function signature such as `transfer(address,uint256)`, When I decode, Then I see the function name, the 4-byte selector, and each argument with its type and decoded value.
* AC-2: Given calldata hex and a JSON ABI, When I decode, Then the function whose selector matches is used and argument names from the ABI are shown.
* AC-3: Given argument types including `address`, `bool`, `uintN`/`intN`, `bytesN`, `bytes`, `string`, fixed and dynamic arrays, and tuples, When decoded, Then values match published ABI-encoding test vectors (unit tests).
* AC-4: Given a `uint256` argument, When shown, Then it is displayed as an exact decimal integer; given an `address` argument, Then it is shown in EIP-55 checksum form.

**FR-051: Built-in common selectors** (US-006)

A built-in table only. No online signature lookup in Phase 1.

* AC-1: Given calldata whose selector is in the built-in table (ERC-20 `transfer`, `approve`, `transferFrom`; ERC-721/1155 transfers and approvals), When I decode without supplying an ABI, Then the function is identified and arguments are decoded.
* AC-2: Given a selector that is not in the table and no ABI is supplied, When I decode, Then I see the raw selector and the remaining data split into 32-byte words, with a prompt to supply an ABI or signature. No external lookup service is called.

**FR-052: Decoder error states** (US-006)

* AC-1: Given input that is not valid hex or has an odd number of hex digits, When I decode, Then a field error explains the problem and nothing is decoded.
* AC-2: Given calldata shorter than 4 bytes (including `0x`), When I decode, Then I see "No function selector (plain transfer or empty data)".
* AC-3: Given a supplied ABI/signature whose selector does not match the calldata, When I decode, Then I see a selector-mismatch error showing both selectors.
* AC-4: Given calldata whose length or offsets are inconsistent with the argument types, When I decode, Then I see a decoding error and no partially decoded values are presented as valid.
* AC-5: Given an ABI that is not valid JSON or a signature that cannot be parsed, When I decode, Then a field error is shown on that input.

**FR-053: Hand-off from tx lookup** (US-005, US-006)

* AC-1: Given an EVM tx lookup result with non-empty input data, When I activate "Decode input", Then the calldata decoder opens with that input pre-filled.

#### Checklists

Decided topics: deposit, withdraw, swap, staking, network mismatch, memo/tag (XRP, XLM, TON), stocks (market hours, fractional, corporate actions). Checklists are read-only reference content in Phase 1 (browse, copy, export). Ticking items and saving progress arrives in Phase 2 by converting a checklist into a test run. Checklist content is drafted during implementation and reviewed by the owner before merge.

**FR-060: Browse checklists** (US-007)

* AC-1: Given the Checklists route, When it loads, Then I see one checklist for each decided topic, each with a title and item count.
* AC-2: Given I open a checklist, When it renders, Then items are grouped under headings and each item is one testable statement.
* AC-3: Given a filter field, When I type text, Then only checklists/items containing that text are shown, and an empty-result state appears if none match.

**FR-061: Export a checklist** (US-007)

* AC-1: Given an open checklist, When I choose Copy as Markdown, Then the clipboard contains the checklist as a Markdown task list (`- [ ] item`) with its headings.

#### Testnet wallet tracker

The tracker stores addresses and labels only. It never stores private keys or mnemonics.

**FR-070: Manage wallet entries** (US-008)

An entry has: label, chain, network, address, and optional notes.

* AC-1: Given the Testnet wallets route with no entries, When it loads, Then I see an empty state and an Add control.
* AC-2: Given I add an entry with label, chain, network, and address, When I save, Then it appears in the list and persists across reloads.
* AC-3: Given the address does not pass the validator for the selected chain, When I save, Then saving is blocked with a field error.
* AC-4: Given a Bitcoin address in a mainnet encoding, When I save, Then saving is blocked with a "testnet only" error. This check exists only for Bitcoin; EVM, Solana, and Tron addresses look the same on mainnet and testnet, so for those chains the network is whatever the user declares and the app cannot verify it.
* AC-5: Given an existing entry, When I edit or delete it, Then the change persists; delete requires confirmation.
* AC-6: Given two entries with the same chain, network, and address, When I save the second, Then I am warned about the duplicate and can cancel or keep it.

**FR-071: No secrets** (US-008)

* AC-1: Given the entry form, When I view it, Then it has no private key or mnemonic field, and the notes field carries a hint not to paste keys or mnemonics.
* AC-2: Given the storage schema and the export format, When inspected, Then they define no field for a private key or mnemonic.

**FR-072: Faucet links** (US-008)

* AC-1: Given an entry on a network with known faucets, When I view it, Then faucet links for that network are listed and open in a new tab with `rel="noopener noreferrer"`.
* AC-2: Given any faucet link, When I activate it, Then the app only navigates; it does not submit the address or automate any faucet step.
* AC-3: Given a network with no known faucet, When I view the entry, Then a "no faucet listed" note is shown instead of an empty area.

The built-in faucet list goes stale over time. The user can add their own faucet links per network.

**FR-073: On-demand balance** (US-008)

* AC-1: Given an entry on a network with a configured endpoint, When I activate Refresh balance, Then the native balance is fetched once and shown with the fetch time.
* AC-2: Given the route is open and idle, When time passes, Then no balance request is made without a user action.
* AC-3: Given the balance request fails, When the error returns, Then the same error states as FR-042 apply and the previous value, if any, is kept and marked stale.

#### Dummy data

Decided: Indonesian data (names, +62 phones, addresses, valid-format fake NIK/NPWP, dummy bank accounts), export CSV/JSON/SQL, seed, scenario presets, own generator + small datasets + seeded PRNG.

**FR-080: Configure and generate** (US-009)

* AC-1: Given the Dummy data route, When I select fields (full name, phone, address, NIK, NPWP, bank account), a row count N, and optionally a seed, and generate, Then a preview table shows the rows with one column per selected field.
* AC-2: Given N outside 1 to 10,000, non-numeric, or no field selected, When I try to generate, Then generation is blocked with a field error.
* AC-3: Given N = 10,000, When I generate, Then generation runs off the main thread, a progress or loading state is shown, the UI stays responsive, and no main-thread long task exceeds 200 ms.
* AC-4: Given a large result, When the preview renders, Then only a bounded number of rows is rendered (first 100) with a note of the total, while export covers all rows.

**FR-081: Field rules** (US-009)

* AC-1 (name): Given a generated row, Then the name is built from the bundled Indonesian name dataset and includes single-word names at a low rate, since they are common in Indonesia.
* AC-2 (phone): Given a generated phone, Then it starts with `+62`, followed by `8` and a known mobile operator prefix, with a national number length of 10 to 13 digits counting the leading `0` form. **[VERIFY]** the length rule and the operator prefix list. The output format is selectable: `+62…`, `08…`, or `62…`.
* AC-3 (address): Given a generated address, Then it contains street, RT/RW, kelurahan/desa, kecamatan, kabupaten/kota, province, and postal code, and the administrative levels are mutually consistent (the kota belongs to the province). The dataset covers every province and kabupaten/kota plus a sample of kecamatan/kelurahan per kota, and is lazy-loaded.
* AC-4 (NIK): Given a generated NIK, Then it is 16 digits: 6-digit region code, 6-digit birth date `DDMMYY` with 40 added to the day for female, and a 4-digit sequence from `0001`. The encoded date is a real calendar date.
* AC-5 (consistency): Given a row with NIK plus gender, birth date, or address, Then the values agree (NIK region matches the address region; NIK date and gender match the row).
* AC-6 (NPWP): Given a generated NPWP, Then it follows the format I selected: 15-digit legacy (`XX.XXX.XXX.X-XXX.XXX`) or 16-digit (for an individual, equal to the row's NIK). **[VERIFY]** The legacy check-digit rule is implemented only after a verifiable source is found; until then the legacy format is format-valid only and the UI says so.
* AC-7 (bank account): Given a generated bank account, Then it has a bank name, bank code, and an account number whose length matches that bank's rule in the dataset. No checksum is applied. **[VERIFY]** the account number length per bank.
* AC-8 (labeling): Given any generated output on screen, Then a visible note states the data is fake and for testing only.
* AC-9 (identifier realism): Given the "identifier realism" setting, When it is "realistic" (default), Then NIK region codes and phone prefixes come from assigned real-world values. When it is "non-colliding", Then NIK region codes and phone prefixes come from ranges that are not assigned, so the values cannot belong to a real person, and the UI warns that stricter validators may reject them.

**FR-082: Seeded determinism** (US-009)

* AC-1: Given the same seed, field selection, options, preset, and row count on the same app version, When I generate twice (including after a reload or in another supported browser), Then the outputs are identical byte-for-byte.
* AC-2: Given I leave the seed empty, When I generate, Then a random seed is created, displayed, and copyable, so the run can be reproduced.
* AC-3: Given two different seeds, When I generate with otherwise identical settings, Then the outputs differ.
* AC-4: Given a seed and N rows, When I generate N+10 rows with the same seed, Then the first N rows are identical to the earlier run.

A dataset or generator change can alter output for an existing seed. Exports record a generator version so a mismatch can be explained.

**FR-083: Export CSV / JSON / SQL** (US-009)

* AC-1 (CSV): Given generated rows, When I export CSV, Then the file is UTF-8, has a header row, and follows RFC 4180 quoting (fields containing comma, quote, or newline are quoted; quotes doubled).
* AC-2 (JSON): Given generated rows, When I export JSON, Then the file is an array of objects with one key per selected field, and NIK, NPWP, phone, and account numbers are strings (leading zeros preserved).
* AC-3 (SQL): Given generated rows and a table name, When I export SQL, Then the file contains generic `INSERT` statements with all values as string literals and single quotes escaped by doubling (a name such as `Ma'ruf` produces valid SQL), and identifiers are quoted in the style I chose: PostgreSQL (`"`) or MySQL (`` ` ``).
* AC-4: Given a table name that is empty or contains characters outside letters, digits, and underscore, When I export SQL, Then export is blocked with a field error.
* AC-5: Given no rows have been generated, When I view export controls, Then they are disabled.

**FR-084: Scenario presets** (US-009)

Presets in Phase 1:

* KYC happy path: adult, consistent NIK/address.
* Underage: below 17.
* Name edge cases: single-word, apostrophe, very long, with title.
* Invalid formats for negative tests: NIK with 15/17 digits, impossible date, unknown region code; phone with wrong prefix or length. Each row is labeled with why it is invalid.
* Duplicate NIK across rows: for testing unique-constraint validation.

Acceptance criteria:

* AC-1: Given a preset list, When I pick a preset, Then the field selection and options are set to that preset's definition, and I can still change them before generating.
* AC-2: Given a preset and a seed, When I generate, Then FR-082 determinism holds.
* AC-3: Given a preset that produces invalid data, When rows are generated, Then each invalid row carries a reason column, and the output is clearly marked as negative-test data.
* AC-4: Given the "duplicate NIK" preset and N >= 2, When I generate, Then at least one NIK appears in two or more rows whose other fields differ, and each affected row is marked with the row number it duplicates.
* AC-5: Given the "duplicate NIK" preset and N = 1, When I try to generate, Then generation is blocked with a field error stating that at least 2 rows are needed.

## 6. Non-functional requirements

Targets NFR-001 to NFR-006 come from the performance budget in `CLAUDE.md`. They are not yet measured and may be revised with real data.

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-001 | Initial JS for the default route <= 80 KB gzip. | Bundle-size check in CI fails the PR above the limit. |
| NFR-002 | Lighthouse Performance >= 95 (desktop) and LCP < 1.5 s. | Measured on the live Cloudflare Pages site after each production deploy, from slice 1a onward. Because this runs after merge, a regression is caught post-merge and fixed in a follow-up PR. |
| NFR-003 | Idle CPU ~0%: no polling, no timers or network activity while idle. | E2E: after load plus 10 s idle, zero network requests; manual performance profile per release. |
| NFR-004 | Idle JS heap <= 30 MB. | Measured manually on the live site in Chrome after load and forced GC, per release. |
| NFR-005 | No main-thread long task > 200 ms; heavy work (bulk generation, bulk key derivation) runs in Web Workers. | Performance trace during the 10,000-row and 500-address scenarios. |
| NFR-006 | No continuous animations; `prefers-reduced-motion` disables all non-essential motion. | E2E with reduced-motion emulation; code review. |
| NFR-007 | Works on the latest stable Chrome, Firefox, and Safari, desktop-first. | Playwright projects for Chromium, Firefox, WebKit. |
| NFR-008 | Keyboard-only usable: every action reachable and operable, visible focus, logical focus order, focus moved to errors/dialogs. | E2E keyboard paths per tool. |
| NFR-009 | WCAG 2.1 AA for contrast, labels, and status announcements in both themes. | Automated a11y scan in E2E plus manual check. |
| NFR-010 | Every view implements loading, empty, error, success, and disabled states where applicable. | E2E per tool; review checklist. |
| NFR-011 | Privacy: no backend, no analytics (including the hosting provider's), no third-party scripts, fonts, or trackers. The only outbound requests are user-initiated calls to the configured chain endpoints. | E2E asserting the request allowlist. |
| NFR-012 | The app never displays, exports, or persists a private key or mnemonic. Key material created while deriving an address is discarded immediately and never appears in the UI, storage, exports, URLs, logs, or network requests. | Storage schema review; E2E that generates addresses, then inspects the DOM, IndexedDB, localStorage, and all recorded requests. |
| NFR-013 | Key generation uses the Web Crypto CSPRNG. The seeded PRNG is used only for dummy data, never for keys. | Unit test and code review. |
| NFR-014 | Crypto correctness: every encoder/validator is tested against published test vectors (EIP-55, BIP-173, BIP-350, Base58Check, and ABI encoding). | Unit tests. |
| NFR-015 | Crypto libraries, datasets, and each tool's code are lazy-loaded per route, not in the initial bundle. | FR-001 AC-5; bundle analysis. |
| NFR-016 | All data is stored in IndexedDB with a schema version; schema changes ship with a migration, and export files carry the schema version. | Unit tests for migrations and import validation. |
| NFR-017 | A Content-Security-Policy restricts scripts to same-origin and limits `connect-src` as far as user-configurable endpoint URLs allow. | Header check on the deployed site, from slice 1a. |
| NFR-018 | Dependencies are limited to those in `CLAUDE.md`; any addition states its gzip size impact and is recorded in `docs/decisions.md`. | PR review. |
| NFR-019 | Listeners, timers, workers, and in-flight requests are cleaned up when a route unmounts. | Unit/E2E for abort on navigation (FR-040 AC-5); review. |
| NFR-020 | CI on every PR: lint, typecheck, unit, build, E2E, bundle size. | GitHub Actions. |
| NFR-021 | Continuous deployment through the Cloudflare Pages Git integration (project `qanchor`, default `*.pages.dev` URL, no custom domain). From the end of slice 1a, Cloudflare builds and deploys every push to `main`, and builds a publicly reachable preview for every PR. Cloudflare does not wait for GitHub Actions, and GitHub Free cannot enforce required status checks on a private repo, so "merge only when CI is green" is a manual rule: a PR merged while red would be deployed. | After a merge, the live site serves the new build, and the deployed commit is identifiable in a footer or meta tag. |
| NFR-022 | Every Phase 1 route is prerendered to static HTML at build time. Code that needs browser-only APIs (IndexedDB, Web Crypto, clipboard) runs only in the browser, so the build does not fail and no prerendered page shows an error. Unknown URLs are served a client-rendered fallback page that shows the not-found state. | Build output contains one HTML file per route; FR-001 AC-2, AC-3, AC-6. **[VERIFY]** fallback behavior on Cloudflare Pages in the tech plan. |

## 7. Edge cases

| ID | Edge case | Expected handling |
| --- | --- | --- |
| EC-001 | IndexedDB is unavailable or blocked (private browsing, disabled storage). | Tools that need no storage still work; a banner explains that nothing will be saved; no crash. |
| EC-002 | Storage quota exceeded on write. | The write fails with a clear error; existing data is not corrupted. |
| EC-003 | The app is open in two tabs and both write. | Last write wins per record; no corruption; a schema upgrade in one tab prompts the other to reload. |
| EC-004 | An all-lowercase or all-uppercase EVM address is valid (EIP-55 checksum is optional in that form). | Classified as "valid but risky", never as invalid (FR-011 AC-5). |
| EC-005 | EVM, Tron, and Bitcoin tx hashes share the same 64-hex shape. | The chain cannot be auto-detected; the user must select it; "not found" hints at a wrong-network selection (FR-042 AC-1). |
| EC-006 | A Solana address that is off-curve (program-derived address) is a valid address but cannot be a wallet. | Offered as a "valid but risky" sample with that explanation. |
| EC-007 | Taproot address encoded with bech32 instead of bech32m, or a v0 address with bech32m. | Offered as an invalid variant (FR-011); validator rejects it and names the mix-up (FR-014 AC-3). |
| EC-008 | A public endpoint blocks browser requests via CORS. | Reported as a connection error (FR-042 AC-3) with a hint to set a custom endpoint; never reported as "tx not found". |
| EC-009 | A custom RPC URL points to a different chain than the selected network. | Network-mismatch error (FR-041 AC-4). |
| EC-010 | A tx exists but is pending, dropped, or replaced. | Pending is shown as pending (FR-040 AC-3); a dropped tx shows as not found. |
| EC-011 | A failed (reverted) EVM tx. | Status "failed"; fee still shown; value shown as attempted value. |
| EC-012 | Token with 0 decimals, or more than 18 decimals. | Converter and amount tool handle D=0 (no fractional cases generated) and D up to 36 exactly. |
| EC-013 | Very large numbers (up to 78 digits), leading zeros, `+` sign, whitespace in numeric inputs. | Exact handling via integer arithmetic; whitespace trimmed in converter inputs; `+` sign rejected. |
| EC-014 | Calldata with only a selector, with trailing extra bytes, or with out-of-range dynamic offsets. | Selector-only decodes for zero-argument functions; extra bytes are flagged as a warning; bad offsets produce a decoding error (FR-052 AC-4). |
| EC-015 | Calldata addressed to a proxy or an unknown contract. | Decoder works from calldata + ABI only and does not fetch contract ABIs; unknown selectors follow FR-051 AC-2. |
| EC-016 | NIK birth date boundaries: 29 February, female day offset (41 to 71), two-digit year ambiguity. | Only real calendar dates are generated; the century is determined by the generated birth date, which is available as a separate field. |
| EC-017 | Names with apostrophes, single-word names, very long names; addresses containing commas or newlines. | CSV quoting and SQL escaping keep exports valid (FR-083). |
| EC-018 | Long digit strings (NIK, account numbers) opened in spreadsheet software are shown in scientific notation or lose leading zeros. | Export stays correct (plain text in CSV). Documented as a known spreadsheet limitation; a "spreadsheet-safe" CSV mode is not in Phase 1. |
| EC-019 | Row count or address count at the boundaries: 0, 1, max, max+1. | 1 and max succeed; 0 and max+1 are blocked with a field error. |
| EC-020 | Import file from a newer schema version, or a truncated/hand-edited file. | Rejected with a specific reason; nothing is written (FR-003 AC-4). |
| EC-021 | A user pastes a private key or mnemonic into a free-text field (wallet label or notes). | The app has no secret field and cannot reliably detect this. Mitigation is the hint on the notes field (FR-071 AC-1). Stated plainly: free text is stored and exported as typed. |
| EC-022 | A generated NIK or phone number coincides with a real person's. | Possible in "realistic" mode; avoided in "non-colliding" mode (FR-081 AC-9). Output is always labeled fake/test-only (FR-081 AC-8). |
| EC-023 | The clipboard API is denied or the page is not focused. | FR-004 AC-3. |
| EC-024 | The user double-submits a lookup or generation. | Controls are disabled while work is in flight; only one job runs. |
| EC-025 | A user saves a mainnet EVM, Solana, or Tron address in the testnet wallet tracker. | Cannot be detected: these encodings are identical on mainnet and testnet (FR-070 AC-4). Harmless, since only a public address and label are stored. |
| EC-026 | A prerendered page that reads stored data is opened. | The static HTML shows a loading state, not an empty state, until IndexedDB has been read (FR-003 AC-5). |

## 8. Out of scope

For the MVP as a whole (from `docs/decisions.md` and `CLAUDE.md`):

* APK + emulator + automation from Firebase App Distribution (separate project).
* Backend, login, multi-user, cloud sync.
* Faucet automation.

For Phase 1 specifically:

* Test cases, test runs, bug reports, session notes, release summary (Phase 2).
* PRD upload/parsing and any AI feature (Phase 3).
* Demo mode (Phase 4).
* Storing private keys or mnemonics in any form, encrypted or not.
* Displaying or exporting the private keys of generated addresses.
* Mnemonic-based (BIP-39/BIP-44) address derivation.
* Seeded (reproducible) address generation.
* Address generation for XRP, Stellar, TON, Litecoin, Dogecoin (XRP/XLM/TON planned as a separate task after Phase 1).
* Signing or broadcasting transactions; connecting browser wallets.
* Fetching contract ABIs or 4-byte signatures from external services.
* Non-EVM calldata/instruction decoding.
* Interactive checklists (ticking items, saved progress).
* JSON import in merge mode.
* Offline/PWA support via service worker.
* UI localization; the UI is in English.
* History of generated outputs. Generators are stateless; only settings and wallet entries persist.

## 9. Open questions

### 9.1 Resolved in review 1

Decided by the owner on 2026-11-12. Details and reasons are in `docs/decisions.md`.

| ID | Decision |
| --- | --- |
| OQ-01 | Address chains in Phase 1: EVM, Bitcoin (P2PKH, P2SH, P2WPKH, P2TR), Solana, Tron. XRP/XLM/TON later as a separate task. |
| OQ-02 | "Identifier realism" setting: realistic (default) or non-colliding (FR-081 AC-9). |
| OQ-03 | Superseded in review 2 (OQ-28): private keys are never shown. Mnemonic derivation deferred. |
| OQ-04 | No seed for addresses; CSPRNG only. |
| OQ-05 | Presets: the draft's starting set plus "duplicate NIK across rows" (FR-084). |
| OQ-06 | Tx lookup chains: Ethereum, BNB Smart Chain, Polygon, Arbitrum, Base, Solana, Tron, Bitcoin. Default endpoints verified for CORS before listing. |
| OQ-07 | Bitcoin tx lookup uses an Esplora-style REST API; every other chain uses JSON-RPC. |
| OQ-08 | Tron protocol chosen in the tech plan after verification. |
| OQ-09 | Built-in selector table only; no online lookup. |
| OQ-10 | Calldata decoder is EVM-only. |
| OQ-11 | Checklists are read-only + export in Phase 1. |
| OQ-12 | No secrets stored at all. Wallet tracker keeps address + label (+ notes). |
| OQ-14 | NPWP: both 15-digit legacy and 16-digit formats, selectable. Legacy check digit needs a verified source (FR-081 AC-6). |
| OQ-15 | Address dataset: all provinces and kabupaten/kota + a sample of kecamatan/kelurahan. |
| OQ-16 | SQL export: generic `INSERT` with PostgreSQL or MySQL identifier quoting. |
| OQ-17 | JSON import replaces all data. No merge. |
| OQ-18 | Unit converter rejects `,` with a hint. |
| OQ-19 | Lighthouse, LCP, and heap are measured on the live site (NFR-002, NFR-004). |
| OQ-20 | No offline/service worker in Phase 1. |
| OQ-21 | UI language: English. |
| OQ-22 | Address validator included (FR-014). |
| OQ-23 | Default route is a toolkit index. |
| OQ-24 | Phase 1 sliced into 1a/1b/1c, with the first deploy at the end of 1a. |
| OQ-25 | Limits: 500 addresses, 10,000 rows, 10 s timeout, decimals 0 to 36. |

Also decided in review 1: deploy from the end of slice 1a with auto-deploy on merge to `main` (NFR-021); prerender every route instead of a pure SPA fallback (NFR-022).

### 9.2 Resolved in review 2

Decided by the owner on 2026-11-12. Details and reasons are in `docs/decisions.md`.

| ID | Decision |
| --- | --- |
| OQ-13 | On-demand balance (FR-073) is included in slice 1c. Confirmed under OQ-29. |
| OQ-26 | Deploy through the Cloudflare Pages Git integration. "Merge only when CI is green" is a manual rule, because GitHub Free cannot enforce required status checks on a private repo (NFR-021). |
| OQ-27 | Cloudflare Pages project name `qanchor`; no custom domain; public PR preview deployments are acceptable. |
| OQ-28 | FR-013 dropped and retired. The app never displays a private key (FR-010 AC-6, NFR-012). |
| OQ-29 | Confirmed: FR-073 is in Phase 1; Solana, Tron, and Bitcoin get mainnet plus one testnet, like the EVM chains. |
| OQ-30 | The live site lists shipped tools only; the roadmap lives in the README. |
| OQ-31 | All remaining proposals and assumptions approved as a block. |

### 9.3 To verify before implementation

No product question is open. The items below are facts, not decisions; each must be checked against a primary source, and a failed check is reported to the owner before the related code is written.

* Token decimals in the amount presets (FR-020 AC-2). Verified 2026-11-14 (T-014); sources in `docs/decisions.md`.
* +62 mobile number length rule and operator prefix list (FR-081 AC-2). Checked 2026-11-16 (T-025): pattern and maximum length verified; minimum length and per-operator prefixes have secondary sources only, used with a label (`docs/decisions.md`).
* Legacy 15-digit NPWP check-digit rule (FR-081 AC-6). Checked 2026-11-16 (T-025): no primary source; the legacy format stays format-valid only, as this AC already allows.
* Account number length per bank (FR-081 AC-7). Checked 2026-11-16 (T-025): secondary sources only, used with a label.
* Unassigned NIK region codes and phone prefixes usable for "non-colliding" mode (FR-081 AC-9). Checked 2026-11-16 (T-025): phone blocks `0801` to `0803` and `0805` are not allocated (Permenkominfo 14/2018); NIK codes come from the Kepmendagri 2025 lampiran in T-027.
* Default public endpoints per network allow cross-origin browser requests (tx lookup, FR-041).
* Tron protocol choice: Ethereum-compatible JSON-RPC or native HTTP API (tx lookup).
* Cloudflare Pages fallback behavior for unknown URLs with prerendered output (NFR-022).
* Availability of the `qanchor` project name on Cloudflare Pages, which sets the `*.pages.dev` URL (NFR-021).
