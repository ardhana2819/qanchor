# QAnchor

QA toolkit for blockchain and crypto testing: valid and invalid test addresses, amount edge cases, unit conversion, transaction lookup, calldata decoding, and Indonesian dummy data. Runs entirely in the browser; there is no backend and nothing leaves the browser except requests you trigger to chain endpoints.

Status: in development (Phase 1). Shipped so far: the address generator and validator (`/address`), amount edge cases (`/amounts`), and the unit converter (`/units`).

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

## Documentation

* [Product requirements](docs/prd.md)
* [Design brief](docs/design.md)
* [Architecture](docs/architecture.md)
* [Implementation plan](docs/plan.md)
* [Decision log](docs/decisions.md)
