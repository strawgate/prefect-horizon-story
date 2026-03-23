"""
Integration tests for the Prefect MCP Adapter.

These tests run against an ephemeral Prefect server (SQLite-backed, no Docker)
and exercise the full adapter pipeline: discovery -> schema -> tool registration
-> trigger -> response building.

The ephemeral server is started once per session via the `prefect_server` fixture
in conftest.py.
"""

from datetime import UTC

import pytest
from prefect.client.orchestration import get_client
from prefect.states import Completed, Failed

from adapter.config import ToolConfig, ToolOverride
from adapter.executor import _build_response
from adapter.provider import PrefectProvider, sanitize_tool_name
from tests.conftest import create_deployment as _create_deployment

# ===========================================================================
# Discovery Tests
# ===========================================================================


class TestDiscoveryIntegration:
    """Test that the adapter discovers tagged deployments from a real Prefect server."""

    @pytest.mark.asyncio
    async def test_discovers_mcp_tool_deployments(self, prefect_server):
        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "discover-me",
                tags=["mcp-tool"],
                schema={
                    "type": "object",
                    "properties": {
                        "region": {"type": "string"},
                    },
                    "required": ["region"],
                },
            )

        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        tool_name = sanitize_tool_name("discover-me")
        assert tool_name in tool_map
        assert tool_map[tool_name].deployment_id == str(dep_id)
        assert tool_map[tool_name].mode == 1

    @pytest.mark.asyncio
    async def test_ignores_untagged_deployments(self, prefect_server):
        async with get_client() as client:
            await _create_deployment(
                client,
                "no-mcp-tag",
                tags=["production"],
            )

        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "no_mcp_tag" not in tool_map

    @pytest.mark.asyncio
    async def test_detects_mode_from_tags(self, prefect_server):
        async with get_client() as client:
            await _create_deployment(
                client,
                "mode1-deploy",
                tags=["mcp-tool"],
            )
            await _create_deployment(
                client,
                "mode2-deploy",
                tags=["mcp-tool", "mcp-artifacts"],
            )
            await _create_deployment(
                client,
                "mode3-deploy",
                tags=["mcp-tool", "mcp-logs"],
            )

        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert tool_map["mode1_deploy"].mode == 1
        assert tool_map["mode2_deploy"].mode == 2
        assert tool_map["mode3_deploy"].mode == 3

    @pytest.mark.asyncio
    async def test_registers_tools_on_provider(self, prefect_server):
        async with get_client() as client:
            await _create_deployment(
                client,
                "registered-tool",
                tags=["mcp-tool"],
                schema={
                    "type": "object",
                    "properties": {
                        "x": {"type": "integer"},
                    },
                    "required": ["x"],
                },
            )

        provider = PrefectProvider()
        tools = await provider.list_tools()

        tool_map = {t.name: t for t in tools}
        assert "registered_tool" in tool_map
        assert tool_map["registered_tool"].name == "registered_tool"


# ===========================================================================
# Schema / Tool Function Tests (against real deployment schemas)
# ===========================================================================


