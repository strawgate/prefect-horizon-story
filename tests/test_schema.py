"""Tests for adapter.schema — PrefectTool creation and execution."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from adapter.schema import PrefectTool


class TestPrefectTool:
    def test_basic_construction(self):
        """PrefectTool can be constructed with a JSON schema."""
        schema = {
            "type": "object",
            "properties": {
                "org": {"type": "string"},
                "days": {"type": "integer", "default": 7},
            },
            "required": ["org"],
        }

        tool = PrefectTool(
            name="test_flow",
            description="A test flow",
            parameters=schema,
            deployment_id="dep-123",
            deployment_name="test-flow",
            mode=1,
        )

        assert tool.name == "test_flow"
        assert tool.description == "A test flow"
        assert tool.parameters == schema
        assert tool.deployment_id == "dep-123"
        assert tool.deployment_name == "test-flow"
        assert tool.mode == 1

    def test_schema_preserved_exactly(self):
        """The JSON schema is passed through without transformation."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "User name"},
                "count": {"type": "integer", "minimum": 1},
                "ratio": {"type": "number"},
                "active": {"type": "boolean"},
                "items": {"type": "array", "items": {"type": "string"}},
                "config": {"type": "object"},
            },
            "required": ["name", "count"],
        }

        tool = PrefectTool(
            name="typed_flow",
            description="Test",
            parameters=schema,
            deployment_id="fake-id",
            deployment_name="typed-flow",
            mode=1,
        )

        # Schema is stored as-is — no type mapping or transformation
        assert tool.parameters["properties"]["name"]["description"] == "User name"
        assert tool.parameters["properties"]["count"]["minimum"] == 1
        assert tool.parameters["properties"]["items"]["items"] == {"type": "string"}
        assert tool.parameters["required"] == ["name", "count"]

    def test_empty_schema(self):
        """A deployment with no parameters creates a valid tool."""
        schema = {"type": "object", "properties": {}}

        tool = PrefectTool(
            name="no_params",
            description="Test",
            parameters=schema,
            deployment_id="fake-id",
            deployment_name="no-params",
            mode=1,
        )

        assert tool.parameters["properties"] == {}

    @pytest.mark.asyncio
    async def test_run_calls_trigger_and_wait(self):
        """run() calls trigger_and_wait with the correct arguments."""
        schema = {
            "type": "object",
            "properties": {"region": {"type": "string"}},
            "required": ["region"],
        }

        tool = PrefectTool(
            name="my_flow",
            description="Test",
            parameters=schema,
            deployment_id="dep-123",
            deployment_name="my-flow",
            mode=2,
        )

        mock_result = {"status": "COMPLETED", "tasks": []}

        with patch("adapter.schema.trigger_and_wait", new_callable=AsyncMock) as mock_trigger:
            mock_trigger.return_value = mock_result
            result = await tool.run({"region": "NA"})

        mock_trigger.assert_called_once_with(
            deployment_id="dep-123",
            parameters={"region": "NA"},
            mode=2,
        )

        # Result is serialized to JSON in ToolResult
        assert json.loads(result.content[0].text) == mock_result

    @pytest.mark.asyncio
    async def test_run_passes_arguments_directly(self):
        """Arguments dict is passed straight to trigger_and_wait — no filtering."""
        tool = PrefectTool(
            name="filter_flow",
            description="Test",
            parameters={"type": "object", "properties": {"name": {"type": "string"}}},
            deployment_id="fake-id",
            deployment_name="filter-flow",
            mode=1,
        )

        with patch("adapter.schema.trigger_and_wait", new_callable=AsyncMock) as mock_trigger:
            mock_trigger.return_value = {"status": "COMPLETED"}
            await tool.run({"name": "test", "extra": "value"})

        # Arguments are passed as-is — MCP protocol handles schema validation
        mock_trigger.assert_called_once_with(
            deployment_id="fake-id",
            parameters={"name": "test", "extra": "value"},
            mode=1,
        )

    def test_description_stored(self):
        """Description is stored on the tool for MCP clients."""
        description = "Run the 'doc-flow' workflow on Prefect."
        tool = PrefectTool(
            name="doc_flow",
            description=description,
            parameters={"type": "object", "properties": {}},
            deployment_id="fake-id",
            deployment_name="doc-flow",
            mode=1,
        )

        assert tool.description == description

    def test_keyword_param_names_in_schema(self):
        """Python keywords in schema property names are fine — no codegen."""
        schema = {
            "type": "object",
            "properties": {
                "class": {"type": "string"},
                "import": {"type": "string", "default": "default"},
            },
            "required": ["class"],
        }

        tool = PrefectTool(
            name="keyword_flow",
            description="Test",
            parameters=schema,
            deployment_id="fake-id",
            deployment_name="keyword-flow",
            mode=1,
        )

        # Schema preserved as-is — 'class' and 'import' are fine in JSON schema
        assert "class" in tool.parameters["properties"]
        assert "import" in tool.parameters["properties"]
