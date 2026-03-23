# Prefect–Horizon Bridge

What would it look like if Prefect Cloud and Horizon were deeply integrated — if any Prefect deployment could become a governed MCP tool with a click, and any set of Horizon tools could become a durable Prefect workflow?

This project is a working simulation of that world. Install the Chrome extension and the experience comes to life across Prefect Cloud, Horizon, and prefect.io.

## The Chrome extension

The extension injects functional UI into three sites to simulate the integrated experience:

### Prefect Cloud / Prefect OSS (`app.prefect.cloud`, `localhost:4200`)

Adds a **Model Context Protocol (AI)** row to the deployment detail sidebar — right alongside Schedules and Triggers. From this row you can:

- Publish a deployment as an MCP tool with one click
- Choose a response mode (metadata only, + artifacts, or + logs) — each an explicit security opt-in
- See the current mode at a glance via an inline badge
- Remove MCP exposure just as easily

This is the "publish a workflow as a tool" experience — the deployment's Python type hints become the tool's input schema, its docstring becomes the tool description, and its artifacts become structured output agents can reason over.

### Horizon Cloud (`horizon.prefect.io`)

Injects two features into the Horizon server management UI:

**Prefect Cloud Bridge** — A configuration panel that connects a Prefect Cloud workspace to a Horizon server. Enter your API URL and key, and the extension deploys a FastMCP adapter (the one in this repo) as a Horizon-managed server. Every tagged deployment in your Cloud workspace becomes a tool in Horizon Registry, governed by Horizon Gateway.

**Workflow Creation Wizard** — The reverse direction. Select any tools from your Horizon server, name a flow, and the wizard generates a typed Prefect workflow that calls those tools as tasks — with a deploy command ready to go. This turns fragile tool chains into durable Prefect workflows.

### prefect.io

Injects a **Chain of Action** product page into the Solutions dropdown — a full product narrative for what happens when Prefect's execution layer meets Horizon's agent governance. Includes scroll animations, three blog posts, and a mode comparison. Renders in a Shadow DOM overlay to avoid interfering with the real site.

## The adapter

The FastMCP adapter is the working backend that powers the bridge. It's not a mock — it actually discovers deployments, registers MCP tools, and brokers execution against a real Prefect server.

### How it works

1. On startup, the adapter queries the Prefect API (Cloud or self-hosted) for all deployments tagged `mcp-tool`
2. For each deployment, it reads the parameter schema and registers a typed MCP tool
3. When a tool is called, it triggers the deployment, waits for the flow run to complete, and returns results
4. Two built-in meta-tools (`list_workflows`, `refresh_workflows`) let clients discover and refresh available tools at runtime

### Quick start

