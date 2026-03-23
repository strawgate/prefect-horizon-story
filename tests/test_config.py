"""Tests for adapter.config — config loading and parsing."""

import json

from adapter.config import ToolConfig, ToolOverride, _parse_config, load_config


class TestToolConfig:
    def test_empty_config(self):
        config = ToolConfig()
        assert config.include == []
        assert config.exclude == []
        assert config.default_mode is None

    def test_default_mode(self):
        config = ToolConfig(defaults={"mode": 2})
        assert config.default_mode == 2

    def test_is_excluded_exact(self):
        config = ToolConfig(exclude=["staging-pipeline"])
        assert config.is_excluded("staging-pipeline")
        assert not config.is_excluded("production-pipeline")

    def test_is_excluded_glob(self):
        config = ToolConfig(exclude=["staging-*", "*-test"])
        assert config.is_excluded("staging-etl")
        assert config.is_excluded("my-pipeline-test")
        assert not config.is_excluded("production-etl")

    def test_find_override_exact(self):
        override = ToolOverride(name="my-pipeline", mode=3)
        config = ToolConfig(include=[override])
        assert config.find_override("my-pipeline") is override
        assert config.find_override("other-pipeline") is None

    def test_find_override_glob(self):
        override = ToolOverride(name="etl-*", mode=2)
        config = ToolConfig(include=[override])
        assert config.find_override("etl-daily") is override
        assert config.find_override("ml-pipeline") is None

    def test_find_override_returns_first_match(self):
        o1 = ToolOverride(name="etl-*", mode=2)
        o2 = ToolOverride(name="etl-daily", mode=3)
        config = ToolConfig(include=[o1, o2])
        assert config.find_override("etl-daily") is o1


class TestParseConfig:
    def test_full_config(self):
        raw = {
            "include": [
                {
                    "name": "my-pipeline",
                    "tool_name": "run_pipe",
                    "description": "Run it",
                    "mode": 3,
                },
                {"name": "etl-*"},
            ],
            "exclude": ["staging-*"],
            "defaults": {"mode": 2},
        }
        config = _parse_config(raw)
        assert len(config.include) == 2
        assert config.include[0].name == "my-pipeline"
        assert config.include[0].tool_name == "run_pipe"
        assert config.include[0].description == "Run it"
        assert config.include[0].mode == 3
        assert config.include[1].name == "etl-*"
        assert config.include[1].tool_name is None
        assert config.exclude == ["staging-*"]
        assert config.default_mode == 2

    def test_string_include_entries(self):
        raw = {"include": ["my-pipeline", "other-pipeline"]}
        config = _parse_config(raw)
        assert len(config.include) == 2
        assert config.include[0].name == "my-pipeline"
        assert config.include[1].name == "other-pipeline"

    def test_empty_raw(self):
        config = _parse_config({})
        assert config.include == []
        assert config.exclude == []
        assert config.default_mode is None

    def test_invalid_defaults_ignored(self):
        config = _parse_config({"defaults": "not-a-dict"})
        assert config.defaults == {}


class TestLoadConfig:
    def test_env_var_json(self, monkeypatch):
        config_json = json.dumps(
            {
                "include": [{"name": "my-pipeline", "mode": 3}],
                "exclude": ["staging-*"],
            }
        )
        monkeypatch.setenv("MCP_TOOL_CONFIG", config_json)
        monkeypatch.delenv("MCP_TOOL_CONFIG_FILE", raising=False)

        config = load_config()
        assert len(config.include) == 1
        assert config.include[0].name == "my-pipeline"
        assert config.include[0].mode == 3
        assert config.exclude == ["staging-*"]

    def test_env_var_yaml(self, monkeypatch):
        config_yaml = "include:\n  - name: my-pipeline\n    mode: 2\n"
        monkeypatch.setenv("MCP_TOOL_CONFIG", config_yaml)
        monkeypatch.delenv("MCP_TOOL_CONFIG_FILE", raising=False)

        config = load_config()
        assert len(config.include) == 1
        assert config.include[0].mode == 2

    def test_env_var_invalid_yaml(self, monkeypatch):
        monkeypatch.setenv("MCP_TOOL_CONFIG", ": : : invalid")
        monkeypatch.delenv("MCP_TOOL_CONFIG_FILE", raising=False)

        config = load_config()
        assert config.include == []  # falls through to empty

    def test_file_path_env_var(self, monkeypatch, tmp_path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text('include:\n  - name: "file-pipeline"\n')
        monkeypatch.delenv("MCP_TOOL_CONFIG", raising=False)
        monkeypatch.setenv("MCP_TOOL_CONFIG_FILE", str(config_file))

        config = load_config()
        assert len(config.include) == 1
        assert config.include[0].name == "file-pipeline"

    def test_missing_file_path(self, monkeypatch):
        monkeypatch.delenv("MCP_TOOL_CONFIG", raising=False)
        monkeypatch.setenv("MCP_TOOL_CONFIG_FILE", "/nonexistent/config.yaml")

        config = load_config()
        assert config.include == []

    def test_no_config_returns_empty(self, monkeypatch, tmp_path):
        monkeypatch.delenv("MCP_TOOL_CONFIG", raising=False)
        monkeypatch.delenv("MCP_TOOL_CONFIG_FILE", raising=False)
        # Ensure no mcp-tools.yaml in cwd
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config.include == []
        assert config.exclude == []
        assert config.default_mode is None

    def test_env_var_takes_priority_over_file(self, monkeypatch, tmp_path):
        """MCP_TOOL_CONFIG should be used even if MCP_TOOL_CONFIG_FILE is also set."""
        config_file = tmp_path / "config.yaml"
        config_file.write_text('include:\n  - name: "from-file"\n')
        monkeypatch.setenv("MCP_TOOL_CONFIG_FILE", str(config_file))
        monkeypatch.setenv("MCP_TOOL_CONFIG", '{"include": [{"name": "from-env"}]}')

        config = load_config()
        assert config.include[0].name == "from-env"
