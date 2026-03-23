# Chrome Extension — Developer Guide

## Structure

```
chrome-extension/
├── manifest.json              # MV3 manifest — declares all content scripts
├── biome.json                 # Linter / formatter config
├── icons/
├── prefect-app/               # Runs on app.prefect.cloud + localhost:4200
│   ├── logic.js               # Pure logic — URL parsing, tag rules, mode calc
│   ├── logic.test.js          # Unit tests (Node built-in test runner, no browser)
│   ├── toolbar.js             # Content script — injects MCP row into sidebar
│   ├── toolbar.css            # Minimal styles (most UI uses native Prefect classes)
│   └── toolbar.e2e.js         # E2E tests (Playwright, needs local Prefect server)
└── prefect-io/                # Runs on www.prefect.io and horizon.prefect.io
    ├── chain-of-action.js     # Content script — Chain of Action overlay (prefect.io)
    ├── chain-of-action.e2e.js # E2E tests (Playwright, hits live prefect.io)
    ├── horizon.js             # Content script — MCP config panel (horizon.prefect.io)
    └── horizon-workflows.js   # Content script — Workflow Creation Wizard (horizon.prefect.io)
```

The folder structure mirrors the manifest's `matches` field — each folder is one content script context with its own isolated scope.

## Loading in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension/` directory
4. **Chrome 114+ site access**: after loading, click **Details** → **Site access** → change from "On click" to **"On all sites"**, or pin the extension and grant access per-site on first visit

## Running tests

```bash
# Unit tests — no browser, no server, ~100ms
make ext-test

# Lint + unit tests (what CI runs)
make ext-check

# E2E tests for the MCP toolbar — requires Prefect server at localhost:4200
make ext-test-e2e

# E2E tests for prefect.io overlay — requires internet + Playwright
make ext-test-e2e-io
```

The E2E tests need Playwright installed:

```bash
npm install playwright --prefix /tmp
npx playwright install chromium  # downloads Chromium binary
```

**`toolbar.e2e.js`** — injects scripts directly into a live Prefect page (no `--load-extension`). Runs fully headless; no special setup needed.

**`chain-of-action.e2e.js`** — loads the full extension via `--load-extension` to test the MutationObserver banner injection against the real prefect.io DOM. Uses `--headless=new` (Chrome 112+), which supports extensions in headless mode. To watch the browser locally:

```bash
HEADLESS=false node prefect-io/chain-of-action.e2e.js
```

Neither E2E test runs in CI — `toolbar.e2e.js` needs a live Prefect server and `chain-of-action.e2e.js` hits live prefect.io. Both are manual only.

## prefect-app: MCP toolbar

**What it does:** Injects a native-looking "Model Context Protocol (AI)" row into the deployment detail sidebar, following the `p-key-value` pattern used by Schedules and Triggers.

**SPA navigation:** Prefect is a Next.js SPA. `toolbar.js` polls `window.location.href` every 1.5s and re-injects on URL change after a 500ms render wait.

**Injection point:** Finds `.deployment-details`, then locates the Triggers row by label text and injects immediately after it. Falls back to appending to `.deployment-details`, then to after the page header.

**Auth:** Uses `credentials: "include"` — the extension runs in the logged-in browser context so session cookies handle auth for both OSS (no auth) and Prefect Cloud (cookie session). No API key needed.

**Tag → mode mapping:**
| Tags present | Mode | Response includes |
|---|---|---|
| `mcp-tool` | 1 | Metadata (status, tasks, duration) |
| `mcp-tool` + `mcp-artifacts` | 2 | + Artifacts |
| `mcp-tool` + `mcp-artifacts` + `mcp-logs` | 3 | + Logs |

**Pure logic in `logic.js`:** URL parsing, tag toggle rules, and mode calculation live in `logic.js` with no DOM side effects so they're independently unit-testable.

## prefect-io: Horizon Cloud sidebar

**`horizon.js`** — Injects an MCP configuration panel into `horizon.prefect.io` server management pages. Lets users connect a Prefect Cloud workspace to their Horizon server by entering an API URL and API key. On save it calls the Prefect Cloud API to validate credentials and register the workspace URL as a Horizon environment variable via the Horizon REST API.

**`horizon-workflows.js`** — Injects a "Workflows" sidebar group above Analytics on server management pages (`/chain-of-action/servers/<name>/*`). Clicking "Create Workflow" opens a two-step wizard:
1. Fetches the server's tool manifest via the Horizon REST API (`/api/v0/organizations/{orgId}/servers/{serverId}/manifest?`), with `orgId`/`serverId` resolved by calling the TanStack server function `/_serverFn/c4a10a1…`
2. User selects tools, names the flow, clicks Generate
3. Produces a typed Prefect flow with `fastmcp.Client` calls and a `pip install prefect fastmcp && prefect cloud login && python <file>.py` deploy command

**Sidebar injection:** Both scripts use `history.pushState`/`replaceState` interception + `MutationObserver` for SPA navigation. `horizon-workflows.js` locates the Analytics group via `[data-slot="sidebar-group-label"]` and inserts the Workflows group immediately before it.

## prefect-io: Chain of Action overlay

**What it does:** Adds a "Workflows as AI Tools NEW →" banner to the Solutions dropdown in the Prefect nav, and renders the Chain of Action product page in a Shadow DOM overlay when clicked or when navigating directly to `/solutions/chain-of-action`.

**Lazy Radix UI panels:** The Prefect nav uses Radix UI `NavigationMenu`. Dropdown panels are only added to the DOM when the user first hovers a nav item. A `MutationObserver` watches for the Solutions panel to appear and injects the banner within ~150ms of hover.

**Shadow DOM isolation:** The overlay renders inside a Shadow DOM to prevent Prefect's styles from leaking in. Key constraints:
- `position: sticky` requires the scroll container to be *inside* the shadow DOM (`#scroll-wrap` with `overflow-y: auto`), not on the host element
- CSS custom properties use `:host {}` not `:root {}` — `:root` inside shadow DOM doesn't create variables accessible to shadow children
- The host element uses `overflow: hidden` (not `overflow-y: auto`) to avoid breaking sticky

**Scroll animations:** The page script runs animation logic patched with a document/window proxy that redirects `getElementById`/`querySelectorAll` to the shadow root and `addEventListener('scroll', ...)` to the inner scroll container. This satisfies MV3's CSP ban on `eval`/`new Function` — the script is a real parsed function, not a string.

**SPA navigation detection:** `history.pushState` and `history.replaceState` are intercepted to detect Next.js client-side navigation and hide the overlay when the user navigates away.

## MV3 constraints

Chrome Manifest V3 enforces a strict Content Security Policy:

- **No `eval` or `new Function()`** — any script that needs to run dynamic code must be a real parsed function stored in the extension files
- **No remote scripts** — all JS must be bundled in the extension; the Chain of Action overlay loads Google Fonts inside the Shadow DOM via a `<link>` tag (CSS fetch, not script)
- **`credentials: "include"`** on all fetch calls — works because content scripts run in the page's origin context

## Linting

[Biome](https://biomejs.dev) handles both linting and formatting. The config is in `biome.json`. Auto-fix:

```bash
make ext-format
```
