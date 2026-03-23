"""Flow with table + markdown artifacts — demonstrates Mode 2."""

import random

from prefect import flow, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact


@task(log_prints=True)
def fetch_sales_data(quarter: str) -> list[dict]:
    """Simulate fetching sales data."""
    regions = ["NA", "EU", "APAC", "LATAM"]
    data = [
        {
            "region": r,
            "revenue": random.randint(100000, 900000),
            "deals": random.randint(10, 100),
        }
        for r in regions
    ]
    print(f"Fetched sales data for {quarter}: {len(data)} regions")
    return data


@task(log_prints=True)
def generate_report(quarter: str, data: list[dict]) -> dict:
    """Generate report and publish artifacts."""
    total_revenue = sum(d["revenue"] for d in data)
    total_deals = sum(d["deals"] for d in data)
    top_region = max(data, key=lambda d: d["revenue"])

    create_table_artifact(
        key="sales-by-region",
        table=data,
        description=f"{quarter} sales breakdown by region",
    )

    summary = (
        f"## {quarter} Sales Summary\n\n"
        f"**Total Revenue:** ${total_revenue:,}\n\n"
        f"**Total Deals:** {total_deals}\n\n"
        f"**Top Region:** {top_region['region']} (${top_region['revenue']:,})\n"
    )
    create_markdown_artifact(
        key="sales-summary",
        markdown=summary,
        description=f"{quarter} executive summary",
    )

    print(f"Report generated: ${total_revenue:,} across {len(data)} regions")
    return {"total_revenue": total_revenue, "total_deals": total_deals}


@flow(name="quarterly-sales-report", log_prints=True)
def quarterly_sales_report(quarter: str = "Q4", year: int = 2025) -> dict:
    """Generate a quarterly sales report with regional breakdown."""
    data = fetch_sales_data(f"{quarter} {year}")
    return generate_report(f"{quarter} {year}", data)
