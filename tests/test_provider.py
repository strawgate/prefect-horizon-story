"""
Unit and integration tests for PrefectProvider.

These tests run against an ephemeral Prefect server (SQLite-backed, no Docker)
and verify that PrefectProvider correctly discovers, lists, and executes tools.
"""

import pytest
from prefect.client.orchestration import get_client

from adapter.config import ToolConfig, ToolOverride
from adapter.provider import PrefectProvider
from adapter.schema import PrefectTool
from tests.conftest import create_deployment as _create_deployment

# ===========================================================================
# Provider Discovery Tests
# ===========================================================================


class TestListToolsDiscovery:
    """Test that PrefectProvider.list_tools() discovers tagged deployments."""

    @pytest.mark.asyncio
    async def test_list_tools_discovers_tagged_deployments(self, prefect_server):
        """provider.list_tools() returns tools for mcp-tool-tagged deployments."""
        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "provider-discover-me",
                tags=["mcp-tool"],
                schema={
                    "type": "object",
                    "properties": {"region": {"type": "string"}},
                    "required": ["region"],
                },
            )

        provider = PrefectProvider()
        tools = await provider.list_tools()

        tool_map = {t.name: t for t in tools}
        assert "provider_discover_me" in tool_map

        tool = tool_map["provider_discover_me"]
        assert isinstance(tool, PrefectTool)
        assert tool.deployment_id == str(dep_id)
        assert tool.mode == 1

    @pytest.mark.asyncio
    async def test_list_tools_respects_config_exclude(self, prefect_server):
        """Excluded deployments should not appear in list_tools()."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "provider-excluded-pipeline",
                tags=["mcp-tool"],
            )

        config = ToolConfig(exclude=["provider-excluded-*"])
        provider = PrefectProvider(config=config)
        tools = await provider.list_tools()

        tool_names = {t.name for t in tools}
        assert "provider_excluded_pipeline" not in tool_names

    @pytest.mark.asyncio
    async def test_list_tools_config_include_untagged(self, prefect_server):
        """Untagged deployments appear in list_tools() when included via config."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "provider-untagged-deploy",
                tags=[],
                schema={"type": "object", "properties": {"x": {"type": "integer"}}},
            )

        config = ToolConfig(include=[ToolOverride(name="provider-untagged-deploy")])
        provider = PrefectProvider(config=config)
        tools = await provider.list_tools()

        tool_names = {t.name for t in tools}
        assert "provider_untagged_deploy" in tool_names

    @pytest.mark.asyncio
    async def test_list_tools_detects_mode_from_tags(self, prefect_server):
        """Tool mode is inferred from deployment tags."""
        async with get_client() as client:
            await _create_deployment(client, "provider-mode1", tags=["mcp-tool"])
            await _create_deployment(client, "provider-mode2", tags=["mcp-tool", "mcp-artifacts"])
            await _create_deployment(client, "provider-mode3", tags=["mcp-tool", "mcp-logs"])

        provider = PrefectProvider()
        tools = await provider.list_tools()
        tool_map = {t.name: t for t in tools}

        assert tool_map["provider_mode1"].mode == 1
        assert tool_map["provider_mode2"].mode == 2
        assert tool_map["provider_mode3"].mode == 3


# ===========================================================================
# Tool Execution Tests
# ===========================================================================


class TestCallTool:
    """Test that tools discovered by the provider call trigger_and_wait correctly."""

    @pytest.mark.asyncio
    async def test_call_tool_triggers_flow(self, prefect_server):
        """Tool.run() invokes trigger_and_wait with correct arguments."""
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }

        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "provider-callable",
                tags=["mcp-tool"],
                schema=schema,
            )

        provider = PrefectProvider()
        await provider._refresh()

        tool = provider._tools.get("provider_callable")
        assert tool is not None

        from unittest.mock import AsyncMock, patch

        mock_result = {"status": "COMPLETED", "tasks": []}
        with patch("adapter.schema.trigger_and_wait", new_callable=AsyncMock) as mock_trigger:
            mock_trigger.return_value = mock_result
            result = await tool.run({"name": "test"})

        mock_trigger.assert_called_once_with(
            deployment_id=str(dep_id),
            parameters={"name": "test"},
            mode=1,
        )

        import json

        assert json.loads(result.content[0].text)["status"] == "COMPLETED"

    @pytest.mark.asyncio
    async def test_call_tool_unknown_not_in_tools(self, prefect_server):
        """An unregistered tool name is absent from provider._tools."""
        provider = PrefectProvider()
        await provider._refresh()

        assert provider._tools.get("this_tool_does_not_exist_xyz") is None


# ===========================================================================
# Refresh / Stale Tool Removal Tests
# ===========================================================================


class TestRefresh:
    """Test that _refresh() handles additions and removals correctly."""

    @pytest.mark.asyncio
    async def test_refresh_removes_stale_tools(self, prefect_server):
        """When a deployment loses its mcp-tool tag, it disappears on next refresh."""
        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "provider-soon-gone",
                tags=["mcp-tool"],
            )

        provider = PrefectProvider()
        await provider._refresh()
        assert "provider_soon_gone" in provider._tools

        # Remove the tag
        from prefect.client.schemas.actions import DeploymentUpdate

        async with get_client() as client:
            await client.update_deployment(
                deployment_id=dep_id,
                deployment=DeploymentUpdate(tags=[]),
            )

        # Refresh again — stale tool should be removed
        await provider._refresh()
        assert "provider_soon_gone" not in provider._tools

    @pytest.mark.asyncio
    async def test_refresh_adds_new_deployments(self, prefect_server):
        """Newly tagged deployments appear after the next refresh."""
        provider = PrefectProvider()
        await provider._refresh()
        initial_names = set(provider._tools)

        async with get_client() as client:
            await _create_deployment(
                client,
                "provider-late-arrival",
                tags=["mcp-tool"],
            )

        await provider._refresh()
        assert "provider_late_arrival" in provider._tools
        assert len(provider._tools) > len(initial_names)


# ===========================================================================
# Background Task Support Tests
# ===========================================================================


class TestGetTasks:
    """Test that get_tasks() returns task-enabled PrefectTool instances."""

    @pytest.mark.asyncio
    async def test_get_tasks_returns_task_enabled_tools(self, prefect_server):
        """get_tasks() returns PrefectTools with task_config that supports tasks."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "provider-taskable",
                tags=["mcp-tool"],
            )

        provider = PrefectProvider()
        tasks = await provider.get_tasks()

        task_names = {t.name for t in tasks}
        assert "provider_taskable" in task_names

        for task in tasks:
            assert task.task_config.supports_tasks(), (
                f"Tool '{task.name}' should support tasks but task_config.mode="
                f"{task.task_config.mode!r}"
            )

    @pytest.mark.asyncio
    async def test_prefect_tool_task_config_is_optional(self, prefect_server):
        """Every PrefectTool defaults to task_config mode='optional'."""
        from fastmcp.server.tasks.config import TaskConfig

        async with get_client() as client:
            await _create_deployment(
                client,
                "provider-task-mode",
                tags=["mcp-tool"],
            )

        provider = PrefectProvider()
        await provider._refresh()

        for tool in provider._tools.values():
            assert isinstance(tool.task_config, TaskConfig)
            assert tool.task_config.mode == "optional"
