/**
 * horizon-workflows.js
 *
 * Injects a "Workflows" sidebar group + "Create Workflow" wizard into Horizon Cloud
 * server management pages (/chain-of-action/servers/<name>/*).
 *
 * API flow:
 *  1. Extract serverName from URL
 *  2. POST _serverFn/c4a10a1… with {orgSlug, projectName} → {orgId, serverId}
 *  3. GET /api/v0/organizations/{orgId}/servers/{serverId}/manifest? → tool list
 *  4. Generate typed Prefect flow code and show wizard
 */
(() => {
  // ── Constants ──────────────────────────────────────────────────────────────

  const NAV_ID = "hwf-nav-group";
  const WIZARD_ID = "hwf-wizard";
  const STYLE_ID = "hwf-styles";
  const ORG_SLUG = "chain-of-action";

  // TanStack server function that returns {id (serverId), orgId, name, ...}
  // given {orgSlug, projectName}.
  const SERVER_INFO_FN = "c4a10a155a105e0326d9482074add33484581bbf5153f16982ac8d76d28e1b51";

  // ── Styles ─────────────────────────────────────────────────────────────────

  const CSS = `
#${WIZARD_ID} {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--background);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  overflow-y: auto;
}
.hwf-card {
  background: var(--card);
  border: 1px solid oklch(1 0 0 / 0.08);
  border-radius: 12px;
  box-shadow: rgba(0,0,0,0.3) 0px 8px 32px;
  width: 100%;
  max-width: 720px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.hwf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hwf-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}
.hwf-server-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
  background: var(--muted);
  border-radius: 20px;
  padding: 3px 10px;
  font-family: monospace;
}
.hwf-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted-foreground);
  font-size: 20px;
  line-height: 1;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.hwf-close:hover { color: var(--foreground); background: var(--accent); }
.hwf-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  margin-bottom: 10px;
}
.hwf-name-input {
  width: 100%;
  height: 38px;
  background: var(--background);
  border: 1px solid oklch(1 0 0 / 0.15);
  border-radius: 6px;
  color: var(--foreground);
  font-size: 14px;
  padding: 0 12px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
}
.hwf-name-input:focus { border-color: var(--ring); }
.hwf-tools-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hwf-tool-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--background);
  border: 1px solid oklch(1 0 0 / 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.hwf-tool-row:hover { border-color: oklch(1 0 0 / 0.15); background: var(--accent); }
.hwf-tool-row input[type=checkbox] { margin-top: 2px; accent-color: var(--sidebar-primary); flex-shrink: 0; }
.hwf-tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  font-family: monospace;
}
.hwf-tool-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
  line-height: 1.4;
}
.hwf-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.hwf-btn-back {
  background: none;
  border: 1px solid oklch(1 0 0 / 0.15);
  border-radius: 6px;
  color: var(--muted-foreground);
  font-size: 14px;
  font-weight: 500;
  padding: 0 16px;
  height: 38px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.hwf-btn-back:hover { color: var(--foreground); border-color: oklch(1 0 0 / 0.3); }
.hwf-btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  padding: 0 20px;
  height: 38px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.hwf-btn-primary:hover { opacity: 0.88; }
.hwf-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.hwf-code-block {
  position: relative;
  background: oklch(0.12 0 0);
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: 8px;
  overflow: hidden;
}
.hwf-code-block pre {
  margin: 0;
  padding: 16px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: oklch(0.9 0 0);
  overflow-x: auto;
  white-space: pre;
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
}
.hwf-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--accent);
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: 5px;
  color: var(--foreground);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.hwf-copy-btn:hover { background: oklch(0.4 0 0); }
.hwf-copy-btn.copied { color: oklch(0.7 0.15 145); }
.hwf-cmd-block {
  display: flex;
  align-items: center;
  gap: 10px;
  background: oklch(0.12 0 0);
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: 8px;
  padding: 10px 14px;
}
.hwf-cmd-block code {
  flex: 1;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: oklch(0.75 0.13 145);
}
.hwf-cmd-copy {
  background: var(--accent);
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: 5px;
  color: var(--foreground);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.hwf-cmd-copy:hover { background: oklch(0.4 0 0); }
.hwf-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--muted-foreground);
  font-size: 14px;
}
.hwf-spin {
  width: 20px; height: 20px;
  border: 2px solid oklch(1 0 0 / 0.1);
  border-top-color: var(--sidebar-primary);
  border-radius: 50%;
  animation: hwf-rotate 0.7s linear infinite;
}
@keyframes hwf-rotate { to { transform: rotate(360deg); } }
.hwf-error {
  color: oklch(0.65 0.18 25);
  font-size: 13px;
  padding: 12px;
  background: oklch(0.18 0.04 25);
  border-radius: 6px;
  border: 1px solid oklch(0.35 0.1 25);
}
`;

  // ── Utility ────────────────────────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function serverNameFromUrl() {
    const m = window.location.pathname.match(/\/chain-of-action\/servers\/([^/]+)/);
    return m ? m[1] : null;
  }

  function isServerPage() {
    return /\/chain-of-action\/servers\/[^/]+\//.test(window.location.pathname);
  }

  // ── Horizon API ────────────────────────────────────────────────────────────

  async function fetchServerInfo(serverName) {
    const payload = {
      t: {
        t: 10,
        i: 0,
        p: {
          k: ["data"],
          v: [
            {
              t: 10,
              i: 1,
              p: {
                k: ["orgSlug", "projectName"],
                v: [
                  { t: 1, s: ORG_SLUG },
                  { t: 1, s: serverName },
                ],
              },
              o: 0,
            },
          ],
        },
        o: 0,
      },
      f: 63,
      m: [],
    };
    const resp = await fetch(
      `/_serverFn/${SERVER_INFO_FN}?payload=${encodeURIComponent(JSON.stringify(payload))}`,
      {
        headers: {
          accept: "application/x-tss-framed, application/x-ndjson, application/json",
          "x-tsr-serverfn": "true",
        },
      },
    );
    if (!resp.ok) throw new Error(`Server info fetch failed: ${resp.status}`);
    const text = await resp.text();
    // Parse TanStack serialization: extract orgId and serverId (id)
    // Format: {"t":10,"i":1,"p":{"k":["id","name","slug","orgId",...],"v":[...]}}
    const parsed = JSON.parse(text);
    const result = parsed?.p?.v?.[0];
    if (!result) throw new Error("Unexpected server info response");
    const keys = result.p.k;
    const vals = result.p.v;
    const get = (key) => vals[keys.indexOf(key)]?.s;
    return { serverId: get("id"), orgId: get("orgId") };
  }

  async function fetchManifest(orgId, serverId) {
    const resp = await fetch(`/api/v0/organizations/${orgId}/servers/${serverId}/manifest?`, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`Manifest fetch failed: ${resp.status}`);
    return resp.json();
  }

  // ── Code generation ────────────────────────────────────────────────────────

  const PY_TYPES = { string: "str", integer: "int", number: "float", boolean: "bool" };

  function pyDefault(prop) {
    if (prop.default === undefined) return null;
    if (prop.type === "string") return JSON.stringify(prop.default);
    if (prop.type === "boolean") return prop.default ? "True" : "False";
    return String(prop.default);
  }

  function taskParams(tool) {
    const props = tool.input_schema?.properties ?? {};
    return Object.entries(props)
      .sort(([, a], [, b]) => (a.position ?? 0) - (b.position ?? 0))
      .map(([name, prop]) => {
        const type = PY_TYPES[prop.type] ?? "str";
        const def = pyDefault(prop);
        return def !== null ? `${name}: ${type} = ${def}` : `${name}: ${type}`;
      });
  }

  function taskCallArgs(tool) {
    const props = tool.input_schema?.properties ?? {};
    return Object.keys(props)
      .sort((a, b) => (props[a].position ?? 0) - (props[b].position ?? 0))
      .map((name) => `"${name}": ${name}`);
  }

  function generateCode(serverName, mcpUrl, flowName, tools) {
    const taskFns = tools
      .map((tool) => {
        const params = taskParams(tool);
        const args = taskCallArgs(tool);
        const sig = params.length ? params.join(", ") : "";
        const callArgs = args.length ? `{${args.join(", ")}}` : "{}";
        return `@task(log_prints=True)
async def ${tool.tool_name}(${sig}) -> str:
    """${tool.description}"""
    async with Client(MCP_SERVER_URL) as client:
        result = await client.call_tool("${tool.tool_name}", ${callArgs})
        return result[0].text`;
      })
      .join("\n\n");

    const flowCalls = tools
      .map((t) => {
        const params = taskParams(t);
        const callSig = params.map((p) => p.split(":")[0].trim()).join(", ");
        return `    results["${t.tool_name}"] = await ${t.tool_name}(${callSig})`;
      })
      .join("\n");

    return `"""Prefect workflow powered by ${serverName}.

Auto-generated by Horizon Cloud Workflow Wizard.
MCP server: ${mcpUrl}
"""

from prefect import flow, task
from fastmcp import Client

MCP_SERVER_URL = "${mcpUrl}"


${taskFns}


@flow(name="${flowName}", log_prints=True)
async def ${flowName.replace(/-/g, "_")}():
    """Workflow using ${serverName} MCP tools."""
    results = {}
${flowCalls}
    return results


if __name__ == "__main__":
    ${flowName.replace(/-/g, "_")}.deploy(
        name="${flowName}",
        work_pool_name="default",
    )
`;
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────

  function openWizard(serverName) {
    document.getElementById(WIZARD_ID)?.remove();
    ensureStyles();

    const overlay = document.createElement("div");
    overlay.id = WIZARD_ID;
    document.body.appendChild(overlay);

    // Close on overlay click (but not card click)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const mcpUrl = `https://${serverName}.fastmcp.app/mcp`;

    // ── Step 1: Loading ──
    overlay.innerHTML = `
      <div class="hwf-card">
        <div class="hwf-header">
          <div>
            <h1>Create Workflow</h1>
            <div style="margin-top:6px">
              <span class="hwf-server-pill" id="hwf-loading-server"></span>
            </div>
          </div>
          <button class="hwf-close" id="hwf-close">✕</button>
        </div>
        <div class="hwf-spinner">
          <div class="hwf-spin"></div>
          <span>Loading tools…</span>
        </div>
      </div>
    `;
    overlay.querySelector("#hwf-loading-server").textContent = serverName;
    overlay.querySelector("#hwf-close").addEventListener("click", () => overlay.remove());

    // Fetch server info + manifest
    fetchServerInfo(serverName)
      .then(({ orgId, serverId }) => fetchManifest(orgId, serverId))
      .then((data) => renderStep1(overlay, serverName, mcpUrl, data))
      .catch((err) => {
        const card = overlay.querySelector(".hwf-card");
        card.innerHTML = `
          <div class="hwf-header">
            <h1>Create Workflow</h1>
            <button class="hwf-close" id="hwf-close2">✕</button>
          </div>
          <div class="hwf-error" id="hwf-err-msg"></div>
        `;
        card.querySelector("#hwf-err-msg").textContent = `Failed to load tools: ${err.message}`;
        card.querySelector("#hwf-close2").addEventListener("click", () => overlay.remove());
      });
  }

  function renderStep1(overlay, serverName, mcpUrl, manifest) {
    const tools = (manifest.tools ?? []).filter(
      (t) => !["list_workflows", "refresh_workflows"].includes(t.tool_name),
    );

    const card = overlay.querySelector(".hwf-card");
    card.innerHTML = `
      <div class="hwf-header">
        <div>
          <h1>Create Workflow</h1>
          <div style="margin-top:6px">
            <span class="hwf-server-pill" id="hwf-s1-server"></span>
          </div>
        </div>
        <button class="hwf-close" id="hwf-close">✕</button>
      </div>

      <div>
        <div class="hwf-section-label">Workflow name</div>
        <input id="hwf-name" class="hwf-name-input" type="text"
          value="my-workflow" autocomplete="off" spellcheck="false" />
      </div>

      <div>
        <div class="hwf-section-label">Tools to include (${tools.length})</div>
        <div class="hwf-tools-grid" id="hwf-tools"></div>
      </div>

      <div class="hwf-actions">
        <button class="hwf-btn-back" id="hwf-cancel">Cancel</button>
        <button class="hwf-btn-primary" id="hwf-generate">Generate →</button>
      </div>
    `;

    card.querySelector("#hwf-s1-server").textContent = serverName;

    // Build tool rows via DOM to avoid injecting untrusted API content into innerHTML
    const grid = card.querySelector("#hwf-tools");
    for (const t of tools) {
      const label = document.createElement("label");
      label.className = "hwf-tool-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.tool = t.tool_name;
      cb.checked = true;
      const info = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.className = "hwf-tool-name";
      nameEl.textContent = t.tool_name;
      const descEl = document.createElement("div");
      descEl.className = "hwf-tool-desc";
      descEl.textContent = t.description;
      info.appendChild(nameEl);
      info.appendChild(descEl);
      label.appendChild(cb);
      label.appendChild(info);
      grid.appendChild(label);
    }

    overlay.querySelector("#hwf-close").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#hwf-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#hwf-generate").addEventListener("click", () => {
      const flowName = overlay.querySelector("#hwf-name").value.trim() || "my-workflow";
      const selected = [...overlay.querySelectorAll("input[type=checkbox][data-tool]:checked")].map(
        (cb) => cb.dataset.tool,
      );
      const selectedTools = tools.filter((t) => selected.includes(t.tool_name));
      if (!selectedTools.length) return;
      renderStep2(overlay, serverName, mcpUrl, flowName, selectedTools);
    });
  }

  function renderStep2(overlay, serverName, mcpUrl, flowName, tools) {
    const code = generateCode(serverName, mcpUrl, flowName, tools);
    const fileName = `${flowName.replace(/-/g, "_")}.py`;
    const installCmd = `pip install prefect fastmcp && prefect cloud login && python ${fileName}`;

    const card = overlay.querySelector(".hwf-card");
    card.innerHTML = `
      <div class="hwf-header">
        <div>
          <h1 id="hwf-s2-title"></h1>
          <div style="margin-top:6px">
            <span class="hwf-server-pill" id="hwf-s2-server"></span>
          </div>
        </div>
        <button class="hwf-close" id="hwf-close">✕</button>
      </div>

      <div>
        <div class="hwf-section-label" id="hwf-s2-file-label"></div>
        <div class="hwf-code-block">
          <pre id="hwf-code-pre">${escapeHtml(code)}</pre>
          <button class="hwf-copy-btn" id="hwf-copy-code">Copy</button>
        </div>
      </div>

      <div>
        <div class="hwf-section-label">Deploy to Prefect Cloud</div>
        <div class="hwf-cmd-block">
          <code>${escapeHtml(installCmd)}</code>
          <button class="hwf-cmd-copy" id="hwf-copy-cmd">Copy</button>
        </div>
      </div>

      <div class="hwf-actions">
        <button class="hwf-btn-back" id="hwf-back">← Back</button>
        <button class="hwf-btn-primary" id="hwf-download"></button>
      </div>
    `;

    card.querySelector("#hwf-s2-title").textContent = flowName;
    card.querySelector("#hwf-s2-server").textContent = serverName;
    card.querySelector("#hwf-s2-file-label").textContent = `Generated workflow · ${fileName}`;
    card.querySelector("#hwf-download").textContent = `Download ${fileName}`;

    overlay.querySelector("#hwf-close").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#hwf-back").addEventListener("click", () =>
      fetchServerInfo(serverName)
        .then(({ orgId, serverId }) => fetchManifest(orgId, serverId))
        .then((data) => renderStep1(overlay, serverName, mcpUrl, data))
        .catch(() => renderStep1(overlay, serverName, mcpUrl, { tools })),
    );

    setupCopy(overlay.querySelector("#hwf-copy-code"), code);
    setupCopy(overlay.querySelector("#hwf-copy-cmd"), installCmd);

    overlay.querySelector("#hwf-download").addEventListener("click", () => {
      const blob = new Blob([code], { type: "text/x-python" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function setupCopy(btn, text) {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove("copied");
        }, 2000);
      });
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Sidebar injection ──────────────────────────────────────────────────────

  // SVG icon: workflow/git-branch from lucide
  const WORKFLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide size-4 mr-2" aria-hidden="true"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/></svg>`;

  const BTN_CLS = [
    "ring-sidebar-ring",
    "active:bg-sidebar-accent",
    "active:text-sidebar-accent-foreground",
    "data-active:bg-sidebar-accent",
    "data-active:text-sidebar-accent-foreground",
    "gap-2",
    "rounded-md",
    "p-2",
    "text-left",
    "focus-visible:ring-2",
    "peer/menu-button",
    "flex",
    "w-full",
    "items-center",
    "overflow-hidden",
    "outline-hidden",
    "group/menu-button",
    "hover:bg-sidebar-accent",
    "hover:text-sidebar-accent-foreground",
    "h-8",
    "text-sm",
  ].join(" ");

  const LABEL_CLS = [
    "text-sidebar-foreground/70",
    "ring-sidebar-ring",
    "h-8",
    "rounded-md",
    "px-2",
    "text-xs",
    "font-medium",
    "flex",
    "shrink-0",
    "items-center",
    "outline-hidden",
  ].join(" ");

  function buildNavGroup(serverName) {
    const group = document.createElement("div");
    group.id = NAV_ID;
    group.setAttribute("data-slot", "sidebar-group");
    group.setAttribute("data-sidebar", "group");
    group.className = "p-2 relative flex w-full min-w-0 flex-col";

    group.innerHTML = `
      <div data-slot="sidebar-group-label" data-sidebar="group-label" class="${LABEL_CLS}">
        Workflows
      </div>
      <ul data-slot="sidebar-menu" data-sidebar="menu" class="gap-1 flex w-full min-w-0 flex-col">
        <li data-slot="sidebar-menu-item" data-sidebar="menu-item" class="group/menu-item relative">
          <button type="button" data-slot="sidebar-menu-button" data-sidebar="menu-button"
            data-size="default" id="hwf-create-btn" class="${BTN_CLS}">
            ${WORKFLOW_SVG}
            Create Workflow
          </button>
        </li>
      </ul>
    `;

    group.querySelector("#hwf-create-btn").addEventListener("click", () => {
      openWizard(serverName);
    });

    return group;
  }

  function findAnalyticsGroup() {
    for (const label of document.querySelectorAll('[data-slot="sidebar-group-label"]')) {
      if (label.textContent.trim().startsWith("Analytics")) {
        return label.closest('[data-slot="sidebar-group"]');
      }
    }
    return null;
  }

  function injectSidebar() {
    if (!isServerPage()) return;
    if (document.getElementById(NAV_ID)) return;

    const serverName = serverNameFromUrl();
    if (!serverName) return;

    // Insert the Workflows group immediately before the Analytics group
    const analyticsGroup = findAnalyticsGroup();
    if (!analyticsGroup) return;

    analyticsGroup.parentElement.insertBefore(buildNavGroup(serverName), analyticsGroup);
  }

  // ── Init & SPA navigation ──────────────────────────────────────────────────

  let lastUrl = "";

  function onUrlChange() {
    const url = window.location.pathname;
    if (url === lastUrl) return;
    lastUrl = url;

    // Remove injected elements on navigation away
    document.getElementById(NAV_ID)?.remove();
    document.getElementById(WIZARD_ID)?.remove();

    if (isServerPage()) {
      // Wait for the sidebar to render — specifically the Analytics group
      const interval = setInterval(() => {
        if (findAnalyticsGroup()) {
          clearInterval(interval);
          injectSidebar();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 5000);
    }
  }

  // Watch for TanStack SPA navigations via pushState / popstate
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    onUrlChange();
  };
  history.replaceState = (...args) => {
    origReplace(...args);
    onUrlChange();
  };
  window.addEventListener("popstate", onUrlChange);

  // Also watch for DOM mutations in case sidebar renders late
  const observer = new MutationObserver(() => {
    if (isServerPage() && !document.getElementById(NAV_ID) && findAnalyticsGroup()) {
      injectSidebar();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  ensureStyles();
  onUrlChange();
})();
