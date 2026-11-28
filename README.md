# QAnchor

QA toolkit for blockchain and crypto testing: valid and invalid test addresses, amount edge cases, unit conversion, transaction lookup, calldata decoding, a testnet wallet tracker with faucet links and balances, Indonesian dummy data, and QA checklists for crypto and stock flows. Runs entirely in the browser; there is no backend and nothing leaves the browser except requests you trigger to chain endpoints.

Live: https://qanchor.pages.dev

Status: Phase 1 (blockchain toolkit and dummy data) is complete: all eight tools are live. Phase 2 is under way: test cases, test runs with screenshots, and bug reports are live (slices 2a and 2b).

## Tools

Shipped:

| Tool | Route | What it does |
| --- | --- | --- |
| Address generator and validator | `/address` | Valid, invalid, and risky test addresses for EVM, Bitcoin (P2PKH, P2SH, P2WPKH, P2TR; mainnet and testnet), Solana, and Tron, generated in a Web Worker from the browser's CSPRNG. Paste an address to get its chain, type, network, and the exact defect. No private key is ever shown or stored. |
| Amount edge cases | `/amounts` | Edge-case amounts from token decimals, balance, fee, and limits: dust, too many decimals, comma vs dot, scientific notation, fee greater than balance, above max. Exact BigInt arithmetic up to 36 decimals. |
| Unit converter | `/units` | Exact conversion between wei/gwei/ether, sats/BTC, lamports/SOL, sun/TRX, and custom token decimals. |
| Tx lookup | `/tx` | Status, block or slot, sender, recipient, value (in the coin and its smallest unit), and fee of a transaction on Ethereum, BNB Smart Chain, Polygon, Arbitrum, Base, Solana, Tron, or Bitcoin, mainnet or testnet. Bitcoin shows inputs and outputs. The request goes from the browser straight to the network's endpoint (public by default, or your own from Settings); EVM endpoints are checked for the right chain ID first. Pending transactions are shown as pending, errors say what failed and offer Retry, and every hash links to the network's explorer. |
| Calldata decoder | `/calldata` | Function name, selector, and arguments of EVM calldata, decoded from a signature such as `transfer(address,uint256)`, a JSON ABI, or the built-in ERC-20, ERC-721, and ERC-1155 transfers and approvals. Handles arrays and nested tuples; integers are exact, addresses in EIP-55 form. Inconsistent data is a decoding error with no partial values, trailing bytes are a warning, and an unknown selector is shown as 32-byte words. Nothing is looked up online. "Decode input" in Tx lookup opens a transaction's input here. |
| Testnet wallets | `/wallets` | The testnet addresses you test with, each with a label, chain, network, and notes, kept in this browser's storage. Addresses are checked with the address validator; Bitcoin entries must be testnet addresses (EVM, Solana, and Tron addresses look the same on mainnet and testnet). Duplicates are flagged before saving, deleting asks first, and there is no field for a private key or seed phrase. Each entry lists faucet links for its network, built in or added by you; they only open the faucet in a new tab and never fill in or submit anything. Refresh reads an entry's native balance once, from the network's endpoint (or yours from Settings), and shows it with the fetch time; nothing is requested without that click, and a failed refresh keeps the previous value marked stale. |
| Dummy data | `/dummy-data` | Fake Indonesian test identities: names, NIK, NPWP, +62 phones, addresses with consistent region codes, and bank accounts. Up to 10,000 rows per run, generated in a Web Worker from a seed, so the same seed gives the same rows. Presets for KYC, underage, name edge cases, invalid formats (with the reason per row), and duplicate NIK. Export as CSV, JSON, or SQL `INSERT` (PostgreSQL or MySQL quoting). |
| Checklists | `/checklists` | Test checklists for deposit, withdraw, swap, staking, network mismatch, memo and tag (XRP, XLM, TON), and stocks: 173 one-sentence items under headings. Filter across all of them, open one on its own page, and copy it as a Markdown task list. Create test cases turns the items you pick into test cases (the item as title and expected result, tagged with the checklist and the section), warns about items that already exist, and links to them in Test cases. |
| Test cases | `/cases` | Reusable test cases kept in this browser: a title, preconditions, ordered steps (each with an optional expected result), a case-level expected result, tags, and a priority. Each gets the next key (`TC-1`, `TC-2`, …), never reused. Filter by text, tags, and priority; the filter is kept in the URL. Steps are reordered with Move up and Move down; Insert test data puts a generated address (valid, or an invalid sample with its reason), an amount edge case, or one dummy-data field at the cursor in a step; duplicating a case opens the copy in the editor; deleting one says how many runs keep their own copy; leaving with unsaved changes asks first. |
| Test runs | `/runs` | Runs of test cases against a release: pick cases (with the case filter; up to 500), and each run keeps its own copy of them. Mark each case Pass, Fail (with the actual result and failed step), or Blocked (with the reason), add notes and a linked issue key or URL, and move with Next and Previous or the keys P, F, B, J, K. Up to 5 screenshots per result: paste, drop, or choose an image; it is compressed in a Web Worker (long edge 1,920 px, WebP or JPEG) and stored with the result, opens in a viewer, and downloads as `TC-12-<run>-1.webp`. A failed result opens a bug report pre-filled from the case and the result (summary, priority, labels, environment, steps up to the failed one, expected and actual result), editable and copied as Markdown or Jira wiki markup with its attachments named; it is not stored. For Jira Cloud use Markdown: its editor does not read wiki markup, and it shows the backslash before an escaped character such as `\*`. The run list shows progress; completing a run makes it read-only until reopened, and its summary can be copied as Markdown. |
| Sessions | `/sessions` | Timeboxed exploratory sessions: start one with a charter, a timebox (30, 60, or 90 minutes, or 5 to 480), and an optional release and environment. The list shows each session's status, time, and findings by type; deleting one deletes its findings and their screenshots. The session page shows the clock in whole minutes ("23 min elapsed · 37 min left"), counted from the start time so a reload or a sleeping laptop loses nothing, updated once a minute and only while the page is visible; Pause, Resume, and End session (an ended session keeps its total time and cannot restart). Findings (Bug, Question, Idea, Note) are added with Ctrl/Cmd+Enter at their session time ("at 12 min"), with up to 5 screenshots each, and can be filtered by type, edited, and deleted. A Bug finding opens a bug report (its text as the actual result, its screenshots as attachments), and Copy session copies the session as Markdown with its findings grouped by type. |
| Releases | `/releases` | Runs and sessions rolled up per release; releases that differ only in letter case or spaces are one. Each release shows the pass rate over executed cases (Untested left out, with the numbers it comes from), counted from the latest result per case so a retest that passed is not an open failure; failed and blocked cases first with their actual result or reason and linked issue; each run with its results; and each session with its findings. Copy summary copies it all as Markdown. |

