.PHONY: all clean lint format typecheck test test-fast test-live check install \
       ext-lint ext-format ext-test ext-test-e2e ext-test-e2e-io ext-check \
       server worker deploy-examples mcp-server mcp-inspect

# Default target
all: check

# Remove build and test artifacts
clean:
	rm -rf .pytest_cache __pycache__ .ruff_cache dist build *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Install dev dependencies
install:
	uv sync --dev

# ── Code Quality ────────────────────────────────────────────────────────

# Lint with ruff
lint:
	uv run ruff check .
	uv run ruff format --check .

# Auto-fix lint and format issues
format:
	uv run ruff check . --fix
	uv run ruff format .

# Type check source code
typecheck:
	uv run ty check src/ main.py

# ── Tests ───────────────────────────────────────────────────────────────

# Run all tests (~2 min — includes live flow execution)
test:
	uv run pytest tests/ -v

# Run fast tests only (~15s — unit + integration, no live flows)
test-fast:
	uv run pytest tests/ -v --ignore=tests/test_live_flows.py

# Run live flow tests only (~100s)
test-live:
	uv run pytest tests/test_live_flows.py -v

# Run all checks (what CI runs)
check: lint typecheck test-fast ext-check

# ── Local Development ──────────────────────────────────────────────────
# These targets start long-running processes. Run each in a separate terminal.
# See ONPREM.md for the full walkthrough.

# Start a local Prefect server at localhost:4200
server:
	PREFECT_API_URL="http://localhost:4200/api" uv run prefect server start

# Start a worker against the local server (create work pool if needed)
worker:
	PREFECT_API_URL="http://localhost:4200/api" uv run prefect work-pool inspect default >/dev/null 2>&1 || \
		PREFECT_API_URL="http://localhost:4200/api" uv run prefect work-pool create default --type process
	PREFECT_API_URL="http://localhost:4200/api" uv run prefect worker start --pool default

# Deploy example flows to the local server
deploy-examples:
	PREFECT_API_URL="http://localhost:4200/api" uv run python -m examples.deploy_examples

# Start the MCP adapter against the local server
mcp-server:
	PREFECT_API_URL="http://localhost:4200/api" PREFECT_UI_URL="http://localhost:4200" uv run fastmcp run main.py

# Open MCP Inspector pointed at the local MCP server (opens UI at http://localhost:5173)
mcp-inspect:
	PREFECT_API_URL="http://localhost:4200/api" PREFECT_UI_URL="http://localhost:4200" npx @modelcontextprotocol/inspector uv run fastmcp run main.py

# ── Chrome Extension ────────────────────────────────────────────────────

# Lint extension JS with Biome
ext-lint:
	cd chrome-extension && npx @biomejs/biome check .

# Format extension JS with Biome (auto-fix)
ext-format:
	cd chrome-extension && npx @biomejs/biome check . --write

# Unit tests — pure logic, no browser needed (~100ms)
ext-test:
	node --test chrome-extension/prefect-app/logic.test.js

# E2E tests — requires Prefect server at localhost:4200 (~30s)
ext-test-e2e:
	cd chrome-extension && node prefect-app/toolbar.e2e.js

# E2E tests for prefect.io — loads extension in Chrome, hits live prefect.io (~30s)
ext-test-e2e-io:
	cd chrome-extension && node prefect-io/chain-of-action.e2e.js

# Fast check: lint + unit tests (no server needed)
ext-check: ext-lint ext-test
