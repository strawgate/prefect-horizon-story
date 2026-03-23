/**
 * Playwright e2e tests for the MCP toolbar (Prefect admin UI).
 *
 * Requires a running Prefect server at localhost:4200 with at least one
 * deployment. The test injects logic.js + toolbar.js + toolbar.css
 * directly into the page (simulating what the extension does) and verifies:
 *
 * 1. Native MCP row appears in .deployment-details on a deployment detail page
 * 2. Active state (mode badge + Change/Remove) when deployment has MCP tags
 * 3. Click Change → mode selector → select a new mode → updates API
 * 4. Click Remove clears MCP tags, shows "+ As a Tool"
 * 5. Idle state ("+ As a Tool") on untagged deployment
 * 6. No MCP row on non-deployment pages
 * 7. Enable from scratch: + As a Tool → mode selection → API updated
 *
 * Run: node prefect-app/toolbar.e2e.js
 */

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const PREFECT_URL = "http://127.0.0.1:4200";
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || null;

// Load extension source files (logic.js must be loaded before toolbar.js, matching manifest order)
const logicJs = fs.readFileSync(path.join(__dirname, "logic.js"), "utf8");
const contentJs = fs.readFileSync(path.join(__dirname, "toolbar.js"), "utf8");
const contentCss = fs.readFileSync(path.join(__dirname, "toolbar.css"), "utf8");

async function injectExtension(page) {
  await dismissModal(page);
  await page.addStyleTag({ content: contentCss });
  await page.addScriptTag({ content: logicJs });
  await page.addScriptTag({ content: contentJs });
}

