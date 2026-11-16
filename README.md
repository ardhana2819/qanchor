# QAnchor

QA toolkit for blockchain and crypto testing: valid and invalid test addresses, amount edge cases, unit conversion, transaction lookup, calldata decoding, and Indonesian dummy data. Runs entirely in the browser; there is no backend and nothing leaves the browser except requests you trigger to chain endpoints.

Live: https://qanchor.pages.dev

Status: in development (Phase 1, slice 1a done).

## Tools

Shipped:

| Tool | Route | What it does |
| --- | --- | --- |
| Address generator and validator | `/address` | Valid, invalid, and risky test addresses for EVM, Bitcoin (P2PKH, P2SH, P2WPKH, P2TR; mainnet and testnet), Solana, and Tron, generated in a Web Worker from the browser's CSPRNG. Paste an address to get its chain, type, network, and the exact defect. No private key is ever shown or stored. |
| Amount edge cases | `/amounts` | Edge-case amounts from token decimals, balance, fee, and limits: dust, too many decimals, comma vs dot, scientific notation, fee greater than balance, above max. Exact BigInt arithmetic up to 36 decimals. |
| Unit converter | `/units` | Exact conversion between wei/gwei/ether, sats/BTC, lamports/SOL, sun/TRX, and custom token decimals. |

Address and amount results can be copied or exported as CSV or JSON; converted values can be copied. Settings and data stay in the browser (IndexedDB) and can be exported and imported as JSON.

## Roadmap

* Phase 1, slice 1b: Indonesian dummy data (names, +62 phones, addresses, valid-format fake NIK/NPWP, bank accounts) with seed, presets, and CSV/JSON/SQL export; QA checklists (deposit, withdraw, swap, staking, network mismatch, memo/tag, stocks).
* Phase 1, slice 1c: transaction lookup over public endpoints (EVM chains, Solana, Tron, Bitcoin), EVM calldata decoder, testnet wallet tracker with faucet links.
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
