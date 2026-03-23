# Getting started: on-prem Prefect

This guide walks through connecting the Prefect MCP Adapter to a self-hosted Prefect server instead of Prefect Cloud.

## Prerequisites

- Python 3.11+
- A running Prefect server (see [Start a server](#1-start-a-prefect-server) below if you don't have one yet)
- A Prefect worker processing your work pool

## Quick start with Make

The Makefile has targets for every step. Run each in a separate terminal:

```bash
# Terminal 1 — Prefect server
make server

# Terminal 2 — Prefect worker (creates the "default" work pool if needed)
make worker

# Terminal 3 — deploy the example flows
make deploy-examples

# Terminal 4 — MCP adapter
make mcp-server
```

That's it — you now have a local Prefect server, a worker, example deployments tagged with `mcp-tool`, and the MCP adapter serving tools. Read on for details on each step.

## 1. Start a Prefect server

Skip this if you already have a self-hosted Prefect instance running.

```bash
make server
# or manually:
prefect server start
```

The UI is available at `http://localhost:4200` by default.

## 2. Create a work pool and start a worker

Flows need somewhere to run. Create a work pool and start a worker:

```bash
make worker
# or manually:
export PREFECT_API_URL="http://localhost:4200/api"
prefect work-pool create default --type process
prefect worker start --pool default
```

## 3. Deploy a flow with MCP tags

Tag any deployment with `mcp-tool` to expose it through the adapter. The quickest path is the included examples:

```bash
make deploy-examples
```

Or deploy your own flow:

```python
# my_flow.py
from prefect import flow, task

@task
def fetch_data(query: str) -> dict:
    return {"query": query, "rows": 42}

@flow
def run_report(query: str = "SELECT *") -> dict:
    return fetch_data(query)

if __name__ == "__main__":
    run_report.from_source(
        source=".",
        entrypoint="my_flow.py:run_report",
    ).deploy(
        name="run-report",
        work_pool_name="default",
        tags=["mcp-tool"],          # Mode 1: status + metadata
        # tags=["mcp-tool", "mcp-artifacts"],     # Mode 2: + artifacts
        # tags=["mcp-tool", "mcp-artifacts", "mcp-logs"],  # Mode 3: + logs
    )
```

```bash
PREFECT_API_URL="http://localhost:4200/api" python my_flow.py
```

## 4. Configure and run the adapter

The key difference from Prefect Cloud: no API key is needed, and you should set `PREFECT_UI_URL` so tool responses include clickable links to your Prefect UI.

```bash
make mcp-server
# or manually:
export PREFECT_API_URL="http://localhost:4200/api"
export PREFECT_UI_URL="http://localhost:4200"
fastmcp run main.py
```

### Install into Claude Desktop

```bash
fastmcp install main.py --name prefect-tools \
  -e PREFECT_API_URL="http://localhost:4200/api" \
  -e PREFECT_UI_URL="http://localhost:4200"
```

## Environment variables

| Variable | Cloud | On-prem | Notes |
|----------|-------|---------|-------|
| `PREFECT_API_URL` | Required | Required | Cloud: `https://api.prefect.cloud/api/accounts/…` / On-prem: `http://<host>:<port>/api` |
| `PREFECT_API_KEY` | Required | Not needed | On-prem servers don't require auth by default |
| `PREFECT_UI_URL` | Auto-detected | Recommended | Set to your Prefect UI base URL (e.g. `http://localhost:4200`) so flow run links appear in responses |
| `MCP_FLOW_TIMEOUT` | `300` | `300` | Max seconds to wait for a flow run |
| `MCP_POST_COMPLETION_DELAY` | `2` | `2` | Seconds to wait for logs/tasks to flush after completion |

## Common on-prem topologies

### Single machine (development)

Everything on localhost — simplest setup for trying things out:

```
Prefect server  →  localhost:4200
Prefect worker  →  same machine
MCP adapter     →  same machine
```

```bash
export PREFECT_API_URL="http://localhost:4200/api"
export PREFECT_UI_URL="http://localhost:4200"
```

### Dedicated server (team use)

Prefect server on a shared host, workers and adapter on separate machines:

```
Prefect server  →  prefect.internal.example.com:4200
Prefect workers →  worker-1, worker-2, …
MCP adapter     →  developer laptop or shared host
```

```bash
export PREFECT_API_URL="http://prefect.internal.example.com:4200/api"
export PREFECT_UI_URL="http://prefect.internal.example.com:4200"
```

### Docker Compose

```yaml
services:
  prefect-server:
    image: prefecthq/prefect:3-python3.12
    command: prefect server start --host 0.0.0.0
    ports:
      - "4200:4200"

  prefect-worker:
    image: prefecthq/prefect:3-python3.12
    command: >
      sh -c "prefect work-pool create default --type process || true &&
             prefect worker start --pool default"
    environment:
      PREFECT_API_URL: "http://prefect-server:4200/api"
    depends_on:
      - prefect-server

  mcp-adapter:
    build: .
    command: fastmcp run main.py
    environment:
      PREFECT_API_URL: "http://prefect-server:4200/api"
      PREFECT_UI_URL: "http://localhost:4200"
    depends_on:
      - prefect-server
```

## Testing the Chrome extension

The Chrome extension adds MCP toggle buttons to the Prefect UI, letting you tag deployments as MCP tools with one click. It works with both Prefect Cloud and local servers.

### Load the extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** and select the `chrome-extension/` directory from this repo
4. The "Prefect MCP Tools" extension should appear in the list

### Manual testing walkthrough

With the local server running (`make server`):

1. **Open the Prefect UI** — navigate to `http://localhost:4200`
2. **Deploy a flow** if you haven't already — `make deploy-examples`
3. **Navigate to a deployment detail page** — click Deployments in the sidebar, then click a deployment (e.g. `hello-world`)
4. **Verify the MCP toolbar appears** — you should see a toolbar below the page header with three toggle buttons: **Tool**, **Artifacts**, **Logs**, and a status indicator
5. **Toggle MCP Tool on** — click the **Tool** button. It should turn on and the status should read "Mode 1 — Exposed as MCP tool"
6. **Toggle Artifacts on** — click **Artifacts**. Status should update to "Mode 2"
7. **Toggle Logs on** — click **Logs**. Status should update to "Mode 3"
8. **Verify tags persisted** — refresh the page. The toolbar should reflect the saved state. You can also check the Tags section in the deployment details panel
9. **Toggle Tool off** — click **Tool** again. Artifacts and Logs buttons should disable (they require Tool). Status should read "Not exposed"
10. **Navigate away and back** — click to a different page, then return to the deployment. The toolbar should re-inject with the correct state

**What to look for:**
- Toolbar injects below the page header (not floating, not at the bottom)
- Buttons show on/off state with a colored indicator dot
- Artifact and Log buttons are disabled (grayed out) when Tool is off
- Status text updates immediately on click (optimistic UI)
- No console errors in DevTools (`F12` → Console)

### Notes for on-prem testing

- No API key is needed — the extension uses browser credentials against localhost
- The extension's `host_permissions` in `manifest.json` already include `http://localhost:*/*`
- For a Prefect server on a different host, you may need to add that host to `host_permissions` and `content_scripts.matches` in `manifest.json`

### Automated tests

```bash
# Unit tests (no browser, no server)
make ext-test

# E2E tests (requires Prefect server at localhost:4200 and Playwright)
make ext-test-e2e
```

## Troubleshooting

**No tools discovered**
- Verify your deployments have the `mcp-tool` tag: `prefect deployment ls` and check the tags
- Confirm `PREFECT_API_URL` points to the correct server
- Run `refresh_workflows` via the MCP client to re-scan

**Flow run links missing or broken**
- Set `PREFECT_UI_URL` to your Prefect UI base URL (without a trailing slash)
- For Cloud this is auto-detected; for on-prem it must be set explicitly

**Flows stuck in "Scheduled" state**
- Make sure a worker is running and connected to the correct work pool: `prefect worker start --pool <your-pool>`
- Check that the work pool exists: `prefect work-pool ls`

**Connection refused**
- Confirm the Prefect server is running and reachable from the adapter host
- Check firewall rules if the server is on a different machine
- Verify the port in `PREFECT_API_URL` matches the server's listen port