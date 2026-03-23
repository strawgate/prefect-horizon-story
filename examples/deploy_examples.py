"""Deploy example flows to Prefect Cloud with MCP tags."""

import os

from prefect.runner.storage import GitRepository
from prefect_github import GitHubCredentials

from examples.ai_research import ai_research
from examples.database_report import database_report
from examples.hello_world import hello_world
from examples.sales_report import quarterly_sales_report
from examples.web_to_markdown import web_to_markdown

WORK_POOL = os.environ.get("PREFECT_WORK_POOL", "default")
REPO_URL = os.environ.get("PREFECT_REPO_URL", "https://github.com/strawgate/prefect-horizon-story.git")
REPO_BRANCH = os.environ.get("PREFECT_REPO_BRANCH", "main")
# GitHubCredentials block name — required for private repos; leave unset for public repos.
# Create once with: GitHubCredentials(token=<gh auth token>).save("prefect-horizon-story-ro")
CREDENTIALS_BLOCK = os.environ.get("PREFECT_GITHUB_CREDENTIALS_BLOCK", "")

if __name__ == "__main__":
    # Load credentials if a block name is set; omit for public repos.
    credentials = GitHubCredentials.load(CREDENTIALS_BLOCK) if CREDENTIALS_BLOCK else None

    source = GitRepository(
        url=REPO_URL,
        branch=REPO_BRANCH,
        credentials=credentials,
    )

    # Mode 1: metadata only
    hello_world.from_source(
        source=source,
        entrypoint="examples/hello_world.py:hello_world",
    ).deploy(
        name="hello-world",
        work_pool_name=WORK_POOL,
        tags=["mcp-tool"],
    )
    print("Deployed hello-world (Mode 1)")

    # Mode 2: metadata + artifacts
    quarterly_sales_report.from_source(
        source=source,
        entrypoint="examples/sales_report.py:quarterly_sales_report",
    ).deploy(
        name="quarterly-sales-report",
        work_pool_name=WORK_POOL,
        tags=["mcp-tool", "mcp-artifacts"],
    )
    print("Deployed quarterly-sales-report (Mode 2)")

    # Mode 2: PydanticAI research agent
    ai_research.from_source(
        source=source,
        entrypoint="examples/ai_research.py:ai_research",
    ).deploy(
        name="ai-research",
        work_pool_name=WORK_POOL,
        tags=["mcp-tool", "mcp-artifacts"],
        job_variables={
            "pip_packages": [
                "pydantic-ai>=0.0.14",
                "google-genai>=1.0.0",
            ]
        },
    )
    print("Deployed ai-research (Mode 2)")

    # Mode 2: SQLite database analytics report
    database_report.from_source(
        source=source,
        entrypoint="examples/database_report.py:database_report",
    ).deploy(
        name="database-report",
        work_pool_name=WORK_POOL,
        tags=["mcp-tool", "mcp-artifacts"],
    )
    print("Deployed database-report (Mode 2)")

    # Mode 2: Web page to Markdown
    web_to_markdown.from_source(
        source=source,
        entrypoint="examples/web_to_markdown.py:web_to_markdown",
    ).deploy(
        name="web-to-markdown",
        work_pool_name=WORK_POOL,
        tags=["mcp-tool", "mcp-artifacts"],
        job_variables={
            "pip_packages": [
                "httpx>=0.27.0",
                "html2text>=2020.1.16",
            ]
        },
    )
    print("Deployed web-to-markdown (Mode 2)")
