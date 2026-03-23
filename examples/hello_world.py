"""Simplest possible flow — demonstrates Mode 1 (metadata only)."""

import time

from prefect import flow, task


@task(retries=2, log_prints=True)
def greet(name: str) -> str:
    print(f"Generating greeting for {name}")
    time.sleep(2)  # Simulate work
    return f"Hello, {name}!"


@flow(name="hello-world", log_prints=True)
def hello_world(name: str = "World") -> str:
    """A simple greeting workflow. Demonstrates MCP adapter with Mode 1."""
    greeting = greet(name)
    print(f"Result: {greeting}")
    return greeting
