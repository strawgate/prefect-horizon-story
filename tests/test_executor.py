"""Tests for adapter.executor — response building and URL generation."""

from adapter.executor import _flow_run_url, _level_name


class TestLevelName:
    def test_standard_levels(self):
        assert _level_name(10) == "DEBUG"
        assert _level_name(20) == "INFO"
        assert _level_name(30) == "WARNING"
        assert _level_name(40) == "ERROR"
        assert _level_name(50) == "CRITICAL"

    def test_unknown_level(self):
        assert _level_name(25) == "Level 25"


class TestFlowRunUrl:
    def test_cloud_url_extraction(self, monkeypatch):
        monkeypatch.setenv(
            "PREFECT_API_URL",
            "https://api.prefect.cloud/api/accounts/acct-123/workspaces/ws-456",
        )
        monkeypatch.delenv("PREFECT_UI_URL", raising=False)
        url = _flow_run_url("run-789")
        assert url == (
            "https://app.prefect.cloud/account/acct-123/workspace/ws-456/flow-runs/flow-run/run-789"
        )

    def test_non_cloud_url_returns_none(self, monkeypatch):
        monkeypatch.setenv("PREFECT_API_URL", "http://localhost:4200/api")
        monkeypatch.delenv("PREFECT_UI_URL", raising=False)
        url = _flow_run_url("run-789")
        assert url is None

    def test_no_api_url_returns_none(self, monkeypatch):
        monkeypatch.delenv("PREFECT_API_URL", raising=False)
        monkeypatch.delenv("PREFECT_UI_URL", raising=False)
        url = _flow_run_url("run-789")
        assert url is None

    def test_explicit_ui_url(self, monkeypatch):
        monkeypatch.setenv("PREFECT_UI_URL", "https://prefect.mycompany.com")
        url = _flow_run_url("run-789")
        assert url == "https://prefect.mycompany.com/flow-runs/flow-run/run-789"

    def test_ui_url_takes_priority_over_cloud(self, monkeypatch):
        monkeypatch.setenv(
            "PREFECT_API_URL",
            "https://api.prefect.cloud/api/accounts/acct-123/workspaces/ws-456",
        )
        monkeypatch.setenv("PREFECT_UI_URL", "https://custom-ui.example.com")
        url = _flow_run_url("run-789")
        assert url == "https://custom-ui.example.com/flow-runs/flow-run/run-789"
