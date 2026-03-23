"""
Shared fixtures and helpers for integration tests.

Spins up an ephemeral Prefect server backed by a temporary SQLite database.
All adapter code automatically connects to this server via PREFECT_API_URL.
"""

from uuid import UUID

import pytest
from prefect.testing.utilities import prefect_test_harness


@pytest.fixture(scope="session")
def prefect_server():
    """
    Session-scoped ephemeral Prefect server.

    Starts once, shared across all tests. Uses a temp SQLite DB
    that is cleaned up automatically when the session ends.
    """
    with prefect_test_harness(server_startup_timeout=60):
        yield


async def create_deployment(
    client,
    name: str,
    tags: list[str],
    schema: dict | None = None,
    description: str | None = None,
) -> UUID:
    """Create a flow + deployment in the test server and return the deployment ID."""
    flow_id = await client.create_flow_from_name(f"flow-for-{name}")
    return await client.create_deployment(
        flow_id=flow_id,
        name=name,
        tags=tags,
        parameter_openapi_schema=schema or {"type": "object", "properties": {}},
        description=description,
    )
