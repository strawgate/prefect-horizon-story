# Contributing

Thanks for your interest in contributing to the Prefect MCP Adapter.

## Submitting a PR

1. **Fork** the repository and create a feature branch from `main`
2. **Install** dev dependencies: `uv sync --dev`
3. **Make your changes** — see [DEVELOPING.md](DEVELOPING.md) for project-specific details
4. **Run the tests**: `make check`
5. **All tests must pass** before submitting (`make check`)
6. **Open a PR** against `main` with a clear description of what changed and why

## What to include in your PR

- A short title (under 70 characters)
- A summary of what you changed and the motivation
- If you added a new feature, include tests for it
- If you changed behavior, note whether it's backwards-compatible

## Code style

- Follow the existing patterns in the codebase
- Keep functions focused — one function, one job
- Use type hints for function signatures
- Write docstrings for public functions
- Use async functions in `src/adapter/` and runtime code — synchronous functions are fine in `examples/` and `tests/flows/`

## Tests

The test suite has three layers:

| Layer | Files | What they test | Speed |
|-------|-------|----------------|-------|
| Unit | `test_discovery.py`, `test_executor.py`, `test_schema.py` | Pure logic, no server | Fast (~1s) |
| Integration | `test_integration.py` | API calls against an ephemeral Prefect server | Medium (~8s) |
| Live flow | `test_live_flows.py` | Real flows deployed and executed via Runner | Slow (~100s) |

If your change touches the executor or discovery logic, make sure the live flow tests still pass — they're the closest thing to production behavior.

### Adding tests for a new feature

- **New adapter logic** — Add unit tests in the appropriate `test_*.py` file
- **New API interactions** — Add integration tests in `test_integration.py` using the `prefect_server` fixture
- **New flow behavior** — Add a test flow in `tests/flows/` and a test in `test_live_flows.py`

## Adding a new response mode

The mode system (1/2/3) is designed to be extensible:

1. Choose a new tag name (e.g., `mcp-metrics`)
2. Update `determine_mode()` in `src/adapter/provider.py`
3. Add the data-fetching logic to `_build_response()` in `src/adapter/executor.py`
4. Add unit tests for mode detection and integration tests for the new data
5. Update the tag table in `README.md`

## Reporting issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Prefect and Python versions (`prefect version`, `python --version`)