class TestSchemaIntegration:
    """Test that real deployment schemas produce correct tool functions."""

    @pytest.mark.asyncio
    async def test_schema_roundtrip(self, prefect_server):
        """Deploy with a schema, discover it, verify the generated function signature."""
        schema = {
            "type": "object",
            "properties": {
                "org": {"type": "string"},
                "days": {"type": "integer", "default": 7},
                "verbose": {"type": "boolean", "default": False},
            },
            "required": ["org"],
        }

        async with get_client() as client:
            await _create_deployment(
                client,
                "schema-roundtrip",
                tags=["mcp-tool"],
                schema=schema,
            )

        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        tool = tool_map["schema_roundtrip"]

        # Verify the schema was preserved
        props = tool.parameters["properties"]
        assert props["org"]["type"] == "string"
        assert props["days"]["type"] == "integer"
        assert props["days"]["default"] == 7
        assert props["verbose"]["type"] == "boolean"

    @pytest.mark.asyncio
    async def test_empty_schema_deployment(self, prefect_server):
        """A deployment with no parameters should produce a no-arg tool."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "no-params-deploy",
                tags=["mcp-tool"],
                schema={"type": "object", "properties": {}},
            )

        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "no_params_deploy" in tool_map
        assert tool_map["no_params_deploy"].parameters["properties"] == {}


# ===========================================================================
# Executor / Response Building Tests (against real Prefect server)
# ===========================================================================


class TestExecutorIntegration:
    """Test trigger_and_wait and _build_response against the ephemeral server."""

    @pytest.mark.asyncio
    async def test_build_response_completed_run(self, prefect_server):
        """Create a flow run, mark it completed, verify _build_response output."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("response-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="response-test",
                tags=["mcp-tool"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )

            # Mark as completed
            await client.set_flow_run_state(flow_run.id, Completed())

            # Re-read so we get the updated state
            completed_run = await client.read_flow_run(flow_run.id)

            response = await _build_response(client, completed_run, mode=1)

        assert response["status"] == "COMPLETED"
        assert "tasks" in response
        assert "error" not in response

    @pytest.mark.asyncio
    async def test_build_response_failed_run(self, prefect_server):
        """A failed flow run should include an error message."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("fail-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="fail-test",
                tags=["mcp-tool"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )

            await client.set_flow_run_state(
                flow_run.id,
                Failed(message="Connection refused: db.internal:5432"),
            )

            failed_run = await client.read_flow_run(flow_run.id)
            response = await _build_response(client, failed_run, mode=1)

        assert response["status"] == "FAILED"
        assert "error" in response
        assert "Connection refused" in response["error"]

    @pytest.mark.asyncio
    async def test_build_response_mode1_no_artifacts_or_logs(self, prefect_server):
        """Mode 1 should NOT include artifacts or logs fields."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("mode1-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="mode1-test",
                tags=["mcp-tool"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )
            await client.set_flow_run_state(flow_run.id, Completed())
            run = await client.read_flow_run(flow_run.id)

            response = await _build_response(client, run, mode=1)

        assert "artifacts" not in response
        assert "logs" not in response

    @pytest.mark.asyncio
    async def test_build_response_mode2_includes_artifacts_field(self, prefect_server):
        """Mode 2 should attempt to fetch artifacts (even if none exist)."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("mode2-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="mode2-test",
                tags=["mcp-tool", "mcp-artifacts"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )
            await client.set_flow_run_state(flow_run.id, Completed())
            run = await client.read_flow_run(flow_run.id)

            response = await _build_response(client, run, mode=2)

        # No artifacts were created, so the field should be absent (not an empty list)
        # But there should be no artifacts_error either since the query succeeded
        assert "artifacts_error" not in response
        assert "logs" not in response  # Mode 2 doesn't include logs

    @pytest.mark.asyncio
    async def test_build_response_mode3_includes_logs_field(self, prefect_server):
        """Mode 3 should attempt to fetch logs."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("mode3-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="mode3-test",
                tags=["mcp-tool", "mcp-logs"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )

            # Write some logs for this flow run
            from datetime import datetime

            from prefect.client.schemas.actions import LogCreate

            now = datetime.now(UTC)
            await client.create_logs(
                [
                    LogCreate(
                        name="test-logger",
                        level=20,  # INFO
                        message="Processing started",
                        flow_run_id=flow_run.id,
                        timestamp=now,
                    ),
                    LogCreate(
                        name="test-logger",
                        level=10,  # DEBUG — should be filtered out
                        message="Debug detail",
                        flow_run_id=flow_run.id,
                        timestamp=now,
                    ),
                    LogCreate(
                        name="test-logger",
                        level=40,  # ERROR
                        message="Something went wrong",
                        flow_run_id=flow_run.id,
                        timestamp=now,
                    ),
                ]
            )

            await client.set_flow_run_state(flow_run.id, Completed())
            run = await client.read_flow_run(flow_run.id)

            response = await _build_response(client, run, mode=3)

        assert "logs" in response
        log_messages = [log["message"] for log in response["logs"]]
        assert "Processing started" in log_messages
        assert "Something went wrong" in log_messages
        # DEBUG should be filtered out (level < 20)
        assert "Debug detail" not in log_messages

        # Verify log levels are human-readable
        log_levels = {log["message"]: log["level"] for log in response["logs"]}
        assert log_levels["Processing started"] == "INFO"
        assert log_levels["Something went wrong"] == "ERROR"


# ===========================================================================
# Artifacts Integration Tests
# ===========================================================================


