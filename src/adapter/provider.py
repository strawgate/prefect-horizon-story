"""
PrefectProvider — a FastMCP Provider subclass that exposes Prefect deployments as tools.

Unlike the lifespan-based approach, this provider:
- Discovers deployments on demand (list_tools / get_tasks calls _refresh())
- Gets registered with Docket at startup via get_tasks() — before lifespan runs
- Supports FastMCP's async task protocol (SEP-1686) so long-running flows don't
  block the MCP conversation
"""

import asyncio
import logging
import re
from fnmatch import fnmatch

from fastmcp.server.providers.base import Provider
from prefect.client.orchestration import get_client
from prefect.client.schemas.filters import (
    DeploymentFilter,
    DeploymentFilterTags,
)

from adapter.config import ToolConfig, load_config
from adapter.schema import PrefectTool

logger = logging.getLogger(__name__)


def sanitize_tool_name(name: str) -> str:
    """
    Convert a Prefect deployment name to a valid MCP tool name.

    'my-etl-pipeline/production' -> 'my_etl_pipeline_production'
    """
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    clean = re.sub(r"_+", "_", clean).strip("_")
    if not clean:
        clean = "wf_tool"
    elif clean[0].isdigit():
        clean = f"wf_{clean}"
    return clean.lower()


def determine_mode(tags: list[str]) -> int:
    """
    Determine response mode from deployment tags.

    Mode 1 (default): mcp-tool only — metadata
    Mode 2: mcp-tool + mcp-artifacts — metadata + artifacts
    Mode 3: mcp-tool + mcp-logs — metadata + artifacts + logs
    """
    tag_set = set(tags)
    if "mcp-logs" in tag_set:
        return 3
    if "mcp-artifacts" in tag_set:
        return 2
    return 1


async def _fetch_deployments(config: ToolConfig) -> list:
    """
    Fetch all relevant deployments from the Prefect API.

    Always fetches mcp-tool-tagged deployments. If the config has include
    patterns, also fetches all deployments and appends any untagged matches.
    """
    async with get_client() as client:
        tagged = await client.read_deployments(
            deployment_filter=DeploymentFilter(tags=DeploymentFilterTags(all_=["mcp-tool"]))
        )
        include_patterns = [inc.name for inc in config.include]
        if not include_patterns:
            return tagged
        all_deps = await client.read_deployments()

    tagged_ids = {d.id for d in tagged}
    extra = [
        d
        for d in all_deps
        if d.id not in tagged_ids
        and any(fnmatch(d.name, pat) for pat in include_patterns)
    ]
    return [*tagged, *extra]


def _build_tool(dep, config: ToolConfig) -> PrefectTool | None:
    """
    Build a PrefectTool for a single deployment.

    Returns None if the deployment is excluded by config.
    """
    if config.is_excluded(dep.name):
        logger.info("Excluding deployment '%s' via config", dep.name)
        return None

    override = config.find_override(dep.name)

    tool_name = (
        override.tool_name
        if override and override.tool_name
        else sanitize_tool_name(dep.name)
    )

    # Mode priority: per-tool override > tags > config default > 1
    tag_mode = determine_mode(dep.tags or [])
    mode = (
        override.mode if (override and override.mode is not None)
        else tag_mode if tag_mode > 1
        else config.default_mode or 1
    )

    description = (
        (override.description if override and override.description else None)
        or dep.description
        or f"Run the '{dep.name}' workflow on Prefect."
    )
    schema = dep.parameter_openapi_schema or {"type": "object", "properties": {}}

    return PrefectTool(
        name=tool_name,
        description=description,
        parameters=schema,
        deployment_id=str(dep.id),
        deployment_name=dep.name,
        mode=mode,
    )


class PrefectProvider(Provider):
    """FastMCP Provider that exposes Prefect deployments as MCP tools.

    Discovers tagged (and config-included) Prefect deployments on every tool
    listing request. Tools are backed by PrefectTool instances that call
    trigger_and_wait() when invoked.

    Because get_tasks() calls _list_tools() at server startup, all discovered
    tools are registered with Docket before lifespan runs — enabling background
    task execution (SEP-1686) for long-running flows.
    """

    def __init__(self, config: ToolConfig | None = None) -> None:
        super().__init__()
        self._config = config or load_config()
        self._tools: dict[str, PrefectTool] = {}
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        """Discover deployments and replace self._tools. Idempotent."""
        config = self._config
        deployments = await _fetch_deployments(config)

        new_tools: dict[str, PrefectTool] = {}
        # Track which deployment ID claimed each tool name in this scan
        name_sources: dict[str, tuple] = {}

        for dep in deployments:
            tool = _build_tool(dep, config)
            if tool is None:
                continue

            # Collision detection: two different deployments mapping to the same tool name
            if tool.name in name_sources and name_sources[tool.name][0] != dep.id:
                prev_id, prev_name = name_sources[tool.name]
                logger.warning(
                    "Tool name collision: deployment '%s' (%s) and '%s' (%s) "
                    "both map to '%s' — skipping '%s'",
                    prev_name,
                    prev_id,
                    dep.name,
                    dep.id,
                    tool.name,
                    dep.name,
                )
                continue

            name_sources[tool.name] = (dep.id, dep.name)
            new_tools[tool.name] = tool

        self._tools = new_tools

    async def refresh(self) -> list[PrefectTool]:
        """Re-discover deployments and return the current tool list.

        Public entry point for callers outside the provider
        (e.g. the refresh_workflows meta-tool). Delegates to _list_tools()
        which already handles locking and refresh.
        """
        return await self._list_tools()

    async def _list_tools(self) -> list[PrefectTool]:
        """Discover Prefect deployments and return them as PrefectTool instances.

        Called by FastMCP for tools/list and by get_tasks() at startup for
        Docket registration. Acquires a lock to prevent concurrent refreshes.
        """
        async with self._lock:
            await self._refresh()
            return list(self._tools.values())

    async def _get_tool(self, name: str, version=None) -> PrefectTool | None:  # noqa: ARG002
        """Look up a tool by name from the local cache.

        Overrides the base class default, which would call _list_tools() —
        and therefore _refresh() — on every tool invocation. Instead we serve
        from self._tools directly, falling back to a refresh only if the cache
        is cold (e.g. first call before any list_tools request).
        """
        if not self._tools:
            await self._list_tools()
        return self._tools.get(name)
