@README.md
@DEVELOPING.md
@CONTRIBUTING.md

## Chrome Extension (`chrome-extension/`)

### Architecture

- `logic.js` — Pure functions (URL parsing, tag toggle logic, mode computation). No DOM, no side effects. Loaded as a global script before content.js by the Chrome extension manifest.
- `content.js` — DOM interaction, API calls, toolbar injection. Depends on globals from logic.js. Runs in the page context of Prefect UI.
- `content.css` — Toolbar and badge styles.
- `popup.html` / `popup.js` — API key configuration popup (currently unused; auth uses browser credentials).
- `manifest.json` — Chrome extension manifest. Loads `logic.js` then `content.js` on matching pages.

### Testing

Two test layers:

1. **Unit tests** (`test_logic.js`) — Tests pure logic in `logic.js`. No browser, no server, runs in ~100ms.

   ```bash
   make ext-test
   ```

2. **E2E tests** (`test_extension.js`) — Playwright tests against a real Prefect server at localhost:4200. Injects the extension code into the page and verifies toolbar injection, button states, API calls.

   ```bash
   # Start Prefect server first:
   prefect server start --host 127.0.0.1 --port 4200
   # Then run:
   make ext-test-e2e
   ```

### Development workflow

```bash
make ext-check      # Lint + unit tests (fast, no server needed)
make ext-format     # Auto-fix lint issues
make ext-test-e2e   # Full E2E (needs running Prefect server)
```

### Key rules

- All new pure logic goes in `logic.js` with corresponding tests in `test_logic.js`.
- `content.js` should only contain DOM manipulation and API calls — keep it thin.
- The E2E tests dismiss a "Join the Prefect Community" modal that Prefect OSS shows on first visit.
- URL pattern for deployment detail pages: `/deployments/deployment/{uuid}` (note the double "deployment").
- The extension supports both OSS (localhost, no auth) and Cloud (app.prefect.cloud, Bearer token auth).
- Biome is the linter — config in `chrome-extension/biome.json`. Run `make ext-lint` to check.
