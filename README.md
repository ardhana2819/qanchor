# QAnchor

QA toolkit for blockchain and crypto testing: valid and invalid test addresses, amount edge cases, unit conversion, transaction lookup, calldata decoding, Indonesian dummy data, and QA checklists for crypto and stock flows. Runs entirely in the browser; there is no backend and nothing leaves the browser except requests you trigger to chain endpoints.

Live: https://qanchor.pages.dev

Status: in development (Phase 1, slice 1a done).

## Tools

Shipped:

| Tool | Route | What it does |
| --- | --- | --- |
| Address generator and validator | `/address` | Valid, invalid, and risky test addresses for EVM, Bitcoin (P2PKH, P2SH, P2WPKH, P2TR; mainnet and testnet), Solana, and Tron, generated in a Web Worker from the browser's CSPRNG. Paste an address to get its chain, type, network, and the exact defect. No private key is ever shown or stored. |
| Amount edge cases | `/amounts` | Edge-case amounts from token decimals, balance, fee, and limits: dust, too many decimals, comma vs dot, scientific notation, fee greater than balance, above max. Exact BigInt arithmetic up to 36 decimals. |
| Unit converter | `/units` | Exact conversion between wei/gwei/ether, sats/BTC, lamports/SOL, sun/TRX, and custom token decimals. |
| Tx lookup | `/tx` | Status, block or slot, sender, recipient, value (in the coin and its smallest unit), and fee of a transaction on Ethereum, BNB Smart Chain, Polygon, Arbitrum, Base, Solana, Tron, or Bitcoin, mainnet or testnet. Bitcoin shows inputs and outputs. The request goes from the browser straight to the network's endpoint (public by default, or your own from Settings); EVM endpoints are checked for the right chain ID first. Pending transactions are shown as pending, errors say what failed and offer Retry, and every hash links to the network's explorer. |
| Calldata decoder | `/calldata` | Function name, selector, and arguments of EVM calldata, decoded from a signature such as `transfer(address,uint256)`, a JSON ABI, or the built-in ERC-20, ERC-721, and ERC-1155 transfers and approvals. Handles arrays and nested tuples; integers are exact, addresses in EIP-55 form. Inconsistent data is a decoding error with no partial values, trailing bytes are a warning, and an unknown selector is shown as 32-byte words. Nothing is looked up online. "Decode input" in Tx lookup opens a transaction's input here. |
| Testnet wallets | `/wallets` | The testnet addresses you test with, each with a label, chain, network, and notes, kept in this browser's storage. Addresses are checked with the address validator; Bitcoin entries must be testnet addresses (EVM, Solana, and Tron addresses look the same on mainnet and testnet). Duplicates are flagged before saving, deleting asks first, and there is no field for a private key or seed phrase. |
| Dummy data | `/dummy-data` | Fake Indonesian test identities: names, NIK, NPWP, +62 phones, addresses with consistent region codes, and bank accounts. Up to 10,000 rows per run, generated in a Web Worker from a seed, so the same seed gives the same rows. Presets for KYC, underage, name edge cases, invalid formats (with the reason per row), and duplicate NIK. Export as CSV, JSON, or SQL `INSERT` (PostgreSQL or MySQL quoting). |
| Checklists | `/checklists` | Test checklists for deposit, withdraw, swap, staking, network mismatch, memo and tag (XRP, XLM, TON), and stocks: 173 one-sentence items under headings. Filter across all of them, open one on its own page, and copy it as a Markdown task list. |

Address and amount results can be copied or exported as CSV or JSON; dummy data also as SQL; converted values can be copied; a checklist can be copied as Markdown. Settings and data stay in the browser (IndexedDB) and can be exported and imported as JSON. In Settings, each network's endpoint URL can be replaced with your own (https, or http://localhost for a local node) and reset to the default.

Interactive elements have accessible names, and dynamic output also carries a stable `data-testid` (`<tool>-<element>`, for example `dummy-preview-row`), so you can write your own Playwright tests against the live site.

## Roadmap

* Phase 1, slice 1c (rest): faucet links and on-demand balances in the testnet wallet tracker.
* Phase 2: test cases, test runs with screenshots, Jira-format bug reports, exploratory session notes, release summary.
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
npm test          # unit tests (Vitest)
npm run test:e2e  # E2E tests (Playwright) against the production build
```

Before the first E2E run, install the browsers once: `npx playwright install chromium firefox webkit`.

The shared UI components are shown in every state at `/components` (not linked from the navigation); open it on the preview server to review them.

Known issue: Playwright 1.65's WebKit crashes on launch on macOS 26.0.1 (inside AppKit, before any page loads). Run `npx playwright test --project=chromium --project=firefox` locally; WebKit runs in CI on Linux.

## Deployment

Cloudflare Pages Git integration, project `qanchor`: every push to `main` deploys to production, and every pull request gets a preview deployment. Cloudflare does not wait for GitHub Actions, so merge only when CI is green. Build settings: framework preset none, build command `npm run build`, output directory `build`, Node version from `.nvmrc`. Response headers come from `static/_headers`; the footer shows the deployed commit.

## Documentation

* [Product requirements](docs/prd.md)
* [Design brief](docs/design.md)
* [Architecture](docs/architecture.md)
* [Implementation plan](docs/plan.md)
* [Decision log](docs/decisions.md)
