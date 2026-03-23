"""
Trigger Prefect deployments, wait for completion, and build MCP responses.
"""

import asyncio
import json
import logging
import os
from typing import Any
from uuid import UUID

from prefect.client.orchestration import get_client
from prefect.client.schemas.filters import (
    ArtifactFilter,
    ArtifactFilterFlowRunId,
    LogFilter,
    LogFilterFlowRunId,
    TaskRunFilter,
    TaskRunFilterFlowRunId,
)
from prefect.exceptions import FlowRunWaitTimeout
from prefect.flow_runs import wait_for_flow_run

logger = logging.getLogger(__name__)

# Configurable via environment
FLOW_RUN_TIMEOUT = int(os.environ.get("MCP_FLOW_TIMEOUT", "300"))
# Seconds to wait after flow completion for logs/tasks to flush to the API
POST_COMPLETION_DELAY = float(os.environ.get("MCP_POST_COMPLETION_DELAY", "2"))


async def trigger_and_wait(
    deployment_id: str,
    parameters: dict,
    mode: int,
) -> dict:
    """
    Trigger a Prefect deployment, wait for completion, and return results.

    This is the function that every PrefectTool.run() calls.
    """
    # 1. Trigger the flow run — client is released immediately after.
    async with get_client() as client:
        flow_run = await client.create_flow_run_from_deployment(
            deployment_id=UUID(deployment_id),
            parameters=parameters,
            tags=["mcp-triggered"],
        )

    # 2. Wait for completion (uses its own client internally).
    try:
        completed_run = await wait_for_flow_run(
            flow_run_id=flow_run.id,
            timeout=FLOW_RUN_TIMEOUT,
        )
    except FlowRunWaitTimeout:
        timeout_response: dict = {
            "status": "TIMEOUT",
            "message": (
                f"Flow run did not complete within {FLOW_RUN_TIMEOUT} seconds. "
                f"It may still be running."
            ),
            "flow_run_id": str(flow_run.id),
        }
        timeout_url = _flow_run_url(flow_run.id)
        if timeout_url:
            timeout_response["flow_run_url"] = timeout_url
        return timeout_response

    # 3. Brief delay for task runs and logs to flush to the API.
    #    The flow subprocess reports state asynchronously; without this,
    #    task/log queries can return incomplete results.
    if POST_COMPLETION_DELAY > 0:
        await asyncio.sleep(POST_COMPLETION_DELAY)

    # 4. Re-read the flow run for final timing data, then build the response.
    async with get_client() as client:
        completed_run = await client.read_flow_run(completed_run.id)
        return await _build_response(client, completed_run, mode)


async def _build_response(client, flow_run, mode: int) -> dict:
    """Assemble the MCP tool response from Prefect API data."""

    # Task runs (all modes)
    task_runs = await client.read_task_runs(
        task_run_filter=TaskRunFilter(flow_run_id=TaskRunFilterFlowRunId(any_=[flow_run.id]))
    )

    task_summaries = []
    for tr in sorted(
        task_runs,
        key=lambda t: t.start_time or t.expected_start_time or t.created,
    ):
        duration = None
        if tr.total_run_time:
            duration = round(tr.total_run_time.total_seconds(), 1)
        task_summaries.append(
            {
                "name": tr.name,
                "state": tr.state_type.value if tr.state_type else "UNKNOWN",
                "duration_seconds": duration,
            }
        )

    response: dict = {
        "status": flow_run.state_type.value if flow_run.state_type else "UNKNOWN",
        "tasks": task_summaries,
    }

    flow_run_url = _flow_run_url(flow_run.id)
    if flow_run_url:
        response["flow_run_url"] = flow_run_url

    # Duration
    if flow_run.total_run_time:
        response["duration_seconds"] = round(flow_run.total_run_time.total_seconds(), 1)

    # Error message for failed runs (always safe to include — state message, not traceback)
    if flow_run.state and flow_run.state.is_failed():
        response["error"] = flow_run.state.message or "Flow run failed"

    # Artifacts (Mode 2+)
    if mode >= 2:
        try:
            artifacts = await client.read_artifacts(
                artifact_filter=ArtifactFilter(
                    flow_run_id=ArtifactFilterFlowRunId(any_=[flow_run.id])
                )
            )
            if artifacts:
                response["artifacts"] = [
                    {
                        "key": a.key,
                        "type": a.type,
                        "description": a.description,
                        "data": _parse_artifact_data(a.data),
                    }
                    for a in artifacts
                ]
        except Exception:
            logger.exception("Failed to fetch artifacts for flow run %s", flow_run.id)
            response["artifacts_error"] = "Could not fetch artifacts"

    # Logs (Mode 3)
    if mode >= 3:
        try:
            logs = await client.read_logs(
                log_filter=LogFilter(flow_run_id=LogFilterFlowRunId(any_=[flow_run.id]))
            )
            if logs:
                response["logs"] = [
                    {
                        "level": _level_name(log.level),
                        "message": log.message,
                    }
                    for log in logs
                    if log.level >= 20  # INFO and above only
                ]
        except Exception:
            logger.exception("Failed to fetch logs for flow run %s", flow_run.id)
            response["logs_error"] = "Could not fetch logs"

    return response


def _parse_artifact_data(data: Any) -> Any:
    """Parse artifact data — tables are stored as JSON strings."""
    if isinstance(data, str):
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            pass
    return data


def _flow_run_url(flow_run_id) -> str | None:
    """Build Prefect UI URL for a flow run, or None if not determinable."""
    # Explicit UI base takes priority (works for any Prefect installation)
    ui_url = os.environ.get("PREFECT_UI_URL", "").rstrip("/")
    if ui_url:
        return f"{ui_url}/flow-runs/flow-run/{flow_run_id}"

    api_url = os.environ.get("PREFECT_API_URL", "")
    if "api.prefect.cloud" in api_url:
        parts = api_url.rstrip("/").split("/")
        try:
            acct_idx = parts.index("accounts") + 1
            ws_idx = parts.index("workspaces") + 1
            account_id = parts[acct_idx]
            workspace_id = parts[ws_idx]
            return (
                f"https://app.prefect.cloud/account/{account_id}"
                f"/workspace/{workspace_id}/flow-runs/flow-run/{flow_run_id}"
            )
        except (ValueError, IndexError):
            pass

    # Non-Cloud backend without PREFECT_UI_URL — can't determine the URL
    return None


def _level_name(level: int) -> str:
    """Convert Python log level int to name."""
    return logging.getLevelName(level)
