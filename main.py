"""
Prefect MCP Adapter — every tagged Prefect deployment becomes an MCP tool.

Usage:
    fastmcp run main.py                           # local development
    fastmcp install main.py --name prefect-tools   # add to Claude Desktop

Environment variables:
    PREFECT_API_URL  — Prefect Cloud workspace URL
    PREFECT_API_KEY  — Prefect Cloud API key
    MCP_FLOW_TIMEOUT — Max seconds to wait for a flow run (default: 300)
    MCP_POST_COMPLETION_DELAY — Seconds to wait after flow completes for logs to flush (default: 2)
    MCP_TOOL_CONFIG  — Inline JSON/YAML tool config (for Prefect Cloud / environments without files)
    MCP_TOOL_CONFIG_FILE — Path to a YAML tool config file
"""

import logging

from fastmcp import Context, FastMCP
from mcp.types import ToolListChangedNotification

from adapter.provider import PrefectProvider
from adapter.schema import PrefectTool

logger = logging.getLogger(__name__)

provider = PrefectProvider()

mcp = FastMCP(
    "Prefect Workflows",
    instructions=(
        "This server exposes Prefect Cloud workflow deployments as tools. "
        "Each tool triggers a real workflow on remote infrastructure, waits "
        "for it to complete, and returns the results. Tools may take 10-300 "
        "seconds to complete. Use list_workflows to see what's available."
    ),
)

# Mount the provider at root (no namespace) so tools appear at top level.
# FastMCP calls get_tasks() on all providers at startup — so PrefectTool
# instances get Docket-registered before lifespan, enabling background task
# execution (SEP-1686) for long-running flows.
mcp.add_provider(provider)


# ── Meta-tools (always present) ──────────────────────────────────────────


@mcp.tool()
async def list_workflows() -> dict:
    """List all Prefect workflows available as tools, with their parameters."""
    tools = await provider.list_tools()
    return {
        "workflow_count": len(tools),
        "workflows": [
            {
                "tool_name": tool.name,
                "deployment_name": tool.deployment_name,
                "description": tool.description,
                "parameters": tool.parameters,
                "response_mode": tool.mode,
            }
            for tool in tools
            if isinstance(tool, PrefectTool)
        ],
    }


@mcp.tool()
async def refresh_workflows(ctx: Context) -> dict:
    """Re-scan Prefect Cloud for new or removed deployments."""
    tools = await provider.refresh()
    try:
        await ctx.send_notification(
            ToolListChangedNotification(method="notifications/tools/list_changed")
        )
    except Exception:
        logger.warning("Could not send tool-list-changed notification", exc_info=True)
    return {"tools_registered": len(tools)}
