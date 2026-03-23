/**
 * Playwright e2e tests for the Chain of Action overlay (prefect.io).
 *
 * Loads the extension as a real Chrome extension (via --load-extension) so the
 * content script runs exactly as it would for a real user. Tests:
 *
 *  1. "Workflows as AI Tools" banner is injected into the Solutions dropdown on hover
 *  2. Clicking the banner shows the Chain of Action overlay
 *  3. Navigating to /solutions/chain-of-action directly shows the overlay
 *  4. Navigating away from /solutions/chain-of-action hides the overlay
 *
 * Run:  node prefect-io/chain-of-action.e2e.js
 *
 * Note: the Radix UI NavigationMenu on prefect.io renders dropdown panels lazily —
 * they are only added to the DOM when the user hovers the nav item. The content
 * script's MutationObserver detects the panel appearing and injects the banner
 * within ~150 ms of hover. Tests account for this by hovering first.
 */

const { chromium } = require("/tmp/node_modules/playwright");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const EXTENSION_PATH = path.resolve(__dirname, "..");
const PREFECT_URL = "https://www.prefect.io";
const BANNER_ID = "pdt-solutions-banner";
const OVERLAY_HOST_ID = "pdt-overlay-host";

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

/** Hover the Solutions nav button to trigger lazy panel render + MutationObserver injection. */
async function openSolutionsDropdown(page) {
  await page.hover('button:has-text("Solutions")');
  // Wait for MutationObserver debounce (150 ms) + injection + dropdown animation
  await page.waitForFunction((id) => !!document.getElementById(id), BANNER_ID, { timeout: 5_000 });
}

(async () => {
  // Throw-away user-data-dir required for launchPersistentContext
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-pdt-"));

  // Extensions work in headless mode since Chrome 112 ("headless=new").
  // Set HEADLESS=false locally if you need to watch the browser.
  const headless = process.env.HEADLESS !== "false";

  const args = [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ];
  if (headless) {
    // "--headless=new" is required for extension support in headless mode (Chrome 112+)
    args.push("--headless=new");
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args,
  });

  try {
    // ── Test 1: Banner injected into Solutions dropdown on hover ────────────
    console.log("Test 1: Banner injected into Solutions dropdown on hover");
    {
      const page = await context.newPage();
      await page.goto(PREFECT_URL, { waitUntil: "domcontentloaded" });
      // Wait for React hydration. There's no deterministic signal for when
      // Next.js finishes hydrating, so a fixed delay is the pragmatic choice here.
      await page.waitForTimeout(2000);

      // Banner should NOT be present before the dropdown is opened
      const beforeHover = await page.evaluate((id) => !!document.getElementById(id), BANNER_ID);
      assert(!beforeHover, "Banner not in DOM before hover (panel not yet rendered)");

      // Hover Solutions → panel renders → MutationObserver fires → banner injected
      await openSolutionsDropdown(page);

      const bannerText = await page.evaluate(
        (id) => document.getElementById(id)?.textContent ?? "",
        BANNER_ID,
      );
      assert(
        bannerText.includes("Workflows as AI Tools"),
        `Banner text contains "Workflows as AI Tools"`,
      );
      assert(bannerText.includes("NEW"), 'Banner text contains "NEW" badge');

      const bannerVisible = await page.locator(`#${BANNER_ID}`).isVisible();
      assert(bannerVisible, "Banner is visible in open Solutions dropdown");

      await page.screenshot({ path: "/tmp/test1_banner_injected.png" });
      await page.close();
    }

    // ── Test 2: Clicking banner shows Chain of Action overlay ───────────────
    console.log("\nTest 2: Clicking banner shows Chain of Action overlay");
    {
      const page = await context.newPage();
      await page.goto(PREFECT_URL, { waitUntil: "domcontentloaded" });
      // Wait for React hydration (no deterministic signal — fixed delay is pragmatic).
      await page.waitForTimeout(2000);

      await openSolutionsDropdown(page);
      await page.locator(`#${BANNER_ID}`).click();
      await page.waitForTimeout(500);

      const url = page.url();
      assert(
        url.includes("/solutions/chain-of-action"),
        `URL updated to /solutions/chain-of-action (got: ${url})`,
      );

      const overlayPresent = await page.evaluate(
        (id) => !!document.getElementById(id),
        OVERLAY_HOST_ID,
      );
      assert(overlayPresent, "Chain of Action overlay host is in the DOM");

      await page.screenshot({ path: "/tmp/test2_overlay_shown.png" });
      await page.close();
    }

    // ── Test 3: Direct navigation to /solutions/chain-of-action ────────────
    console.log("\nTest 3: Direct navigation to /solutions/chain-of-action shows overlay");
    {
      const page = await context.newPage();
      await page.goto(`${PREFECT_URL}/solutions/chain-of-action`, {
        waitUntil: "domcontentloaded",
      });

      await page.waitForFunction((id) => !!document.getElementById(id), OVERLAY_HOST_ID, {
        timeout: 10_000,
      });

      const overlayPresent = await page.evaluate(
        (id) => !!document.getElementById(id),
        OVERLAY_HOST_ID,
      );
      assert(overlayPresent, "Overlay shown on direct navigation to /solutions/chain-of-action");

      await page.screenshot({ path: "/tmp/test3_direct_nav.png" });
      await page.close();
    }

    // ── Test 4: Navigating away hides the overlay ───────────────────────────
    console.log("\nTest 4: Navigating away hides the Chain of Action overlay");
    {
      const page = await context.newPage();
      await page.goto(`${PREFECT_URL}/solutions/chain-of-action`, {
        waitUntil: "domcontentloaded",
      });

      await page.waitForFunction((id) => !!document.getElementById(id), OVERLAY_HOST_ID, {
        timeout: 10_000,
      });

      await page.goto(PREFECT_URL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const overlayGone = await page.evaluate(
        (id) => !document.getElementById(id),
        OVERLAY_HOST_ID,
      );
      assert(overlayGone, "Overlay removed after navigating away");

      await page.close();
    }
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All tests passed!");
})();