**Horizon Cloud (recommended):** Visit your [Horizon Cloud servers page](https://horizon.prefect.io/chain-of-action/servers) to set up the adapter with guided configuration for Claude Desktop, Cursor, and other MCP clients.

**Self-managed:**

```bash
pip install -e .

export PREFECT_API_URL="https://api.prefect.cloud/api/accounts/{acct}/workspaces/{ws}"
export PREFECT_API_KEY="pnu_..."

# Run locally
fastmcp run main.py

# Or install into Claude Desktop
fastmcp install main.py --name prefect-tools
```

**Using a self-hosted Prefect server?** See [ONPREM.md](ONPREM.md) for the on-prem getting started guide.

### Tagging your deployments

Add `mcp-tool` to any deployment's tags to expose it. Additional tags control how much data the tool returns:

| Tags | Mode | What's returned |
|------|------|-----------------|
| `mcp-tool` | 1 | Status, duration, task breakdown, Prefect UI link |
| + `mcp-artifacts` | 2 | Mode 1 + artifacts (tables, markdown, links) |
| + `mcp-logs` | 3 | Mode 2 + flow run logs (INFO and above) |

Example deployment:

```python
my_flow.deploy(
    name="quarterly-report",
    work_pool_name="default",
    tags=["mcp-tool", "mcp-artifacts"],  # Mode 2
)
```

Tool parameters are derived directly from the flow's parameter schema — types, defaults, and required fields are all preserved.

### Response format

Every tool returns a JSON object. Here's a Mode 3 response from a flow with three tasks:

```json
{
  "status": "COMPLETED",
  "flow_run_url": "https://app.prefect.cloud/flow-runs/27abf63a-...",
  "duration_seconds": 0.1,
  "tasks": [
    {"name": "add_numbers-e37", "state": "COMPLETED", "duration_seconds": 0.0},
    {"name": "multiply_numbers-2a9", "state": "COMPLETED", "duration_seconds": 0.0},
    {"name": "build_report-57d", "state": "COMPLETED", "duration_seconds": 0.0}
  ],
  "artifacts": [
    {
      "key": "math-results",
      "type": "table",
      "description": "Math operation results",
      "data": [
        {"operation": "sum", "result": 17},
        {"operation": "product", "result": 70}
      ]
    }
  ],
  "logs": [
    {"level": "INFO", "message": "Adding 10 + 7"},
    {"level": "INFO", "message": "Result: 17"}
  ]
}
```

Failed flows return `"status": "FAILED"` with an `"error"` field containing the exception message. Timed-out flows return `"status": "TIMEOUT"` with the `flow_run_id` so you can check on it later.

### Meta-tools

Two tools are always available regardless of deployments:

- **`list_workflows`** — Returns all registered tools with their parameters and response modes
- **`refresh_workflows`** — Re-scans the Prefect API (Cloud or self-hosted) and picks up new/removed deployments without restarting the server

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PREFECT_API_URL` | (required) | Prefect API (Cloud or self-hosted) workspace URL |
| `PREFECT_API_KEY` | (required) | Prefect API (Cloud or self-hosted) API key |
| `MCP_FLOW_TIMEOUT` | `300` | Max seconds to wait for a flow run to complete |
| `MCP_POST_COMPLETION_DELAY` | `2` | Seconds to wait after completion for logs/tasks to flush |
| `MCP_TOOL_CONFIG` | — | Inline JSON or YAML tool config (see below) |
| `MCP_TOOL_CONFIG_FILE` | — | Path to a JSON or YAML tool config file |

#### Tool config file

By default every `mcp-tool`-tagged deployment is exposed. A config file (or `mcp-tools.yaml` in the working directory) lets you filter and override that set:

```yaml
# mcp-tools.yaml

# Additive: pull in deployments that aren't tagged mcp-tool (name or glob)
include:
  - "internal-etl-pipeline"   # exact name
  - name: "quarterly-*"       # glob + per-tool overrides
    tool_name: "quarterly_report"   # rename the MCP tool
    description: "Run the quarterly sales report"
    mode: 2                         # force mode regardless of tags

# Remove matching deployments from the discovered set
exclude:
  - "debug-*"
  - "scratch-*"

# Defaults applied when tags don't specify a mode
defaults:
  mode: 2
```

Config is loaded in priority order: `MCP_TOOL_CONFIG` env var → `MCP_TOOL_CONFIG_FILE` env var → `mcp-tools.yaml` in the working directory → empty defaults.

## Examples

The `examples/` directory contains sample flows covering each mode:

- **`hello_world.py`** — Simple greeting flow (Mode 1). One task, one parameter.
- **`sales_report.py`** — Quarterly sales report (Mode 2). Multiple tasks, table + markdown artifacts.
- **`ai_research.py`** — PydanticAI research agent (Mode 2). Structured output with confidence-rated findings.
- **`database_report.py`** — SQLite analytics report (Mode 2). Revenue queries with table + markdown artifacts.
- **`web_to_markdown.py`** — Web page to Markdown (Mode 2). Fetches a URL, converts HTML, publishes content artifact.
- **`deploy_examples.py`** — Script to deploy all examples to the Prefect API (Cloud or self-hosted) with the right tags.

```bash
# Deploy the examples
pip install -e ".[examples]"
python examples/deploy_examples.py
```

## Project structure

```
chrome-extension/
  manifest.json            # MV3 manifest — declares all content scripts
  prefect-app/
    logic.js               # Pure logic — URL parsing, tag rules, mode calc
    toolbar.js             # Content script — MCP toolbar for Prefect Cloud
    toolbar.css            # Toolbar styles
    logic.test.js          # Unit tests
    toolbar.e2e.js         # E2E tests (Playwright, needs local Prefect server)
  prefect-io/
    chain-of-action.js     # Content script — product page overlay (prefect.io)
    chain-of-action.e2e.js # E2E tests (Playwright, hits live prefect.io)
    horizon.js             # Content script — Prefect Cloud Bridge (horizon.prefect.io)
    horizon-workflows.js   # Content script — Workflow Creation Wizard (horizon.prefect.io)
main.py                    # FastMCP server entry point
src/adapter/
  provider.py              # Discover deployments, build PrefectTool instances
  schema.py                # PrefectTool — MCP Tool backed by a Prefect deployment
  executor.py              # Trigger flows, wait, build responses
  config.py                # Load include/exclude/override config from env or file
examples/                  # Sample flows covering each response mode
tests/                     # Unit, integration, and live flow tests
```
