/**
 * Unit tests for prefect-app/logic.js
 *
 * Run: node --test chrome-extension/prefect-app/logic.test.js
 * No dependencies — uses Node's built-in test runner.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDeploymentUrl,
  computeTagToggle,
  computeMode,
  authHeaders,
  MCP_TAGS,
} = require("./logic.js");

// ── parseDeploymentUrl ───────────────────────────────────────────────────

describe("parseDeploymentUrl", () => {
  it("parses OSS localhost URL", () => {
    const result = parseDeploymentUrl(
      "http://localhost:4200/deployments/deployment/48504b2f-096d-4d6d-a699-3230f70da50c",
    );
    assert.deepEqual(result, {
      type: "oss",
      deploymentId: "48504b2f-096d-4d6d-a699-3230f70da50c",
      apiBase: "http://localhost:4200/api",
    });
  });

  it("parses OSS 127.0.0.1 URL", () => {
    const result = parseDeploymentUrl(
      "http://127.0.0.1:4200/deployments/deployment/48504b2f-096d-4d6d-a699-3230f70da50c",
    );
    assert.deepEqual(result, {
      type: "oss",
      deploymentId: "48504b2f-096d-4d6d-a699-3230f70da50c",
      apiBase: "http://127.0.0.1:4200/api",
    });
  });

  it("parses OSS custom host URL", () => {
    const result = parseDeploymentUrl(
      "http://prefect.internal:8080/deployments/deployment/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    assert.deepEqual(result, {
      type: "oss",
      deploymentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      apiBase: "http://prefect.internal:8080/api",
    });
  });

  it("parses Cloud URL", () => {
    const result = parseDeploymentUrl(
      "https://app.prefect.cloud/account/abc-123/workspace/def-456/deployments/deployment/48504b2f-096d-4d6d-a699-3230f70da50c",
    );
    assert.deepEqual(result, {
      type: "cloud",
      deploymentId: "48504b2f-096d-4d6d-a699-3230f70da50c",
      apiBase: "https://api.prefect.cloud/api/accounts/abc-123/workspaces/def-456",
    });
  });

  it("returns null for deployment list page", () => {
    assert.equal(parseDeploymentUrl("http://localhost:4200/deployments"), null);
  });

  it("returns null for non-deployment page", () => {
    assert.equal(parseDeploymentUrl("http://localhost:4200/flows"), null);
  });

  it("returns null for partial UUID", () => {
    assert.equal(
      parseDeploymentUrl("http://localhost:4200/deployments/deployment/not-a-uuid"),
      null,
    );
  });

  it("Cloud URL takes priority over OSS pattern", () => {
    const url =
      "https://app.prefect.cloud/account/a1/workspace/w1/deployments/deployment/48504b2f-096d-4d6d-a699-3230f70da50c";
    const result = parseDeploymentUrl(url);
    assert.equal(result.type, "cloud");
  });
});

// ── computeTagToggle ─────────────────────────────────────────────────────

describe("computeTagToggle", () => {
  it("toggles mcp-tool ON from empty tags", () => {
    const result = computeTagToggle([], "mcp-tool");
    assert.deepEqual(result, ["mcp-tool"]);
  });

  it("toggles mcp-tool ON preserving existing tags", () => {
    const result = computeTagToggle(["production", "v2"], "mcp-tool");
    assert.deepEqual(result, ["production", "v2", "mcp-tool"]);
  });

  it("toggles mcp-tool OFF removes all mcp-* tags", () => {
    const result = computeTagToggle(
      ["production", "mcp-tool", "mcp-artifacts", "mcp-logs"],
      "mcp-tool",
    );
    assert.deepEqual(result, ["production"]);
  });

  it("toggles mcp-artifacts ON auto-adds mcp-tool", () => {
    const result = computeTagToggle(["production"], "mcp-artifacts");
    assert.deepEqual(result, ["production", "mcp-tool", "mcp-artifacts"]);
  });

  it("toggles mcp-logs ON auto-adds mcp-tool", () => {
    const result = computeTagToggle([], "mcp-logs");
    assert.deepEqual(result, ["mcp-tool", "mcp-logs"]);
  });

  it("toggles mcp-artifacts ON when mcp-tool already present", () => {
    const result = computeTagToggle(["mcp-tool"], "mcp-artifacts");
    assert.deepEqual(result, ["mcp-tool", "mcp-artifacts"]);
  });

  it("toggles mcp-artifacts OFF", () => {
    const result = computeTagToggle(["mcp-tool", "mcp-artifacts"], "mcp-artifacts");
    assert.deepEqual(result, ["mcp-tool"]);
  });

  it("toggles mcp-logs OFF preserves other mcp tags", () => {
    const result = computeTagToggle(["mcp-tool", "mcp-artifacts", "mcp-logs"], "mcp-logs");
    assert.deepEqual(result, ["mcp-tool", "mcp-artifacts"]);
  });

  it("does not mutate input array", () => {
    const original = ["mcp-tool", "mcp-artifacts"];
    const copy = [...original];
    computeTagToggle(original, "mcp-logs");
    assert.deepEqual(original, copy);
  });

  it("preserves non-mcp tags when toggling mcp-tool off", () => {
    const result = computeTagToggle(
      ["staging", "mcp-tool", "critical", "mcp-artifacts"],
      "mcp-tool",
    );
    assert.deepEqual(result, ["staging", "critical"]);
  });
});

// ── computeMode ──────────────────────────────────────────────────────────

describe("computeMode", () => {
  it("returns mode 0 when no mcp-tool", () => {
    assert.deepEqual(computeMode([]), { mode: 0, active: false });
  });

  it("returns mode 0 for non-mcp tags", () => {
    assert.deepEqual(computeMode(["production"]), { mode: 0, active: false });
  });

  it("returns mode 1 for mcp-tool only", () => {
    assert.deepEqual(computeMode(["mcp-tool"]), { mode: 1, active: true });
  });

  it("returns mode 2 for mcp-tool + mcp-artifacts", () => {
    assert.deepEqual(computeMode(["mcp-tool", "mcp-artifacts"]), {
      mode: 2,
      active: true,
    });
  });

  it("returns mode 3 for mcp-tool + mcp-logs", () => {
    assert.deepEqual(computeMode(["mcp-tool", "mcp-logs"]), {
      mode: 3,
      active: true,
    });
  });

  it("returns mode 3 when both mcp-artifacts and mcp-logs present", () => {
    assert.deepEqual(computeMode(["mcp-tool", "mcp-artifacts", "mcp-logs"]), {
      mode: 3,
      active: true,
    });
  });

  it("ignores non-mcp tags", () => {
    assert.deepEqual(computeMode(["production", "mcp-tool", "v2"]), {
      mode: 1,
      active: true,
    });
  });
});

// ── authHeaders ──────────────────────────────────────────────────────────

describe("authHeaders", () => {
  it("includes Content-Type always", () => {
    const headers = authHeaders(null);
    assert.equal(headers["Content-Type"], "application/json");
  });

  it("omits Authorization when no key", () => {
    const headers = authHeaders(null);
    assert.equal(headers.Authorization, undefined);
  });

  it("includes Authorization with Bearer when key provided", () => {
    const headers = authHeaders("pnu_test123");
    assert.equal(headers.Authorization, "Bearer pnu_test123");
  });
});

// ── MCP_TAGS constant ────────────────────────────────────────────────────

describe("MCP_TAGS", () => {
  it("has exactly 3 entries", () => {
    assert.equal(MCP_TAGS.length, 3);
  });

  it("contains mcp-tool, mcp-artifacts, mcp-logs", () => {
    const tags = MCP_TAGS.map((t) => t.tag);
    assert.deepEqual(tags, ["mcp-tool", "mcp-artifacts", "mcp-logs"]);
  });

  it("every entry has a label", () => {
    for (const entry of MCP_TAGS) {
      assert.ok(entry.label, `${entry.tag} should have a label`);
    }
  });
});
