/**
 * Pure logic for the Prefect MCP Chrome Extension.
 *
 * All functions here are side-effect-free and independently testable.
 * toolbar.js imports and uses these; unit tests validate them directly.
 */

// ── Constants ────────────────────────────────────────────────────────────

const MCP_TAGS = [
  { tag: "mcp-tool", label: "MCP Tool" },
  { tag: "mcp-artifacts", label: "Artifacts" },
  { tag: "mcp-logs", label: "Logs" },
];

// ── URL parsing ──────────────────────────────────────────────────────────

/**
 * Parse a Prefect deployment detail URL.
 * Returns { type, deploymentId, apiBase } or null.
 *
 * Supports:
 *   OSS:   http://localhost:4200/deployments/deployment/{uuid}
 *   Cloud: https://app.prefect.cloud/account/{acct}/workspace/{ws}/deployments/deployment/{uuid}
 */
function parseDeploymentUrl(url) {
  // Cloud pattern
  const cloud = url.match(
    /app\.prefect\.cloud\/account\/([^/]+)\/workspace\/([^/]+)\/deployments\/deployment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  );
  if (cloud) {
    return {
      type: "cloud",
      deploymentId: cloud[3],
      apiBase: `https://api.prefect.cloud/api/accounts/${cloud[1]}/workspaces/${cloud[2]}`,
    };
  }

  // OSS pattern — any host with /deployments/deployment/{uuid}
  const oss = url.match(
    /^(https?:\/\/[^/]+)\/deployments\/deployment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  );
  if (oss) {
    return {
      type: "oss",
      deploymentId: oss[2],
      apiBase: `${oss[1]}/api`,
    };
  }

  return null;
}

// ── Tag logic ────────────────────────────────────────────────────────────

/**
 * Compute the new tag set after toggling a tag.
 *
 * Rules:
 * - Toggling mcp-tool OFF removes all mcp-* tags
 * - Toggling mcp-artifacts or mcp-logs ON auto-adds mcp-tool if missing
 * - Non-MCP tags are always preserved
 *
 * @param {string[]} currentTags - Current tag list
 * @param {string} toggleTag - The tag being toggled
 * @returns {string[]} New tag list
 */
function computeTagToggle(currentTags, toggleTag) {
  const tags = [...currentTags];

  if (toggleTag === "mcp-tool" && tags.includes("mcp-tool")) {
    // Turning off mcp-tool removes all mcp-* tags
    return tags.filter((t) => !t.startsWith("mcp-"));
  }

  if (tags.includes(toggleTag)) {
    // Simple toggle off
    return tags.filter((t) => t !== toggleTag);
  }

  // Toggle on — ensure mcp-tool is present for artifact/log tags
  if ((toggleTag === "mcp-artifacts" || toggleTag === "mcp-logs") && !tags.includes("mcp-tool")) {
    tags.push("mcp-tool");
  }
  tags.push(toggleTag);
  return tags;
}

/**
 * Determine the MCP mode from a set of tags.
 * Returns { mode: number, active: boolean }.
 */
function computeMode(tags) {
  const tagSet = new Set(tags);
  const active = tagSet.has("mcp-tool");
  if (!active) return { mode: 0, active: false };
  if (tagSet.has("mcp-logs")) return { mode: 3, active: true };
  if (tagSet.has("mcp-artifacts")) return { mode: 2, active: true };
  return { mode: 1, active: true };
}

/**
 * Build auth headers for API requests.
 * @param {string|null} apiKey
 */
function authHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

// ── Exports ──────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MCP_TAGS,
    parseDeploymentUrl,
    computeTagToggle,
    computeMode,
    authHeaders,
  };
}
