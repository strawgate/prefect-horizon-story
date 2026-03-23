/**
 * horizon.js — injected on horizon.prefect.io
 *
 * Injects "Prefect Bridge" as a 4th server type in the "Add server" dialog.
 * Clicking it launches a full-page multi-step wizard:
 *   Step 1 — Workspace URL (format validation)
 *   Step 2 — API Key (validated against Prefect Cloud)
 *   Step 3 — Deploying (animated progress, then navigate)
 */

(() => {
  const OPTION_ID = "prefect-bridge-option";
  const WIZARD_ID = "prefect-bridge-wizard";
  const STYLE_ID = "prefect-bridge-styles";

  // ── Horizon API constants ─────────────────────────────────────────────────────

  // TanStack Start server function hashes. These are content-hashes baked into
  // Horizon's main JS bundle (via he("…") calls). They change only when Horizon
  // redeploys with new server function source. We verified they're still live by
  // fetching the bundle and confirming the he() calls match.
  const SESSION_FN = "1cc78742dc24d73005a132eed91efeac2a47a65544832d5f8cd259a36d562d2e";
  const CREATE_FN = "182d32013c69ab1a70c03ac7a5f866a34257c766d7b0645a795fff7ef2e19d25";
  const STRAWGATE_INSTALL_ID = 78882685;

  // ── CSS ───────────────────────────────────────────────────────────────────────

  const CSS = `
    /* ── Dialog picker option — matches native Hosted/External/Remix items ── */
    #${OPTION_ID} {
      display: flex; flex-direction: row; align-items: flex-start; gap: 12px;
      padding: 12px; border-radius: 8px; border: 1px solid transparent;
      background: transparent; cursor: pointer; text-align: left;
      font-family: "Inter Variable", sans-serif;
      font-size: 14px; color: var(--card-foreground);
      transition: background .1s; width: 100%;
    }
    #${OPTION_ID}:hover { background: var(--accent); }
    #${OPTION_ID} .pb-icon {
      width: 28px; height: 28px; border-radius: 6px;
      background: var(--sidebar-primary);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
    }
    #${OPTION_ID} .pb-body { display: flex; flex-direction: column; gap: 2px; }
    #${OPTION_ID} .pb-title-row { display: flex; align-items: center; gap: 6px; }
    #${OPTION_ID} .pb-title { font-size: 14px; font-weight: 500; color: var(--card-foreground); }
    #${OPTION_ID} .pb-badge {
      font-size: 12px; font-weight: 500; color: oklch(0.809 0.105 251.813);
      background: oklch(0.282 0.091 267.935);
      border-radius: 26px; padding: 2px 6px;
    }
    #${OPTION_ID} .pb-desc { font-size: 13px; color: var(--muted-foreground); line-height: 1.4; }

    /* ── Full-page wizard overlay ── */
    #${WIZARD_ID} {
      position: fixed; inset: 0; z-index: 99999;
      background: var(--background);
      display: flex; align-items: center; justify-content: center;
      font-family: "Inter Variable", sans-serif;
      color: var(--foreground);
    }
    #${WIZARD_ID} .pbw-card {
      background: var(--card);
      color: var(--card-foreground);
      border-radius: 8px;
      border: 1px solid oklab(1 0 0 / 0.05);
      padding: 32px;
      width: 462px; max-width: calc(100vw - 32px);
      box-shadow: rgba(0, 0, 0, 0.04) 0px 2px 8px 0px;
    }
    #${WIZARD_ID} .pbw-logo {
      display: flex; align-items: center; gap: 10px; margin-bottom: 24px;
    }
    #${WIZARD_ID} .pbw-logo-icon {
      width: 36px; height: 36px; border-radius: 8px;
      background: var(--sidebar-primary);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #${WIZARD_ID} .pbw-logo-text h1 {
      font-size: 16px; font-weight: 600; margin: 0; color: var(--card-foreground);
    }
    #${WIZARD_ID} .pbw-logo-text p {
      font-size: 13px; margin: 1px 0 0; color: var(--muted-foreground);
    }
    #${WIZARD_ID} .pbw-steps {
      display: flex; gap: 4px; margin-bottom: 24px;
    }
    #${WIZARD_ID} .pbw-step-dot {
      height: 2px; border-radius: 1px; flex: 1; transition: background .25s;
    }
    #${WIZARD_ID} .pbw-step-dot.active { background: var(--sidebar-primary); }
    #${WIZARD_ID} .pbw-step-dot.done   { background: oklch(0.7 0.17 142); }
    #${WIZARD_ID} .pbw-step-dot.idle   { background: var(--border); }
    #${WIZARD_ID} .pbw-heading {
      font-size: 15px; font-weight: 600; color: var(--card-foreground); margin: 0 0 4px;
    }
    #${WIZARD_ID} .pbw-subheading {
      font-size: 13px; color: var(--muted-foreground); margin: 0 0 20px; line-height: 1.5;
    }
    #${WIZARD_ID} .pbw-label {
      display: block; font-size: 14px; font-weight: 500;
      color: var(--card-foreground); margin-bottom: 6px;
    }
    #${WIZARD_ID} .pbw-label .req { color: var(--destructive); margin-left: 2px; }
    #${WIZARD_ID} .pbw-input {
      width: 100%; box-sizing: border-box; height: 38px;
      background: var(--background); border: 1px solid oklch(1 0 0 / 0.15);
      border-radius: 8px; padding: 4px 10px; font-size: 14px;
      color: var(--card-foreground); outline: none;
      font-family: "Inter Variable", sans-serif;
      transition: border-color .1s, box-shadow .1s;
    }
    #${WIZARD_ID} .pbw-input.mono {
      font-family: ui-monospace, "SFMono-Regular", "Menlo", monospace; font-size: 12px;
    }
    #${WIZARD_ID} .pbw-input:focus {
      outline: none;
      border-color: var(--ring);
      box-shadow: 0 0 0 3px oklch(from var(--ring) l c h / .3);
    }
    #${WIZARD_ID} .pbw-input.invalid {
      border-color: var(--destructive);
      box-shadow: 0 0 0 3px oklch(from var(--destructive) l c h / .2);
    }
    #${WIZARD_ID} .pbw-input.valid {
      border-color: oklch(0.7 0.17 142);
      box-shadow: 0 0 0 3px oklch(0.7 0.17 142 / .2);
    }
    #${WIZARD_ID} .pbw-hint {
      font-size: 12px; color: var(--muted-foreground); margin-top: 4px; line-height: 1.4;
    }
    #${WIZARD_ID} .pbw-hint a { color: var(--sidebar-primary); text-decoration: none; }
    #${WIZARD_ID} .pbw-hint a:hover { text-decoration: underline; }
    #${WIZARD_ID} .pbw-error {
      font-size: 12px; color: var(--destructive); margin-top: 6px; display: none; line-height: 1.4;
    }
    #${WIZARD_ID} .pbw-field { margin-bottom: 16px; }
    #${WIZARD_ID} .pbw-actions { display: flex; gap: 8px; margin-top: 8px; }
    #${WIZARD_ID} .pbw-btn-back {
      height: 36px; padding: 0 16px;
      border: 1px solid var(--border); border-radius: 8px;
      font-size: 14px; font-weight: 500; color: var(--card-foreground);
      background: transparent; cursor: pointer;
      font-family: "Inter Variable", sans-serif;
      transition: background .1s;
    }
    #${WIZARD_ID} .pbw-btn-back:hover { background: var(--accent); }
    #${WIZARD_ID} .pbw-btn-primary {
      flex: 1; height: 44px; border: none; border-radius: 5px;
      font-size: 14px; font-weight: 500;
      color: var(--primary-foreground); background: var(--primary);
      cursor: pointer; font-family: "Inter Variable", sans-serif;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: opacity .1s;
    }
    #${WIZARD_ID} .pbw-btn-primary:hover:not(:disabled) { opacity: .9; }
    #${WIZARD_ID} .pbw-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Deploy progress ── */
    #${WIZARD_ID} .pbw-progress { display: flex; flex-direction: column; gap: 14px; }
    #${WIZARD_ID} .pbw-progress-item {
      display: flex; align-items: center; gap: 10px; font-size: 14px;
    }
    #${WIZARD_ID} .pbw-progress-item .icon {
      width: 20px; height: 20px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #${WIZARD_ID} .pbw-progress-item .icon.pending  { background: var(--accent); }
    #${WIZARD_ID} .pbw-progress-item .icon.spinning { background: oklch(from var(--sidebar-primary) l c h / .2); }
    #${WIZARD_ID} .pbw-progress-item .icon.done     { background: oklch(0.7 0.17 142 / .2); }
    #${WIZARD_ID} .pbw-progress-item .label.pending  { color: var(--muted-foreground); }
    #${WIZARD_ID} .pbw-progress-item .label.spinning { color: var(--card-foreground); }
    #${WIZARD_ID} .pbw-progress-item .label.done     { color: oklch(0.7 0.17 142); }

    @keyframes pbw-spin { to { transform: rotate(360deg); } }
    .pbw-spinner { animation: pbw-spin .7s linear infinite; }
  `;

  // ── SVG helpers ───────────────────────────────────────────────────────────────

  const PREFECT_SVG = `
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <path d="M7 8h8a5 5 0 0 1 0 10H7V8Z" fill="#fff" opacity=".95"/>
      <path d="M7 18h9a4.5 4.5 0 0 1 0 9H7v-9Z" fill="#fff" opacity=".5"/>
    </svg>`;

  const SPINNER_SVG = (cls = "") => `
    <svg class="${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>`;

  const CHECK_SVG = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;

  // ── Horizon API helpers ───────────────────────────────────────────────────────

  const FETCH_TIMEOUT_MS = 15000;

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, credentials: "include", signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Request timed out. Please retry.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetch the current user's Horizon org UUID from the session JWT. */
  async function getOrgId() {
    const resp = await fetchWithTimeout(`/_serverFn/${SESSION_FN}`, {
      headers: {
        accept: "application/x-tss-framed, application/x-ndjson, application/json",
        "x-tsr-serverfn": "true",
      },
    });
    if (!resp.ok) throw new Error(`Session fetch failed: ${resp.status}`);
    const text = await resp.text();
    const jwtMatch = text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (!jwtMatch) throw new Error("JWT not found in session response");
    const payloadPart = jwtMatch[0].split(".")[1];
    const padded = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payloadPart.length + ((4 - (payloadPart.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    const orgId = payload.org_id || payload.horizon_organization_id;
    if (!orgId) throw new Error("org_id missing from JWT");
    return orgId;
  }

  /**
   * Build the TanStack Start serialized body for the create-server server function.
   * envVariables is an array of "KEY=value" strings (one per env var).
   * Types: t:0=number, t:1=string, t:2(s:1)=undefined, t:2(s:2)=true, t:9=array, t:10=object
   */
  function buildCreateBody({ serverName, orgId, apiKey, workspaceUrl }) {
    const envLines = [`PREFECT_API_KEY=${apiKey}`, `PREFECT_API_URL=${workspaceUrl}`];
    const envArr = { t: 9, i: 2, a: envLines.map((s) => ({ t: 1, s })), o: 0 };

    return {
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
                k: [
                  "serverName",
                  "description",
                  "orgId",
                  "entrypoint",
                  "requirements",
                  "envVariables",
                  "authMode",
                  "repoName",
                  "owner",
                  "repo",
                  "isPrivate",
                  "installationId",
                ],
                v: [
                  { t: 1, s: serverName },
                  { t: 1, s: "" }, // description = empty string
                  { t: 1, s: orgId },
                  { t: 1, s: "main.py" },
                  { t: 2, s: 1 }, // requirements = undefined
                  envArr,
                  { t: 1, s: "fastmcp-cloud" },
                  { t: 1, s: "strawgate/prefect-horizon-story" },
                  { t: 1, s: "strawgate" },
                  { t: 1, s: "prefect-horizon-story" },
                  { t: 2, s: 3 }, // isPrivate = false (public repo)
                  { t: 0, s: STRAWGATE_INSTALL_ID },
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
  }

  /** Create the Prefect Bridge server and return the server name. */
  async function deployPrefectBridge({ orgId, apiKey, workspaceUrl }) {
    const adjectives = ["swift", "bright", "bold", "calm", "keen", "wise"];
    const nouns = ["bridge", "link", "relay", "nexus", "hub", "gate"];
    const rand = () => Math.random().toString(36).slice(2, 6);
    const serverName = `prefect-${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${rand()}`;

    const body = buildCreateBody({ serverName, orgId, apiKey, workspaceUrl });
    const resp = await fetchWithTimeout(`/_serverFn/${CREATE_FN}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/x-tss-framed, application/x-ndjson, application/json",
        "x-tsr-serverfn": "true",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Deploy failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    return serverName;
  }

  // ── Workspace URL validation ──────────────────────────────────────────────────

  const WS_URL_RE =
    /^https:\/\/api\.prefect\.cloud\/api\/accounts\/[^/\s]+\/workspaces\/[^/\s]+\/?$/;

  function validateWorkspaceUrl(url) {
    return WS_URL_RE.test(url.trim());
  }

  // ── Wizard UI ─────────────────────────────────────────────────────────────────

  function ensureStyles() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = CSS;
      document.head.appendChild(s);
    }
  }

  function renderStepDots(container, currentStep) {
    const dots = container.querySelectorAll(".pbw-step-dot");
    dots.forEach((dot, i) => {
      dot.className = `pbw-step-dot ${i < currentStep ? "done" : i === currentStep ? "active" : "idle"}`;
    });
  }

  function launchWizard() {
    // Remove any existing wizard
    document.getElementById(WIZARD_ID)?.remove();

    const overlay = document.createElement("div");
    overlay.id = WIZARD_ID;
    overlay.innerHTML = `
      <div class="pbw-card">
        <div class="pbw-logo">
          <div class="pbw-logo-icon">${PREFECT_SVG}</div>
          <div class="pbw-logo-text">
            <h1>Prefect Bridge</h1>
            <p>Connect Prefect Cloud to Horizon</p>
          </div>
        </div>
        <div class="pbw-steps">
          <div class="pbw-step-dot active"></div>
          <div class="pbw-step-dot idle"></div>
          <div class="pbw-step-dot idle"></div>
        </div>
        <div id="pbw-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const content = overlay.querySelector("#pbw-content");

    const state = { workspaceUrl: "", apiKey: "" };

    // ── Step 1: Workspace URL ──
    function showStep1() {
      renderStepDots(overlay, 0);
      content.innerHTML = `
        <h2 class="pbw-heading">Enter your Workspace URL</h2>
        <p class="pbw-subheading">
          Find this in Prefect Cloud under
          <strong>Settings → Workspace → API URL</strong>.
        </p>
        <div class="pbw-field">
          <label class="pbw-label" for="pbw-ws-url">Workspace API URL<span class="req">*</span></label>
          <input id="pbw-ws-url" class="pbw-input mono" type="text"
            placeholder="https://api.prefect.cloud/api/accounts/…/workspaces/…"
            autocomplete="off" />
          <p class="pbw-hint">
            <a href="https://app.prefect.cloud" target="_blank">app.prefect.cloud</a>
            → Settings → Workspace → API URL
          </p>
          <div id="pbw-url-error" class="pbw-error"></div>
        </div>
        <div class="pbw-actions">
          <button class="pbw-btn-back" id="pbw-close">✕ Cancel</button>
          <button class="pbw-btn-primary" id="pbw-url-next" disabled>Continue →</button>
        </div>
      `;

      const input = content.querySelector("#pbw-ws-url");
      const nextBtn = content.querySelector("#pbw-url-next");
      const errEl = content.querySelector("#pbw-url-error");
      input.value = state.workspaceUrl;

      function validate() {
        const val = input.value.trim();
        if (!val) {
          input.classList.remove("valid", "invalid");
          errEl.style.display = "none";
          nextBtn.disabled = true;
          return;
        }
        const ok = validateWorkspaceUrl(val);
        input.classList.toggle("valid", ok);
        input.classList.toggle("invalid", !ok);
        errEl.style.display = ok ? "none" : "block";
        errEl.textContent = ok
          ? ""
          : "Must be https://api.prefect.cloud/api/accounts/…/workspaces/…";
        nextBtn.disabled = !ok;
      }

      input.addEventListener("input", validate);
      validate();

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !nextBtn.disabled) nextBtn.click();
      });

      content.querySelector("#pbw-close").addEventListener("click", () => overlay.remove());

      nextBtn.addEventListener("click", () => {
        state.workspaceUrl = input.value.trim();
        showStep2();
      });

      input.focus();
    }

    // ── Step 2: API Key ──
    function showStep2() {
      renderStepDots(overlay, 1);
      content.innerHTML = `
        <h2 class="pbw-heading">Enter your API Key</h2>
        <p class="pbw-subheading">
          The key will be stored as a server environment variable and used to
          connect to your Prefect Cloud workspace.
        </p>
        <div class="pbw-field">
          <label class="pbw-label" for="pbw-api-key">Prefect API Key<span class="req">*</span></label>
          <input id="pbw-api-key" class="pbw-input mono" type="password"
            placeholder="pnu_xxxxxxxxxxxxxxxxxxxx"
            autocomplete="off" />
          <p class="pbw-hint">
            <a href="https://app.prefect.cloud" target="_blank">app.prefect.cloud</a>
            → Settings → API Keys → Create API Key
          </p>
        </div>
        <div class="pbw-actions">
          <button class="pbw-btn-back" id="pbw-key-back">← Back</button>
          <button class="pbw-btn-primary" id="pbw-key-next" disabled>Deploy →</button>
        </div>
      `;

      const input = content.querySelector("#pbw-api-key");
      const nextBtn = content.querySelector("#pbw-key-next");
      input.value = state.apiKey;

      function updateBtn() {
        nextBtn.disabled = !input.value.trim().startsWith("pnu_");
      }
      input.addEventListener("input", updateBtn);
      updateBtn();

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !nextBtn.disabled) nextBtn.click();
      });

      content.querySelector("#pbw-key-back").addEventListener("click", () => {
        state.apiKey = input.value;
        showStep1();
      });

      nextBtn.addEventListener("click", () => {
        state.apiKey = input.value.trim();
        showStep3();
      });

      input.focus();
    }

    // ── Step 3: Deploying ──
    function showStep3() {
      renderStepDots(overlay, 2);
      content.innerHTML = `
        <h2 class="pbw-heading">Deploying your Bridge</h2>
        <p class="pbw-subheading">Setting up a dedicated Horizon server with your Prefect workspace.</p>
        <div class="pbw-progress">
          <div class="pbw-progress-item" id="pbw-p1">
            <div class="icon spinning">${SPINNER_SVG("pbw-spinner")}</div>
            <span class="label spinning">Connecting to Horizon…</span>
          </div>
          <div class="pbw-progress-item" id="pbw-p2">
            <div class="icon pending">
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="rgba(255,255,255,.2)"/></svg>
            </div>
            <span class="label pending">Creating server…</span>
          </div>
          <div class="pbw-progress-item" id="pbw-p3">
            <div class="icon pending">
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="rgba(255,255,255,.2)"/></svg>
            </div>
            <span class="label pending">Configuring environment…</span>
          </div>
          <div class="pbw-progress-item" id="pbw-p4">
            <div class="icon pending">
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="rgba(255,255,255,.2)"/></svg>
            </div>
            <span class="label pending">Done!</span>
          </div>
        </div>
        <div id="pbw-deploy-error" class="pbw-error" style="margin-top:20px;"></div>
      `;

      function markDone(id) {
        const el = content.querySelector(`#${id}`);
        if (!el) return;
        el.querySelector(".icon").className = "icon done";
        el.querySelector(".icon").innerHTML = CHECK_SVG;
        el.querySelector(".label").className = "label done";
      }

      function markSpinning(id) {
        const el = content.querySelector(`#${id}`);
        if (!el) return;
        el.querySelector(".icon").className = "icon spinning";
        el.querySelector(".icon").innerHTML = SPINNER_SVG("pbw-spinner");
        el.querySelector(".label").className = "label spinning";
      }

      async function run() {
        const errEl = content.querySelector("#pbw-deploy-error");
        try {
          // Step A: get org ID
          const orgId = await getOrgId();
          markDone("pbw-p1");

          // Step B: create server
          markSpinning("pbw-p2");
          const serverName = await deployPrefectBridge({
            orgId,
            apiKey: state.apiKey,
            workspaceUrl: state.workspaceUrl,
          });
          markDone("pbw-p2");

          // Step C: configure (already done via env vars in creation body)
          markSpinning("pbw-p3");
          await new Promise((r) => setTimeout(r, 600)); // brief pause for UX
          markDone("pbw-p3");
          markDone("pbw-p4");

          renderStepDots(overlay, 3); // all dots green
          // Navigate after a short delay
          await new Promise((r) => setTimeout(r, 900));
          const orgSlug = window.location.pathname.split("/")[1];
          window.location.href = `/${orgSlug}/servers/${serverName}/deployments`;
        } catch (err) {
          console.error("[Prefect Bridge] Deploy error:", err);
          errEl.textContent = `Error: ${err.message}`;
          errEl.style.display = "block";
          // Add a retry / back button
          const actionsEl = document.createElement("div");
          actionsEl.className = "pbw-actions";
          actionsEl.style.marginTop = "20px";
          actionsEl.innerHTML = `
            <button class="pbw-btn-back" id="pbw-retry-back">← Back</button>
            <button class="pbw-btn-primary" id="pbw-retry">Retry</button>
          `;
          content.appendChild(actionsEl);
          content.querySelector("#pbw-retry-back").addEventListener("click", showStep2);
          content.querySelector("#pbw-retry").addEventListener("click", showStep3);
        }
      }

      run();
    }

    showStep1();
  }

  // ── Dialog option button ──────────────────────────────────────────────────────

  function buildOption() {
    const btn = document.createElement("button");
    btn.id = OPTION_ID;
    btn.type = "button";
    btn.innerHTML = `
      <div class="pb-icon">${PREFECT_SVG}</div>
      <div class="pb-body">
        <div class="pb-title-row">
          <span class="pb-title">Prefect Bridge</span>
          <span class="pb-badge">New</span>
        </div>
        <div class="pb-desc">Connect Prefect Cloud deployments as MCP tools.</div>
      </div>
    `;
    btn.addEventListener("click", () => {
      // Close the dialog, then launch the full-page wizard
      const dialog = btn.closest("[role=dialog], dialog");
      if (dialog) {
        // Click outside or find a close button to dismiss the dialog
        const closeBtn = dialog.querySelector(
          "button[aria-label*='close' i], button[aria-label*='dismiss' i]",
        );
        if (closeBtn) closeBtn.click();
        else dialog.remove();
      }
      launchWizard();
    });
    return btn;
  }

  // ── Inject into the Add Server dialog ────────────────────────────────────────

  function tryInjectDialog(dialog) {
    if (dialog.querySelector(`#${OPTION_ID}`)) return;

    const container = dialog.querySelector("div");
    if (!container) return;

    const hasServerOptions =
      container.textContent.includes("Hosted") && container.textContent.includes("External");
    if (!hasServerOptions) return;

    container.appendChild(buildOption());
  }

  function watchForDialog() {
    ensureStyles();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.("[role=dialog], dialog")) tryInjectDialog(node);
          for (const d of node.querySelectorAll?.("[role=dialog], dialog") ?? []) {
            tryInjectDialog(d);
          }
        }
        if (mutation.target.closest?.("[role=dialog], dialog") && mutation.addedNodes.length > 0) {
          const dialog = mutation.target.closest("[role=dialog], dialog");
          if (dialog) tryInjectDialog(dialog);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchForDialog);
  } else {
    watchForDialog();
  }
})();
