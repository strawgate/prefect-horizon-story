"""
Live flow integration tests.

These tests deploy REAL flows to an ephemeral Prefect server, run them through
a Runner, and verify the adapter produces correct responses. No mocking of
flow execution — the flows actually run as subprocesses.

These are slower than the other integration tests (~10-15s each) because they
involve real subprocess execution and API polling.
"""

import asyncio
import contextlib

import pytest
import pytest_asyncio
from prefect.client.orchestration import get_client
from prefect.runner import Runner

from adapter.executor import trigger_and_wait
from adapter.provider import PrefectProvider
from tests.flows.math_flow import failing_workflow, math_workflow


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def runner_with_deployments(prefect_server):
    """
    Deploy math_workflow and failing_workflow to the ephemeral server
    and start a Runner to execute them. Shared across all tests in this module.
    """
    math_dep = await math_workflow.ato_deployment(
        name="math-live",
        tags=["mcp-tool", "mcp-artifacts", "mcp-logs"],
    )
    fail_dep = await failing_workflow.ato_deployment(
        name="fail-live",
        tags=["mcp-tool"],
    )

    runner = Runner(name="test-runner")
    await runner.add_deployment(math_dep)
    await runner.add_deployment(fail_dep)

    runner_task = asyncio.create_task(runner.start())

    # Poll until the runner has registered both deployments with the server
    async with get_client() as client:
        for _ in range(60):
            deps = await client.read_deployments()
            dep_names = {d.name for d in deps}
            if "math-live" in dep_names and "fail-live" in dep_names:
                break
            await asyncio.sleep(0.5)
        else:
            raise TimeoutError("Runner did not register deployments within 30s")

    yield

    runner.started = False
    runner_task.cancel()
    with contextlib.suppress(asyncio.CancelledError, RuntimeError):
        await runner_task

    # Clean up deployments from the Prefect server
    async with get_client() as client:
        deps = await client.read_deployments()
        for d in deps:
            if d.name in ("math-live", "fail-live"):
                with contextlib.suppress(Exception):
                    await client.delete_deployment(d.id)


@pytest_asyncio.fixture(loop_scope="module")
async def deployment_ids(runner_with_deployments):
    """Get deployment IDs from the server."""
    async with get_client() as client:
        deps = await client.read_deployments()
        ids = {}
        for d in deps:
            if d.name == "math-live":
                ids["math"] = str(d.id)
            elif d.name == "fail-live":
                ids["fail"] = str(d.id)

        missing = {"math", "fail"} - ids.keys()
        assert not missing, f"Missing expected deployments: {missing}"
        return ids


# ===========================================================================
# Real Flow Execution Tests
# ===========================================================================


@pytest.mark.asyncio(loop_scope="module")
class TestLiveFlowExecution:
    """Test trigger_and_wait with REAL flow execution — no mocks."""

    async def test_completed_flow_returns_all_tasks(self, deployment_ids):
        """A multi-task flow should return all task names and states."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 10, "y": 7}, mode=1)

        assert result["status"] == "COMPLETED"
        assert len(result["tasks"]) == 3

        task_names = {t["name"].split("-")[0] for t in result["tasks"]}
        assert "add_numbers" in task_names
        assert "multiply_numbers" in task_names
        assert "build_report" in task_names

        for task in result["tasks"]:
            assert task["state"] == "COMPLETED"

    async def test_completed_flow_has_duration(self, deployment_ids):
        """Completed flows should report duration."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 1, "y": 2}, mode=1)

        assert "duration_seconds" in result
        assert result["duration_seconds"] >= 0

    async def test_failed_flow_returns_error(self, deployment_ids):
        """A failing flow should return status=FAILED and an error message."""
        result = await trigger_and_wait(
            deployment_ids["fail"],
            {"message": "connection refused"},
            mode=1,
        )

        assert result["status"] == "FAILED"
        assert "error" in result
        assert "connection refused" in result["error"]

    async def test_mode1_excludes_artifacts_and_logs(self, deployment_ids):
        """Mode 1 should NOT include artifacts or logs."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 5, "y": 3}, mode=1)

        assert "artifacts" not in result
        assert "logs" not in result


@pytest.mark.asyncio(loop_scope="module")
class TestLiveArtifacts:
    """Test that real artifacts created by flows appear in Mode 2+ responses."""

    async def test_table_artifact_is_parsed_list(self, deployment_ids):
        """Table artifacts should be parsed from JSON strings into lists."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 4, "y": 6}, mode=2)

        assert "artifacts" in result
        table = next((a for a in result["artifacts"] if a["type"] == "table"), None)
        assert table is not None
        assert isinstance(table["data"], list), (
            f"Table data should be a list, got {type(table['data'])}"
        )
        assert len(table["data"]) == 3  # sum, product, combined rows

        # Verify actual computed values
        results_by_op = {row["operation"]: row["result"] for row in table["data"]}
        assert results_by_op["sum"] == 10  # 4 + 6
        assert results_by_op["product"] == 24  # 4 * 6
        assert results_by_op["combined"] == 34  # 10 + 24

    async def test_markdown_artifact_content(self, deployment_ids):
        """Markdown artifacts should contain the expected summary text."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 3, "y": 9}, mode=2)

        md = next((a for a in result["artifacts"] if a["type"] == "markdown"), None)
        assert md is not None
        assert "Math Report" in md["data"]
        assert "27" in md["data"]  # 3 * 9 = 27


@pytest.mark.asyncio(loop_scope="module")
class TestLiveLogs:
    """Test that real log entries appear in Mode 3 responses."""

    async def test_logs_contain_flow_output(self, deployment_ids):
        """Mode 3 should return log entries from the flow's print statements."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 2, "y": 8}, mode=3)

        assert "logs" in result
        assert len(result["logs"]) > 0

        messages = [log["message"] for log in result["logs"]]
        # The flow prints "Adding X + Y" and "Multiplying X * Y"
        assert any("Adding 2 + 8" in m for m in messages)
        assert any("Multiplying 2 * 8" in m for m in messages)

    async def test_logs_have_level_names(self, deployment_ids):
        """Log levels should be human-readable strings, not integers."""
        result = await trigger_and_wait(deployment_ids["math"], {"x": 1, "y": 1}, mode=3)

        for log in result["logs"]:
            assert log["level"] in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")


@pytest.mark.asyncio(loop_scope="module")
class TestLiveDiscoveryToExecution:
    """End-to-end: discover real deployments, then trigger them via the adapter."""

    async def test_discover_then_trigger(self, runner_with_deployments):
        """Discover live deployments via provider, verify schemas, trigger via adapter."""
        provider = PrefectProvider()
        await provider._refresh()

        assert "math_live" in provider._tools

        tool = provider._tools["math_live"]
        assert tool.mode == 3  # mcp-tool + mcp-artifacts + mcp-logs
        assert "x" in tool.parameters.get("properties", {})
        assert "y" in tool.parameters.get("properties", {})

        # Now trigger via the real adapter
        result = await trigger_and_wait(
            tool.deployment_id,
            {"x": 100, "y": 200},
            mode=tool.mode,
        )

        assert result["status"] == "COMPLETED"
        assert len(result["tasks"]) == 3
        assert len(result["artifacts"]) == 2
        assert len(result["logs"]) > 0

        # Verify the math is correct
        table = next(a for a in result["artifacts"] if a["type"] == "table")
        results_by_op = {row["operation"]: row["result"] for row in table["data"]}
        assert results_by_op["sum"] == 300
        assert results_by_op["product"] == 20000
