"""
Load optional tool configuration from file or environment variable.

Config sources (first found wins):
    1. MCP_TOOL_CONFIG env var (JSON or YAML string)
    2. MCP_TOOL_CONFIG_FILE env var (path to YAML file)
    3. mcp-tools.yaml in working directory
    4. No config → empty defaults (tag-only discovery)
"""

import logging
import os
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_FILENAME = "mcp-tools.yaml"


@dataclass
class ToolOverride:
    """Per-deployment configuration override."""

    name: str  # deployment name or glob pattern
    tool_name: str | None = None
    description: str | None = None
    mode: int | None = None


@dataclass
class ToolConfig:
    """Top-level tool configuration."""

    include: list[ToolOverride] = field(default_factory=list)
    exclude: list[str] = field(default_factory=list)
    defaults: dict[str, Any] = field(default_factory=dict)

    @property
    def default_mode(self) -> int | None:
        """Default mode for tools that don't specify one via tags or overrides."""
        mode = self.defaults.get("mode")
        return int(mode) if mode is not None else None

    def is_excluded(self, deployment_name: str) -> bool:
        """Check if a deployment name matches any exclude pattern."""
        return any(fnmatch(deployment_name, pat) for pat in self.exclude)

    def find_override(self, deployment_name: str) -> ToolOverride | None:
        """Find the first matching include override for a deployment name."""
        for override in self.include:
            if fnmatch(deployment_name, override.name):
                return override
        return None


def load_config() -> ToolConfig:
    """Load tool configuration from env var, file, or defaults."""
    raw = _load_raw_config()
    if raw is None:
        return ToolConfig()
    return _parse_config(raw)


def _load_raw_config() -> dict | None:
    """Try each config source in priority order."""
    # 1. Inline env var (JSON or YAML string)
    config_str = os.environ.get("MCP_TOOL_CONFIG")
    if config_str:
        try:
            data = yaml.safe_load(config_str)
            if isinstance(data, dict):
                logger.info("Loaded tool config from MCP_TOOL_CONFIG env var")
                return data
        except yaml.YAMLError:
            logger.warning("MCP_TOOL_CONFIG env var contains invalid YAML/JSON — ignoring")

    # 2. File path from env var
    config_file = os.environ.get("MCP_TOOL_CONFIG_FILE")
    if config_file:
        path = Path(config_file)
        if path.is_file():
            try:
                data = yaml.safe_load(path.read_text())
                if isinstance(data, dict):
                    logger.info("Loaded tool config from %s", path)
                    return data
            except (yaml.YAMLError, OSError) as e:
                logger.warning("Failed to load config from %s: %s", path, e)
        else:
            logger.warning("MCP_TOOL_CONFIG_FILE=%s does not exist", config_file)

    # 3. Convention file in working directory
    default_path = Path(DEFAULT_CONFIG_FILENAME)
    if default_path.is_file():
        try:
            data = yaml.safe_load(default_path.read_text())
            if isinstance(data, dict):
                logger.info("Loaded tool config from %s", default_path)
                return data
        except (yaml.YAMLError, OSError) as e:
            logger.warning("Failed to load %s: %s", default_path, e)

    return None


def _parse_config(raw: dict) -> ToolConfig:
    """Parse a raw config dict into a ToolConfig."""
    include = []
    for entry in raw.get("include", []):
        if isinstance(entry, str):
            include.append(ToolOverride(name=entry))
        elif isinstance(entry, dict) and "name" in entry:
            mode = None
            if "mode" in entry:
                try:
                    mode = int(entry["mode"])
                except (TypeError, ValueError):
                    logger.warning(
                        "Invalid mode %r for include entry '%s' — ignoring",
                        entry["mode"],
                        entry["name"],
                    )
            include.append(
                ToolOverride(
                    name=entry["name"],
                    tool_name=entry.get("tool_name"),
                    description=entry.get("description"),
                    mode=mode,
                )
            )

    exclude = [str(e) for e in raw.get("exclude", []) if isinstance(e, str)]
    defaults = raw.get("defaults", {}) if isinstance(raw.get("defaults"), dict) else {}

    return ToolConfig(include=include, exclude=exclude, defaults=defaults)
