/**
 * toolbar.js — content script for the Prefect admin UI
 *
 * Injects a native-looking "Model Context Protocol (AI)" row into the
 * deployment sidebar, following the p-key-value pattern used by
 * Schedules and Triggers. Pure logic lives in logic.js.
 *
 * Actual DOM structure (Prefect 3.x):
 *   div.p-layout-well.deployment
 *     div.p-layout-well__well
 *       div.deployment-details
 *         div.p-key-value  (Tags row)
 *         div.p-key-value  (Schedules row)
 *         div.p-divider
 *         div.p-key-value  (Triggers row)
 *         div.p-key-value  (Model Context Protocol row)  ← injected here
 *         div.p-divider
 *         ...
 *
 *   URL patterns:
 *     OSS:   http://localhost:4200/deployments/deployment/{uuid}
 *     Cloud: https://app.prefect.cloud/account/{acct}/workspace/{ws}/deployments/deployment/{uuid}
 *
 */

/* global parseDeploymentUrl, computeMode, authHeaders */

(() => {
  const POLL_INTERVAL_MS = 1500;
  const FETCH_TIMEOUT_MS = 15000;
  const ROW_ID = "mcp-row";

  const MODE_TAGS = [
    [],
    ["mcp-tool"],
    ["mcp-tool", "mcp-artifacts"],
    ["mcp-tool", "mcp-artifacts", "mcp-logs"],
  ];

  let currentUrl = "";
  let mcpRow = null;
  let deploymentCache = null; // { id, tags, apiBase }
  let latestRequestToken = 0;
  let updateInFlight = false;

  // ── API helpers ────────────────────────────────────────────────────────

  function getApiKey() {
    const match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1])).access_token ?? null;
    } catch {
      return null;
    }
  }

  async function fetchDeployment(apiBase, deploymentId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(`${apiBase}/deployments/${deploymentId}`, {
        headers: authHeaders(getApiKey()),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`GET deployment failed: ${resp.status}`);
      return resp.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("GET deployment timed out");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function patchDeploymentTags(apiBase, deploymentId, tags) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(`${apiBase}/deployments/${deploymentId}`, {
        method: "PATCH",
        headers: authHeaders(getApiKey()),
        signal: controller.signal,
        body: JSON.stringify({ tags }),
      });
      if (!resp.ok) throw new Error(`PATCH deployment failed: ${resp.status}`);
    } catch (err) {
      if (err.name === "AbortError") throw new Error("PATCH deployment timed out");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Row rendering ──────────────────────────────────────────────────────

  const MODE_CARDS = [
    {
      mode: 1,
      tag: "mcp-tool",
      tagClass: "mcp-tag-1",
      title: "Metadata",
      desc: "State, duration, task breakdown, and a Prefect Cloud link.",
      features: [
        { text: "Completion state & duration", on: true },
        { text: "Task names and states", on: true },
        { text: "Error messages", on: true },
        { text: "Prefect Cloud link", on: true },
      ],
    },
    {
      mode: 2,
      tag: "+ mcp-artifacts",
      tagClass: "mcp-tag-2",
      title: "Artifacts",
      desc: "Tables, markdown, and links. Structured data agents can reason over.",
      recommended: true,
      features: [
        { text: "Completion state & duration", on: true },
        { text: "Task names and states", on: true },
        { text: "Error messages", on: true },
        { text: "Prefect Cloud link", on: true },
        { text: "Table artifacts", on: true },
        { text: "Markdown & link artifacts", on: true },
      ],
    },
    {
      mode: 3,
      tag: "+ mcp-logs",
      tagClass: "mcp-tag-3",
      title: "Full Access",
      desc: "INFO+ log entries included. Use with caution — can be verbose.",
      features: [
        { text: "Completion state & duration", on: true },
        { text: "Task names and states", on: true },
        { text: "Error messages", on: true },
        { text: "Prefect Cloud link", on: true },
        { text: "Table artifacts", on: true },
        { text: "Markdown & link artifacts", on: true },
        { text: "INFO+ log entries", on: true },
        { text: "Full execution narrative", on: true },
      ],
    },
  ];

  const HB_TIERS = [
    { label: "Meta", cls: "hb-t1", minMode: 1 },
    { label: "Artifacts", cls: "hb-t2", minMode: 2 },
    { label: "Logs", cls: "hb-t3", minMode: 3 },
  ];

  function renderValue(tags) {
    if (!mcpRow) return;
    const value = mcpRow.querySelector(".p-key-value__value");
    if (!value) return;

    const { mode, active } = computeMode(tags);

    if (active) {
      const tilesHtml = HB_TIERS.map((t, i) => {
        const on = mode >= t.minMode;
        const conn =
          i > 0 ? `<div class="hb-conn${mode >= t.minMode ? " hb-conn-on" : ""}"></div>` : "";
        return `${conn}<span class="hb-tier${on ? ` hb-on ${t.cls}` : ""}">${t.label}</span>`;
      }).join("");
      value.innerHTML = `
        <div class="hb-row">
          <div class="hb-tiers">${tilesHtml}</div>
          <button class="p-button p-button--outline text-sm px-2 py-1 mcp-setup-btn">Setup</button>
        </div>
      `;
    } else {
      value.innerHTML = `
        <button class="p-button p-button--outline text-sm px-2 py-1 mcp-setup-btn">
          <div class="p-button__content">Enable</div>
        </button>
      `;
    }
    value.querySelector(".mcp-setup-btn").addEventListener("click", showSetupModal);
  }

  function showSetupModal() {
    // Remove existing modal if any
    const existing = document.querySelector(".mcp-modal-backdrop");
    if (existing) existing.remove();

    const currentMode = deploymentCache ? computeMode(deploymentCache.tags).mode : 0;

    const backdrop = document.createElement("div");
    backdrop.className = "mcp-modal-backdrop";
    backdrop.innerHTML = `
      <div class="mcp-modal">
        <div class="mcp-modal-header">
          <h2>Horizon Bridge Setup</h2>
          <button class="mcp-modal-close">&times;</button>
        </div>
        <p class="mcp-modal-subtitle">Control what data agents receive when they call this deployment. Each level is an explicit opt-in via tags.</p>
        <div class="mcp-modal-grid">
          ${MODE_CARDS.map(
            (card) => `
            <div class="mcp-mode-card${card.mode === currentMode ? " mcp-card-active" : ""}${card.recommended ? " mcp-card-recommended" : ""}" data-mode="${card.mode}">
              <div class="mcp-card-tag ${card.tagClass}">${card.tag}</div>
              <h3>${card.title}</h3>
              <p class="mcp-card-desc">${card.desc}</p>
              <ul class="mcp-card-features">
                ${card.features.map((f) => `<li class="${f.on ? "" : "mcp-feat-off"}">${f.text}</li>`).join("")}
              </ul>
            </div>
          `,
          ).join("")}
        </div>
        <div class="mcp-modal-footer">
          ${currentMode > 0 ? '<button class="mcp-modal-remove">Remove as Tool</button>' : "<span></span>"}
          <span style="font-size:12px;color:#64748b;">Click a card to apply</span>
        </div>
      </div>
    `;

    // Cleanup function to remove modal and event listener
    const onKey = (e) => {
      if (e.key === "Escape") {
        cleanupModal();
      }
    };

    const cleanupModal = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };

    // Close on backdrop click or close button
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) cleanupModal();
    });
    backdrop.querySelector(".mcp-modal-close").addEventListener("click", () => cleanupModal());

    // Card selection
    for (const card of backdrop.querySelectorAll(".mcp-mode-card")) {
      // Make keyboard accessible
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");

      card.addEventListener("click", () => {
        const mode = parseInt(card.dataset.mode, 10);
        cleanupModal();
        onSetMode(mode);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const mode = parseInt(card.dataset.mode, 10);
          cleanupModal();
          onSetMode(mode);
        }
      });
    }

    // Remove button
    const removeBtn = backdrop.querySelector(".mcp-modal-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        cleanupModal();
        onSetMode(0);
      });
    }

    // Listen for Escape key
    document.addEventListener("keydown", onKey);

    document.body.appendChild(backdrop);
  }

  function createMcpRow() {
    const el = document.createElement("div");
    el.id = ROW_ID;
    el.className = "p-key-value";
    el.innerHTML = `
      <div class="p-key-value__label">Horizon Bridge</div>
      <div class="p-key-value__value"></div>
    `;
    return el;
  }

  // ── Mode change ────────────────────────────────────────────────────────

  async function onSetMode(mode) {
    if (!deploymentCache || !mcpRow || updateInFlight) return;

    const { apiBase, id } = deploymentCache;
    const nonMcpTags = deploymentCache.tags.filter((t) => !t.startsWith("mcp-"));
    const newTags = [...nonMcpTags, ...MODE_TAGS[mode]];

    // Optimistic update
    deploymentCache.tags = newTags;
    renderValue(newTags);

    updateInFlight = true;
    try {
      await patchDeploymentTags(apiBase, id, newTags);
    } catch (err) {
      console.error("[MCP] Failed to update tags:", err);
      if (deploymentCache?.id === id) {
        try {
          const dep = await fetchDeployment(apiBase, id);
          if (deploymentCache?.id === id) {
            deploymentCache.tags = dep.tags || [];
            renderValue(deploymentCache.tags);
          }
        } catch {
          // Give up gracefully
        }
      }
    } finally {
      updateInFlight = false;
    }
  }

  // ── Injection ──────────────────────────────────────────────────────────

  async function injectRow(parsed) {
    if (mcpRow) {
      mcpRow.remove();
      mcpRow = null;
    }

    const token = ++latestRequestToken;

    try {
      const dep = await fetchDeployment(parsed.apiBase, parsed.deploymentId);
      if (token !== latestRequestToken) return;
      deploymentCache = { id: dep.id, tags: dep.tags || [], apiBase: parsed.apiBase };
    } catch (err) {
      console.error("[MCP] Could not fetch deployment:", err);
      return;
    }

    mcpRow = createMcpRow();
    renderValue(deploymentCache.tags);

    // Preferred: inject after the Triggers row inside .deployment-details
    const details = document.querySelector(".deployment-details");
    if (details) {
      let injected = false;
      for (const kv of details.querySelectorAll(".p-key-value")) {
        const label = kv.querySelector(".p-key-value__label");
        if (label && label.textContent.trim() === "Triggers") {
          kv.after(mcpRow);
          injected = true;
          break;
        }
      }
      if (!injected) details.append(mcpRow);
      return;
    }

    // Fallbacks
    const header = document.querySelector(".p-layout-well__header");
    if (header) {
      header.after(mcpRow);
      return;
    }
    document.body.prepend(mcpRow);
  }

  // ── Main loop — watches for SPA navigation ────────────────────────────

  async function check() {
    const url = window.location.href;
    const rowMisplaced = mcpRow && !mcpRow.closest(".deployment-details");
    if (url === currentUrl && !rowMisplaced) return;
    currentUrl = url;

    const parsed = parseDeploymentUrl(url);
    if (parsed) {
      // Wait briefly for SPA to finish rendering
      await new Promise((r) => setTimeout(r, 500));
      await injectRow(parsed);
    } else {
      if (mcpRow) {
        mcpRow.remove();
        mcpRow = null;
        deploymentCache = null;
      }
      latestRequestToken++;
    }
  }

  setInterval(check, POLL_INTERVAL_MS);
  check();
})();
