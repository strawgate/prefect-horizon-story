# Prefect–Horizon Bridge

A [FastMCP](https://github.com/jlowin/fastmcp) adapter that bridges Prefect Cloud and Horizon — turning Prefect deployments into governed MCP tools. Tag a deployment with `mcp-tool` and it becomes callable from Claude Desktop, Cursor, or any MCP client, with hosting and governance through Horizon.

## How it works

1. On startup, the adapter queries the Prefect API (Cloud or self-hosted) for all deployments tagged `mcp-tool`
2. For each deployment, it reads the parameter schema and registers a typed MCP tool
3. When a tool is called, it triggers the deployment, waits for the flow run to complete, and returns results
4. Two built-in meta-tools (`list_workflows`, `refresh_workflows`) let clients discover and refresh available tools at runtime

## Quick start

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

## Tagging your deployments

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

## Response format

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

## Meta-tools

Two tools are always available regardless of deployments:

- **`list_workflows`** — Returns all registered tools with their parameters and response modes
- **`refresh_workflows`** — Re-scans the Prefect API (Cloud or self-hosted) and picks up new/removed deployments without restarting the server

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PREFECT_API_URL` | (required) | Prefect API (Cloud or self-hosted) workspace URL |
| `PREFECT_API_KEY` | (required) | Prefect API (Cloud or self-hosted) API key |
| `MCP_FLOW_TIMEOUT` | `300` | Max seconds to wait for a flow run to complete |
| `MCP_POST_COMPLETION_DELAY` | `2` | Seconds to wait after completion for logs/tasks to flush |
| `MCP_TOOL_CONFIG` | — | Inline JSON or YAML tool config (see below) |
| `MCP_TOOL_CONFIG_FILE` | — | Path to a JSON or YAML tool config file |

### Tool config file

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
main.py                  # FastMCP server entry point
src/adapter/
  provider.py            # Discover deployments, build PrefectTool instances
  schema.py              # PrefectTool — MCP Tool backed by a Prefect deployment
  executor.py            # Trigger flows, wait, build responses
  config.py              # Load include/exclude/override config from env or file
examples/
  hello_world.py         # Mode 1 example flow
  sales_report.py        # Mode 2 example flow (table + markdown artifacts)
  ai_research.py         # Mode 2 example flow (PydanticAI structured output)
  database_report.py     # Mode 2 example flow (SQLite analytics)
  web_to_markdown.py     # Mode 2 example flow (web scraping)
  deploy_examples.py     # Deployment script
tests/
  conftest.py            # Ephemeral Prefect server fixture + shared helpers
  test_discovery.py      # Tool naming, mode detection
  test_schema.py         # PrefectTool construction and execution
  test_executor.py       # URL building, log levels
  test_provider.py       # Provider discovery, refresh, collision detection
  test_integration.py    # API-level tests against ephemeral server
  test_live_flows.py     # Real flow execution tests
  flows/math_flow.py     # Test flows (multi-task, failing)
```