class TestArtifactsIntegration:
    """Test artifact fetching in Mode 2+ responses."""

    @pytest.mark.asyncio
    async def test_artifacts_returned_in_mode2(self, prefect_server):
        """Create artifacts for a flow run, verify they appear in Mode 2 response."""
        async with get_client() as client:
            flow_id = await client.create_flow_from_name("artifact-test-flow")
            dep_id = await client.create_deployment(
                flow_id=flow_id,
                name="artifact-test",
                tags=["mcp-tool", "mcp-artifacts"],
            )

            flow_run = await client.create_flow_run_from_deployment(
                deployment_id=dep_id,
                parameters={},
            )

            # Create artifacts associated with this flow run
            from prefect.client.schemas.actions import ArtifactCreate

            await client.create_artifact(
                ArtifactCreate(
                    key="test-table",
                    type="table",
                    description="Test table artifact",
                    data=[
                        {"region": "NA", "revenue": 500000},
                        {"region": "EU", "revenue": 250000},
                    ],
                    flow_run_id=flow_run.id,
                )
            )

            await client.create_artifact(
                ArtifactCreate(
                    key="test-markdown",
                    type="markdown",
                    description="Test markdown artifact",
                    data="## Summary\nAll good.",
                    flow_run_id=flow_run.id,
                )
            )

            await client.set_flow_run_state(flow_run.id, Completed())
            run = await client.read_flow_run(flow_run.id)

            response = await _build_response(client, run, mode=2)

        assert "artifacts" in response
        assert len(response["artifacts"]) == 2

        artifact_keys = {a["key"] for a in response["artifacts"]}
        assert "test-table" in artifact_keys
        assert "test-markdown" in artifact_keys

        # Verify table artifact data
        table_artifact = next(a for a in response["artifacts"] if a["key"] == "test-table")
        assert table_artifact["type"] == "table"
        assert len(table_artifact["data"]) == 2


# ===========================================================================
# End-to-End: Discovery → Tool Call → Response
# ===========================================================================


class TestEndToEnd:
    """
    Full pipeline test: create a deployment, discover it via provider, call the
    generated tool function, and verify the response.
    """

    @pytest.mark.asyncio
    async def test_full_pipeline_metadata_mode(self, prefect_server):
        """End-to-end: deploy → discover via provider → call tool → get metadata response."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "count": {"type": "integer", "default": 3},
            },
            "required": ["name"],
        }

        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "e2e-metadata",
                tags=["mcp-tool"],
                schema=schema,
                description="End-to-end test flow",
            )

        # Discover via provider
        provider = PrefectProvider()
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "e2e_metadata" in tool_map
        tool = tool_map["e2e_metadata"]
        assert tool.deployment_id == str(dep_id)
        assert tool.mode == 1

        # Verify the discovered tool is callable via run()
        from unittest.mock import AsyncMock, patch

        mock_result = {"status": "COMPLETED", "tasks": []}
        with patch("adapter.schema.trigger_and_wait", new_callable=AsyncMock) as mock_trigger:
            mock_trigger.return_value = mock_result
            result = await tool.run({"name": "world", "count": 5})

        mock_trigger.assert_called_once_with(
            deployment_id=str(dep_id),
            parameters={"name": "world", "count": 5},
            mode=1,
        )

        import json

        assert json.loads(result.content[0].text)["status"] == "COMPLETED"

    @pytest.mark.asyncio
    async def test_refresh_picks_up_new_deployments(self, prefect_server):
        """After initial discovery, new deployments appear on refresh."""
        provider = PrefectProvider()
        tools = await provider.refresh()
        initial_count = len(tools)

        # Add a new deployment
        async with get_client() as client:
            await _create_deployment(
                client,
                "late-arrival",
                tags=["mcp-tool"],
            )

        # Refresh
        tools = await provider.refresh()
        tool_map = {t.name: t for t in tools}
        assert len(tools) > initial_count
        assert "late_arrival" in tool_map

    @pytest.mark.asyncio
    async def test_refresh_removes_stale_deployments(self, prefect_server):
        """When a deployment loses its mcp-tool tag, it's removed on refresh."""
        provider = PrefectProvider()

        # Create a deployment with mcp-tool tag
        async with get_client() as client:
            dep_id = await _create_deployment(
                client,
                "soon-gone",
                tags=["mcp-tool"],
            )

        tools = await provider.refresh()
        tool_map = {t.name: t for t in tools}
        assert "soon_gone" in tool_map

        # Remove the mcp-tool tag by updating the deployment
        from prefect.client.schemas.actions import DeploymentUpdate

        async with get_client() as client:
            await client.update_deployment(
                deployment_id=dep_id,
                deployment=DeploymentUpdate(tags=[]),
            )

        # Refresh — the tool should be removed
        tools = await provider.refresh()
        tool_map = {t.name: t for t in tools}
        assert "soon_gone" not in tool_map


