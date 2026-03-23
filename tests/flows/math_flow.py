"""
Test flow that actually does work — used by integration tests.

Exercises tasks, artifacts, logs, and typed parameters.
"""

from prefect import flow, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact


@task(log_prints=True)
def add_numbers(a: int, b: int) -> int:
    """Add two numbers."""
    print(f"Adding {a} + {b}")
    result = a + b
    print(f"Result: {result}")
    return result


@task(log_prints=True)
def multiply_numbers(a: int, b: int) -> int:
    """Multiply two numbers."""
    print(f"Multiplying {a} * {b}")
    result = a * b
    print(f"Result: {result}")
    return result


@task(log_prints=True)
def build_report(sum_result: int, product_result: int) -> dict:
    """Build a summary report and create artifacts."""
    report = {
        "sum": sum_result,
        "product": product_result,
        "combined": sum_result + product_result,
    }

    create_table_artifact(
        key="math-results",
        table=[
            {"operation": "sum", "result": sum_result},
            {"operation": "product", "result": product_result},
            {"operation": "combined", "result": sum_result + product_result},
        ],
        description="Math operation results",
    )

    create_markdown_artifact(
        key="math-summary",
        markdown=(
            f"## Math Report\n\n"
            f"- **Sum:** {sum_result}\n"
            f"- **Product:** {product_result}\n"
            f"- **Combined:** {sum_result + product_result}\n"
        ),
        description="Summary of math operations",
    )

    print(f"Report generated: {report}")
    return report


@flow(name="math-workflow", log_prints=True)
def math_workflow(x: int = 3, y: int = 5) -> dict:
    """A multi-task workflow that does math and creates artifacts."""
    sum_result = add_numbers(x, y)
    product_result = multiply_numbers(x, y)
    return build_report(sum_result, product_result)


@flow(name="failing-workflow", log_prints=True)
def failing_workflow(message: str = "Something broke") -> None:
    """A flow that always fails — for testing error handling."""
    print(f"About to fail with: {message}")
    raise RuntimeError(message)
