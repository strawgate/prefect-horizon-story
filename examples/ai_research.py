"""PydanticAI research agent flow — demonstrates Mode 2 with structured output.

Requires:
    GOOGLE_API_KEY to be set (default model is Gemini 3.1 Pro Preview).
    Set PYDANTIC_AI_MODEL to use a different provider/model, e.g.:
        "openai:gpt-4o-mini"        (requires OPENAI_API_KEY)
        "anthropic:claude-3-5-haiku-latest"  (requires ANTHROPIC_API_KEY)
"""

import os

from prefect import flow, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact
from pydantic import BaseModel
from pydantic_ai import Agent

MODEL = os.environ.get("PYDANTIC_AI_MODEL", "google-gla:gemini-3.1-pro-preview")


class ResearchFinding(BaseModel):
    point: str
    confidence: str  # "high" | "medium" | "low"


class ResearchReport(BaseModel):
    summary: str
    key_findings: list[ResearchFinding]
    word_count_estimate: int


@task(log_prints=True)
async def run_research_agent(question: str) -> ResearchReport:
    """Run a PydanticAI agent to answer a research question with structured output."""
    # Load API key from Prefect secret block if not already set in the environment.
    if not os.environ.get("GOOGLE_API_KEY"):
        from prefect.blocks.system import Secret

        secret = await Secret.load("gemini-api-key")
        os.environ["GOOGLE_API_KEY"] = secret.get()

    agent = Agent(
        MODEL,
        output_type=ResearchReport,
        system_prompt=(
            "You are a research assistant. Answer questions with structured, factual findings. "
            "Rate each finding confidence as: high, medium, or low."
        ),
    )
    print(f"Running research agent ({MODEL}) on: {question}")
    result = await agent.run(question)
    report: ResearchReport = result.output
    print(f"Agent completed: {len(report.key_findings)} findings")
    return report


@task(log_prints=True)
def publish_research_artifacts(question: str, report: ResearchReport) -> None:
    """Publish research findings as Prefect artifacts."""
    create_table_artifact(
        key="research-findings",
        table=[{"finding": f.point, "confidence": f.confidence} for f in report.key_findings],
        description=f"Key findings for: {question}",
    )

    findings_md = "\n".join(
        f"- **{f.point}** *(confidence: {f.confidence})*" for f in report.key_findings
    )
    create_markdown_artifact(
        key="research-report",
        markdown=f"""## Research Report

**Question:** {question}

### Summary

{report.summary}

### Key Findings

{findings_md}

*Estimated word count: {report.word_count_estimate}*
""",
        description=f"Research report: {question[:60]}",
    )
    print(f"Published {len(report.key_findings)} findings as artifacts")


@flow(name="ai-research", log_prints=True)
async def ai_research(
    question: str = "What are the key benefits of workflow orchestration for AI agents?",
) -> dict:
    """Run a PydanticAI research agent and publish structured findings as artifacts."""
    report = await run_research_agent(question)
    publish_research_artifacts(question, report)
    return {
        "question": question,
        "summary": report.summary,
        "findings_count": len(report.key_findings),
    }
