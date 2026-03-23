"""Database analytics report flow — demonstrates Mode 2 with SQL query results."""

import random
import sqlite3
from datetime import UTC, datetime, timedelta

from prefect import flow, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact


@task(log_prints=True)
def run_sales_queries(period_days: int) -> dict:
    """Seed an in-memory SQLite DB and run three analytics queries."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row

    conn.executescript("""
        CREATE TABLE products (
            id         INTEGER PRIMARY KEY,
            name       TEXT    NOT NULL,
            category   TEXT    NOT NULL,
            unit_price REAL    NOT NULL
        );
        CREATE TABLE sales (
            id         INTEGER PRIMARY KEY,
            product_id INTEGER REFERENCES products(id),
            quantity   INTEGER NOT NULL,
            sale_date  TEXT    NOT NULL
        );
    """)

    products = [
        (1, "Widget Pro", "Hardware", 49.99),
        (2, "Widget Lite", "Hardware", 19.99),
        (3, "DataSync", "Software", 99.99),
        (4, "CloudVault", "Software", 149.99),
        (5, "Support Plan", "Services", 299.99),
    ]
    conn.executemany("INSERT INTO products VALUES (?, ?, ?, ?)", products)

    base_date = datetime.now(UTC).date()
    sales = [
        (
            i + 1,
            random.randint(1, 5),
            random.randint(1, 20),
            str(base_date - timedelta(days=random.randint(0, period_days - 1))),
        )
        for i in range(200)
    ]
    conn.executemany("INSERT INTO sales VALUES (?, ?, ?, ?)", sales)
    conn.commit()

    by_category = [
        dict(r)
        for r in conn.execute("""
            SELECT p.category,
                   COUNT(s.id)                             AS transactions,
                   SUM(s.quantity)                         AS units_sold,
                   ROUND(SUM(s.quantity * p.unit_price), 2) AS revenue
            FROM sales s JOIN products p ON s.product_id = p.id
            GROUP BY p.category
            ORDER BY revenue DESC
        """)
    ]

    top_products = [
        dict(r)
        for r in conn.execute("""
            SELECT p.name,
                   SUM(s.quantity)                         AS units_sold,
                   ROUND(SUM(s.quantity * p.unit_price), 2) AS revenue
            FROM sales s JOIN products p ON s.product_id = p.id
            GROUP BY p.id
            ORDER BY revenue DESC
            LIMIT 5
        """)
    ]

    conn.close()
    print(f"Queried {len(by_category)} categories, {len(top_products)} products from 200 records")
    return {"by_category": by_category, "top_products": top_products}


@task(log_prints=True)
def publish_report_artifacts(results: dict, period_days: int) -> None:
    """Publish query results as Prefect artifacts."""
    by_category = results["by_category"]
    top_products = results["top_products"]

    create_table_artifact(
        key="revenue-by-category",
        table=by_category,
        description=f"Revenue by category — last {period_days} days",
    )
    create_table_artifact(
        key="top-products",
        table=top_products,
        description=f"Top products by revenue — last {period_days} days",
    )

    total_revenue = sum(r["revenue"] for r in by_category)
    total_transactions = sum(r["transactions"] for r in by_category)
    category_rows = "\n".join(
        f"| {r['category']} | {r['transactions']} | {r['units_sold']} | ${r['revenue']:,.2f} |"
        for r in by_category
    )
    create_markdown_artifact(
        key="sales-summary",
        markdown=f"""## Sales Analytics Report

**Period:** Last {period_days} days
**Total Revenue:** ${total_revenue:,.2f}
**Total Transactions:** {total_transactions}

### Revenue by Category

| Category | Transactions | Units Sold | Revenue |
|----------|-------------|-----------|---------|
{category_rows}
""",
        description=f"Sales summary — last {period_days} days",
    )
    print(f"Published artifacts: ${total_revenue:,.2f} total revenue")


@flow(name="database-report", log_prints=True)
def database_report(period_days: int = 90) -> dict:
    """Query a SQLite sales database and publish revenue analytics as artifacts."""
    results = run_sales_queries(period_days)
    publish_report_artifacts(results, period_days)
    total_revenue = sum(r["revenue"] for r in results["by_category"])
    return {
        "period_days": period_days,
        "total_revenue": total_revenue,
        "categories": len(results["by_category"]),
    }