Address and amount results can be copied or exported as CSV or JSON; dummy data also as SQL; converted values can be copied; a checklist, a run summary, a session, and a release summary can be copied as Markdown. Settings and data stay in the browser (IndexedDB) and can be exported and imported as JSON, screenshots included (the size is shown before the download). Settings shows how much storage is used and can ask the browser to keep the data persistent; the browser decides (Firefox asks you, Chrome, Edge, and Safari decide on their own), and Safari may delete data of a site you have not visited for 7 days. In Settings, each network's endpoint URL can be replaced with your own (https, or http://localhost for a local node) and reset to the default.

Interactive elements have accessible names, and dynamic output also carries a stable `data-testid` (`<tool>-<element>`, for example `dummy-preview-row`), so you can write your own Playwright tests against the live site.

## Roadmap

* Phase 2: test cases, test runs, screenshots, bug reports, and persistent storage are live (slices 2a and 2b). Next: exploratory session notes, a release summary, and links from the Phase 1 tools (2c).
* Phase 3: generate test cases from a PRD (PDF, DOCX, Markdown) with ambiguity questions and a traceability matrix, using your own Claude API key.
* Phase 4: demo mode with a sample crypto PRD, usable without an API key.
* Later, not planned: an optional backend for team sharing, sync across devices, and an RPC proxy.

## Development

Requirements: Node 22.17 or newer (`.nvmrc` pins 26) and npm.

```sh
npm install
npm run dev       # development server
npm run build     # static site in build/
npm run preview   # serve the built site
npm run check     # svelte-check type checking
npm run lint      # Prettier check + ESLint
npm run format    # Prettier write
npm test          # unit tests (Vitest), including a check that every requirement has a test
npm run test:e2e  # E2E tests (Playwright) against the production build
```

Before the first E2E run, install the browsers once: `npx playwright install chromium firefox webkit`.

The shared UI components are shown in every state at `/components` (not linked from the navigation); open it on the preview server to review them.

Known issue: on macOS, WebKit's Tab key skips buttons and links (the system's keyboard navigation setting), so about 19 keyboard-only tests fail locally in WebKit; they pass in CI on Linux.

## Deployment

Cloudflare Pages Git integration, project `qanchor`: every push to `main` deploys to production, and every pull request gets a preview deployment. Cloudflare does not wait for GitHub Actions, so merge only when CI is green. Build settings: framework preset none, build command `npm run build`, output directory `build`, Node version from `.nvmrc`. Response headers come from `static/_headers`; the footer shows the deployed commit.

## Documentation

* [Product requirements](docs/prd.md)
* [Design brief](docs/design.md)
* [Architecture](docs/architecture.md)
* [Implementation plan](docs/plan.md)
* [Decision log](docs/decisions.md)
