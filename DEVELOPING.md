# Developing

Things specific to this project that aren't obvious from the code.

## Setup

```bash
uv sync --dev
```

No Docker required. Tests spin up a temporary SQLite-backed Prefect server automatically via `prefect_test_harness()`. The server uses a temp file (not in-memory) so subprocess-based live-flow tests can share the same backend.

## Running tests

```bash
# All tests (~110s due to live flow tests)
pytest tests/ -v

# Fast feedback loop — unit + integration only (~10s)
pytest tests/ -v --ignore=tests/test_live_flows.py

# Just the live flow tests
pytest tests/test_live_flows.py -v
```

## How tool registration works

`src/adapter/schema.py` defines `PrefectTool`, a subclass of FastMCP's `Tool` base class. Each Prefect deployment becomes a `PrefectTool` instance with the deployment's JSON schema passed directly as the `parameters` dict — no code generation or function signature introspection needed.

`PrefectProvider` (in `src/adapter/provider.py`) builds these instances and returns them from `_list_tools()`. The server mounts the provider at startup:

```python
provider = PrefectProvider()
mcp.add_provider(provider)  # FastMCP calls provider._list_tools() to discover tools
```

`_build_tool()` constructs each `PrefectTool`:

```python
PrefectTool(
    name="quarterly_sales_report",
    description="Generate a quarterly sales report",
    parameters=deployment.parameter_openapi_schema,  # passed through as-is
    deployment_id="...",
    deployment_name="quarterly-sales-report",
    mode=2,
)
```

When an MCP client calls the tool, `PrefectTool.run(arguments)` receives the raw arguments dict and passes it to `trigger_and_wait()`. Schema validation is handled by the MCP protocol layer, not by us.

## The post-completion delay

After `wait_for_flow_run` returns, task runs and logs may not be queryable yet — the flow subprocess reports state asynchronously. The `POST_COMPLETION_DELAY` (default 2s, configurable via `MCP_POST_COMPLETION_DELAY`) handles this. Set it to `0` in tests where you don't need logs/tasks.

## Live flow tests

`tests/test_live_flows.py` deploys real Prefect flows via `Runner`, executes them as subprocesses, and queries the results. These tests:

- Use a module-scoped `runner_with_deployments` fixture so the Runner starts once per test module
- Take ~100s total because of subprocess startup overhead and the post-completion delay
- Test the actual `trigger_and_wait` code path with no mocking

The test flows live in `tests/flows/math_flow.py`. If you add a new test flow, make sure it's importable (the Runner needs to find it by module path).

## SQLite locking warnings

You'll see `database is locked` errors in stderr during tests. These are harmless — the ephemeral Prefect server uses SQLite, and concurrent reads/writes from the Runner subprocess occasionally conflict. The telemetry service is the usual culprit. Tests still pass.
