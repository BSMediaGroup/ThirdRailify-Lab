import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs";

const root = new URL("../", import.meta.url);
const artifacts = new URL("../.artifacts/document-toolbar/", import.meta.url);
await mkdir(artifacts, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    let pathname = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    if (!pathname.includes(".")) pathname = "index.html";
    const body = await readFile(new URL(`dist/${pathname}`, root));
    response.setHeader("Content-Type", pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".svg") ? "image/svg+xml" : pathname.includes("brand-fonts/") ? "font/ttf" : "text/html");
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.route("**/*.js", (route) => route.abort());
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.body.dataset.ready = "true"; });

    const layout = await page.locator(".document-tools").evaluate((toolbar) => {
      const toggle = toolbar.querySelector("#researchVisibility");
      const pin = toolbar.querySelector("#railPin");
      const rail = toolbar.closest(".document-rail");
      const toggleStyle = getComputedStyle(toggle);
      const toggleRect = toggle.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      return {
        lastControl: toolbar.lastElementChild?.id,
        display: toggleStyle.display,
        borderLeft: toggleStyle.borderLeftWidth,
        borderRight: toggleStyle.borderRightWidth,
        afterPin: toggleRect.left >= pinRect.right,
        endGap: Math.round((railRect.right - toggleRect.right) * 10) / 10,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });

    assert.equal(layout.lastControl, "researchVisibility", `Research toggle is last at ${viewport.width}px`);
    assert.equal(layout.overflow, false, `Document rail does not overflow at ${viewport.width}px`);
    if (viewport.width > 650) {
      assert.equal(layout.display, "flex");
      assert.equal(layout.borderLeft, "1px");
      assert.equal(layout.afterPin, true);
      assert.ok(layout.endGap >= 0 && layout.endGap <= 8, `Research toggle reaches the rail end at ${viewport.width}px`);
    } else {
      assert.equal(layout.display, "none", "Existing compact-phone visibility behavior remains unchanged");
    }
    await page.screenshot({ path: path.join(artifacts.pathname.slice(1), `document-toolbar-${viewport.width}.png`) });
    await page.close();
  }
  console.log("Document toolbar order, divider, fit and phone behavior passed at four widths.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