async function dismissModal(page) {
  try {
    const skipBtn = page.locator("button", { hasText: "Skip" });
    if (await skipBtn.isVisible({ timeout: 2000 })) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // Modal not present — that's fine
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function findDeploymentId() {
  const resp = await fetch(`${PREFECT_URL}/api/deployments/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 10 }),
  });
  if (!resp.ok)
    throw new Error(`POST /deployments/filter failed: ${resp.status} ${resp.statusText}`);
  const deployments = await resp.json();
  const tagged = deployments.find((d) => d.tags?.includes("mcp-tool"));
  const untagged = deployments.find((d) => !d.tags?.includes("mcp-tool"));
  return { tagged, untagged, all: deployments };
}

async function resetTags(deploymentId, tags) {
  const resp = await fetch(`${PREFECT_URL}/api/deployments/${deploymentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  if (!resp.ok)
    throw new Error(`PATCH /deployments/${deploymentId} failed: ${resp.status} ${resp.statusText}`);
}

async function fetchDeploymentTags(deploymentId) {
  const resp = await fetch(`${PREFECT_URL}/api/deployments/${deploymentId}`);
  if (!resp.ok)
    throw new Error(`GET /deployments/${deploymentId} failed: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

(async () => {
  console.log("Setting up...");
  const { tagged, untagged, all } = await findDeploymentId();

  if (!tagged) {
    console.error("No mcp-tool tagged deployment found. Create one first.");
    process.exit(1);
  }

  const originalTags = [...(tagged.tags || [])];
  console.log(`Tagged deployment: ${tagged.name} (${tagged.id})`);
  console.log(`Untagged deployment: ${untagged?.name} (${untagged?.id})`);
  console.log(`Total deployments: ${all.length}\n`);

  const launchOptions = { headless: true };
  if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;
  const browser = await chromium.launch(launchOptions);

  try {
    // ── Test 1: MCP row appears in deployment sidebar ─────────────────────
    console.log("Test 1: MCP row appears in .deployment-details (active state)");
    {
      await resetTags(tagged.id, ["mcp-tool", "mcp-artifacts"]);

      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/deployments/deployment/${tagged.id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      const rowVisible = await page.isVisible("#mcp-row");
      assert(rowVisible, "MCP row (#mcp-row) is visible");

      const labelText = await page.textContent("#mcp-row .p-key-value__label");
      assert(
        labelText?.trim() === "Model Context Protocol (AI)",
        `Row label is "Model Context Protocol (AI)" (got: "${labelText?.trim()}")`,
      );

      // Mode 2: mcp-tool + mcp-artifacts
      const badgeText = await page.textContent("#mcp-mode-badge");
      assert(badgeText?.includes("Mode 2"), `Badge shows Mode 2 (got: "${badgeText}")`);
      assert(badgeText?.includes("Metadata + Artifacts"), "Badge shows mode label");

      // Row should be inside .deployment-details
      const inDetails = await page.evaluate(() => {
        const row = document.getElementById("mcp-row");
        const details = document.querySelector(".deployment-details");
        return details ? details.contains(row) : false;
      });
      assert(inDetails, "MCP row is inside .deployment-details");

      await page.screenshot({ path: "/tmp/test1_mcp_row.png" });
      await page.close();
    }

    // ── Test 2: Click Change → mode selector → select Mode 3 ─────────────
    console.log("\nTest 2: Click Change → mode selector → select Mode 3 (+ Logs)");
    {
      await resetTags(tagged.id, ["mcp-tool", "mcp-artifacts"]);

      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/deployments/deployment/${tagged.id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      await page.click(".mcp-change-btn");
      await page.waitForTimeout(300);

      const selectorVisible = await page.isVisible(".mcp-mode-select");
      assert(selectorVisible, "Mode selector appears after clicking Change");

      await page.click('.mcp-mode-opt[data-mode="3"]');
      await page.waitForTimeout(1500);

      const badgeText = await page.textContent("#mcp-mode-badge");
      assert(badgeText?.includes("Mode 3"), `Badge shows Mode 3 (got: "${badgeText}")`);

      const dep = await fetchDeploymentTags(tagged.id);
      assert(dep.tags.includes("mcp-tool"), "API confirms mcp-tool present");
      assert(dep.tags.includes("mcp-artifacts"), "API confirms mcp-artifacts present");
      assert(dep.tags.includes("mcp-logs"), "API confirms mcp-logs added");

      await page.close();
    }

    // ── Test 3: Click Remove clears all MCP tags ──────────────────────────
    console.log("\nTest 3: Click Remove clears MCP tags, shows + As a Tool");
    {
      await resetTags(tagged.id, ["mcp-tool", "mcp-artifacts", "production"]);

      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/deployments/deployment/${tagged.id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      await page.click(".mcp-remove-btn");
      await page.waitForTimeout(1500);

      const addBtnVisible = await page.isVisible(".mcp-add-btn");
      assert(addBtnVisible, '"+ As a Tool" button appears after Remove');

      const dep = await fetchDeploymentTags(tagged.id);
      assert(!dep.tags.includes("mcp-tool"), "API confirms mcp-tool removed");
      assert(!dep.tags.includes("mcp-artifacts"), "API confirms mcp-artifacts removed");
      assert(dep.tags.includes("production"), "API confirms non-MCP tag preserved");

      await page.close();
    }

    // ── Test 4: Untagged deployment shows "+ As a Tool" ───────────────────
    console.log("\nTest 4: Untagged deployment shows + As a Tool (idle state)");
    if (untagged) {
      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/deployments/deployment/${untagged.id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      const addBtnVisible = await page.isVisible(".mcp-add-btn");
      assert(addBtnVisible, '"+ As a Tool" button visible on untagged deployment');

      const badgeExists = await page.isVisible("#mcp-mode-badge");
      assert(!badgeExists, "No mode badge on untagged deployment");

      await page.close();
    } else {
      console.log("  SKIP: No untagged deployment available");
    }

    // ── Test 5: No MCP row on non-deployment pages ────────────────────────
    console.log("\nTest 5: No MCP row on non-deployment pages");
    {
      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/flows`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      const rowVisible = await page.isVisible("#mcp-row");
      assert(!rowVisible, "No MCP row on /flows page");

      await page.close();
    }

    // ── Test 6: Enable from scratch via + As a Tool → Metadata ───────────
    console.log("\nTest 6: Enable from scratch via + As a Tool → Metadata (Mode 1)");
    {
      await resetTags(tagged.id, ["production"]);

      const page = await browser.newPage();
      await page.goto(`${PREFECT_URL}/deployments/deployment/${tagged.id}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      await injectExtension(page);
      await page.waitForTimeout(2000);

      await page.click(".mcp-add-btn");
      await page.waitForTimeout(300);

      await page.click('.mcp-mode-opt[data-mode="1"]');
      await page.waitForTimeout(1500);

      const badgeText = await page.textContent("#mcp-mode-badge");
      assert(badgeText?.includes("Mode 1"), `Badge shows Mode 1 (got: "${badgeText}")`);
      assert(badgeText?.includes("Metadata"), "Badge shows Metadata label");

      const dep = await fetchDeploymentTags(tagged.id);
      assert(dep.tags.includes("mcp-tool"), "API confirms mcp-tool added");
      assert(!dep.tags.includes("mcp-artifacts"), "API confirms no mcp-artifacts (Mode 1)");
      assert(dep.tags.includes("production"), "API confirms non-MCP tag preserved");

      await page.screenshot({ path: "/tmp/test6_mode_enabled.png" });
      await page.close();
    }
  } finally {
    // Restore tags to original state
    await resetTags(tagged.id, originalTags);
    await browser.close();
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All tests passed!");
})();
