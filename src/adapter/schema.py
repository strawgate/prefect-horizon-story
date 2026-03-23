"""
PrefectTool — an MCP Tool backed by a Prefect deployment.

Instead of generating Python functions with exec() for FastMCP to introspect,
we subclass Tool directly and pass the deployment's JSON schema as-is.
"""

import json
from typing import Any

from fastmcp.server.tasks.config import TaskConfig
from fastmcp.tools.tool import Tool, ToolResult
from pydantic import Field

from adapter.executor import trigger_and_wait


class PrefectTool(Tool):
    """An MCP tool that triggers a Prefect deployment and returns results."""

    deployment_id: str
    deployment_name: str
    mode: int
    task_config: TaskConfig = Field(default_factory=lambda: TaskConfig(mode="optional"))

    async def run(self, arguments: dict[str, Any]) -> ToolResult:
        result = await trigger_and_wait(
            deployment_id=self.deployment_id,
            parameters=arguments,
            mode=self.mode,
        )
        return ToolResult(content=json.dumps(result, default=str))
