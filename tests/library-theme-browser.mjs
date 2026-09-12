import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs";

const root = new URL("../", import.meta.url);
const artifacts = new URL("../.artifacts/library-theme/", import.meta.url);
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
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.route("**/*.js", (route) => route.abort());
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.querySelector("#appShell").classList.add("shell-mode");
      document.querySelector("#libraryPage").hidden = false;
      document.querySelector("#projectList").innerHTML = `
        <div class="project-entry">
          <button class="project-chip">Test Project<small>Project + research · 9/13/2026, 2:57:26 AM</small></button>
          <button class="icon-button" aria-label="Rename session">✎</button>
          <button class="icon-button danger-text" aria-label="Delete session">×</button>
        </div>`;
      document.querySelector("#jobList").innerHTML = ["succeeded", "canceled", "queued"].map((status) => `
        <div class="job-row">
          <div><strong>GOLD AND PURPLE STUNNING ABSTRACTION</strong><p>replicate / black-forest-labs/flux-2-pro</p><span class="micro">${status} · 9/12/2026, 10:56:37 PM</span></div>
          <div class="job-buttons"><button class="text-button danger-text">Delete history</button></div>
        </div>`).join("");
    });
    await page.evaluate(() => document.fonts.ready);

    const appearance = await page.evaluate(() => {
      const project = document.querySelector(".project-entry");
      const job = document.querySelector(".job-row");
      const projectStyle = getComputedStyle(project);
      const jobStyle = getComputedStyle(job);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        projectBackground: projectStyle.backgroundImage,
        projectBorder: projectStyle.borderColor,
        projectAccent: getComputedStyle(project, "::before").backgroundImage,
        jobBackground: jobStyle.backgroundImage,
        jobBorder: jobStyle.borderColor,
        jobRadius: jobStyle.borderRadius,
        jobListDisplay: getComputedStyle(document.querySelector("#jobList")).display
      };
    });
    assert.equal(appearance.overflow, false, `library overflow at ${viewport.width}px`);
    assert.match(appearance.projectBackground, /radial-gradient/);
    assert.match(appearance.projectAccent, /linear-gradient/);
    assert.equal(appearance.projectBorder, "rgb(61, 51, 69)");
    assert.match(appearance.jobBackground, /radial-gradient/);
    assert.equal(appearance.jobBorder, "rgb(57, 48, 63)");
    assert.equal(appearance.jobRadius, "11px");
    assert.equal(appearance.jobListDisplay, "grid");
    assert.doesNotMatch(JSON.stringify(appearance), /rgb\(22, 24, 16\)|rgb\(53, 66, 42\)|rgb\(148, 162, 124\)/);
    await page.screenshot({ path: new URL(`library-${viewport.width}.png`, artifacts).pathname.slice(1), fullPage: true });
    await page.close();
  }
  console.log("Workspace project cards and generation history theme passed at three widths.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
