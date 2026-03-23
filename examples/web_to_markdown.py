"""Web page to Markdown flow — demonstrates Mode 2 with content extraction."""

import re

import html2text
import httpx
from prefect import flow, task
from prefect.artifacts import create_markdown_artifact, create_table_artifact


@task(log_prints=True)
def fetch_page(url: str) -> tuple[str, str]:
    """Fetch a web page and return (title, html)."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(url, headers={"User-Agent": "prefect-horizon-story/1.0"})
        response.raise_for_status()
    html = response.text
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else url
    print(f"Fetched {url} — {len(html):,} bytes, title: {title!r}")
    return title, html


@task(log_prints=True)
def convert_to_markdown(html: str) -> str:
    """Convert HTML to Markdown using html2text."""
    converter = html2text.HTML2Text()
    converter.ignore_links = False
    converter.ignore_images = True
    converter.body_width = 0  # no line wrapping
    markdown = converter.handle(html)
    print(f"Converted to Markdown: {len(markdown):,} chars")
    return markdown


@task(log_prints=True)
def publish_page_artifacts(url: str, title: str, markdown: str) -> dict:
    """Publish page content and metadata as Prefect artifacts."""
    words = markdown.split()
    links = re.findall(r"\[([^\]]+)\]\(([^)]+)\)", markdown)

    create_table_artifact(
        key="page-metadata",
        table=[
            {"property": "URL", "value": url},
            {"property": "Title", "value": title},
            {"property": "Word Count", "value": str(len(words))},
            {"property": "Links Found", "value": str(len(links))},
        ],
        description=f"Metadata for: {title}",
    )

    preview = markdown[:4000] + ("…" if len(markdown) > 4000 else "")
    create_markdown_artifact(
        key="page-content",
        markdown=f"# {title}\n\n**Source:** {url}\n\n---\n\n{preview}",
        description=f"Markdown content: {title}",
    )

    print(f"Published artifacts: {len(words):,} words, {len(links)} links")
    return {"word_count": len(words), "link_count": len(links)}


@flow(name="web-to-markdown", log_prints=True)
def web_to_markdown(url: str = "https://docs.prefect.io/") -> dict:
    """Fetch a web page, convert it to Markdown, and publish the content as artifacts."""
    title, html = fetch_page(url)
    markdown = convert_to_markdown(html)
    stats = publish_page_artifacts(url, title, markdown)
    return {"url": url, "title": title, **stats}