# ===========================================================================
# Config Integration Tests
# ===========================================================================


class TestConfigIntegration:
    """Test that config includes, excludes, and overrides work against a real server."""

    @pytest.mark.asyncio
    async def test_include_adds_untagged_deployment(self, prefect_server):
        """A deployment without mcp-tool tag should be included via config."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "untagged-pipeline",
                tags=[],  # no mcp-tool tag
                schema={"type": "object", "properties": {"x": {"type": "integer"}}},
            )

        config = ToolConfig(include=[ToolOverride(name="untagged-pipeline")])
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "untagged_pipeline" in tool_map

    @pytest.mark.asyncio
    async def test_include_glob_pattern(self, prefect_server):
        """Glob patterns in include should match multiple deployments."""
        async with get_client() as client:
            await _create_deployment(client, "etl-daily", tags=[])
            await _create_deployment(client, "etl-weekly", tags=[])

        config = ToolConfig(include=[ToolOverride(name="etl-*")])
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "etl_daily" in tool_map
        assert "etl_weekly" in tool_map

    @pytest.mark.asyncio
    async def test_exclude_removes_tagged_deployment(self, prefect_server):
        """A tagged deployment matching an exclude pattern should not be registered."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "staging-pipeline",
                tags=["mcp-tool"],
            )

        config = ToolConfig(exclude=["staging-*"])
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "staging_pipeline" not in tool_map

    @pytest.mark.asyncio
    async def test_override_tool_name(self, prefect_server):
        """Per-tool tool_name override should replace the sanitized name."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "my-complex-pipeline",
                tags=["mcp-tool"],
            )

        config = ToolConfig(
            include=[ToolOverride(name="my-complex-pipeline", tool_name="run_prod")]
        )
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "run_prod" in tool_map
        assert "my_complex_pipeline" not in tool_map

    @pytest.mark.asyncio
    async def test_override_description(self, prefect_server):
        """Per-tool description override should replace the deployment description."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "desc-override-test",
                tags=["mcp-tool"],
                description="Original description",
            )

        config = ToolConfig(
            include=[ToolOverride(name="desc-override-test", description="Custom description")]
        )
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert tool_map["desc_override_test"].description == "Custom description"

    @pytest.mark.asyncio
    async def test_override_mode(self, prefect_server):
        """Per-tool mode override should take precedence over tags."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "mode-override-test",
                tags=["mcp-tool"],  # tag-based mode would be 1
            )

        config = ToolConfig(include=[ToolOverride(name="mode-override-test", mode=3)])
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert tool_map["mode_override_test"].mode == 3

    @pytest.mark.asyncio
    async def test_default_mode_applies(self, prefect_server):
        """Config default mode should apply when tags don't set a higher mode."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "default-mode-test",
                tags=["mcp-tool"],  # tag-based mode would be 1
            )

        config = ToolConfig(defaults={"mode": 2})
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert tool_map["default_mode_test"].mode == 2

    @pytest.mark.asyncio
    async def test_tag_mode_overrides_default(self, prefect_server):
        """Tag-based mode > 1 should take precedence over config default mode."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "tag-wins-test",
                tags=["mcp-tool", "mcp-logs"],  # tag-based mode = 3
            )

        config = ToolConfig(defaults={"mode": 2})
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert tool_map["tag_wins_test"].mode == 3

    @pytest.mark.asyncio
    async def test_no_config_behaves_as_before(self, prefect_server):
        """Without config, behavior is identical to tag-only discovery."""
        async with get_client() as client:
            await _create_deployment(
                client,
                "no-config-test",
                tags=["mcp-tool"],
            )

        config = ToolConfig()  # empty config
        provider = PrefectProvider(config=config)
        tools = await provider.refresh()

        tool_map = {t.name: t for t in tools}
        assert "no_config_test" in tool_map
