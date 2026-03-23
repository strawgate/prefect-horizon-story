"""Tests for tool name sanitization and mode detection."""

from adapter.provider import determine_mode, sanitize_tool_name


class TestSanitizeToolName:
    def test_simple_name(self):
        assert sanitize_tool_name("hello-world") == "hello_world"

    def test_name_with_slashes(self):
        assert sanitize_tool_name("my-pipeline/production") == "my_pipeline_production"

    def test_name_starting_with_number(self):
        assert sanitize_tool_name("3d-render") == "wf_3d_render"

    def test_collapse_underscores(self):
        assert sanitize_tool_name("a--b__c") == "a_b_c"

    def test_uppercase_to_lower(self):
        assert sanitize_tool_name("MyFlow") == "myflow"

    def test_special_characters(self):
        assert sanitize_tool_name("flow@v2.1!") == "flow_v2_1"


class TestDetermineMode:
    def test_mode_1_default(self):
        assert determine_mode(["mcp-tool"]) == 1

    def test_mode_2_artifacts(self):
        assert determine_mode(["mcp-tool", "mcp-artifacts"]) == 2

    def test_mode_3_logs(self):
        assert determine_mode(["mcp-tool", "mcp-logs"]) == 3

    def test_mode_3_logs_and_artifacts(self):
        assert determine_mode(["mcp-tool", "mcp-artifacts", "mcp-logs"]) == 3

    def test_extra_tags_ignored(self):
        assert determine_mode(["mcp-tool", "production", "v2"]) == 1

    def test_empty_tags(self):
        assert determine_mode([]) == 1
