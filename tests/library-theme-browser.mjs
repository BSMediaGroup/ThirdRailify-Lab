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
    response.setHeader("Content-Type", pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".svg") ? "image/svg+xml" : pathname.includes("brand-fonts/") ? "font/ttf" : "text/html");
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const jobs = [
  { id: "generation-replicate-1", sessionId: "project-1", requestId: "request-replicate-1", provider: "replicate", providerId: "prediction-1", providerUrl: "https://replicate.com/p/prediction-1", model: "black-forest-labs/flux-2-pro", prompt: "GOLD AND PURPLE STUNNING ABSTRACTION", status: "succeeded", phase: "Originals stored privately", createdAt: "2026-09-12T12:56:37.000Z", updatedAt: "2026-09-12T12:57:12.000Z", attempts: 1, error: null, assets: [{ id: "asset-1", title: "Gold and purple abstraction" }], metrics: { predict_time: 7.4 } },
  { id: "generation-xai-1", sessionId: "project-1", requestId: "request-xai-1", provider: "xai", providerId: null, providerUrl: null, model: "grok-imagine-image-2.0", prompt: "CINEMATIC WORKSHOP POSTER", status: "canceled", phase: "Provider finished", createdAt: "2026-09-12T12:32:49.000Z", updatedAt: "2026-09-12T12:33:01.000Z", attempts: 1, error: null, assets: [], metrics: null },
  { id: "generation-openai-1", sessionId: "project-1", requestId: "request-openai-1", provider: "openai", providerId: null, providerUrl: null, model: "gpt-image-1", prompt: "THIRD RAIL CONCEPT FRAME", status: "queued", phase: "Queued for processor", createdAt: "2026-09-12T12:30:39.000Z", updatedAt: "2026-09-12T12:30:39.000Z", attempts: 0, error: null, assets: [], metrics: null }
];
const apiState = { ok: true, csrfToken: "fixture-csrf", preferencesRevision: 0, preferences: {}, projects: [{ id: "project-1", name: "Test Project", revision: 1, updatedAt: "2026-09-13T02:57:26.000Z", partial: true }], assets: [], attachments: [], jobs, catalog: [], config: { keys: { REPLICATE_API_TOKEN: false, OPENAI_API_KEY: false, XAI_API_KEY: false, REPLICATE_WEBHOOK_SIGNING_SECRET: false }, googleImages: { configured: false }, models: {}, fonts: ["display", "body", "bodybold", "mono"], brand: { logo: true, logoSource: "assets/logos/labs0.svg", fonts: { display: "American Captain" }, providers: { replicate: true, openai: true, xai: true } }, keyTests: {}, version: "0.4.0", localOnly: false, webhooks: false, canManageProviders: true } };

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname === "/api/auth/session" ? { authenticated: true, account: { id: "fixture-account", displayName: "Workshop Test", adminLevel: "master" }, csrfToken: "fixture-csrf", workshop: { allowed: true, source: "local_test_fixture", canManageProviders: true } } : pathname === "/api/state" ? apiState : { ok: false, error: "not_found" };
      return route.fulfill({ status: pathname === "/api/auth/session" || pathname === "/api/state" ? 200 : 404, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    try { await page.waitForFunction(() => document.body.dataset.ready === "true"); }
    catch (error) { throw new Error(`Lab fixture did not become ready at ${viewport.width}px: ${errors.join(" | ")} | ${await page.locator("#mainError").textContent()}`, { cause: error }); }
    await page.locator("#libraryButton").click();
    await page.locator(".job-row").first().waitFor();
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
        jobListDisplay: getComputedStyle(document.querySelector("#jobList")).display,
        providerMask: getComputedStyle(job.querySelector(".provider-logo")).maskImage,
        providerColor: getComputedStyle(job.querySelector(".provider-logo")).color,
        chipColor: getComputedStyle(job.querySelector(".job-provider-chip")).color
      };
    });
    assert.equal(appearance.overflow, false, `library overflow at ${viewport.width}px`);
    assert.match(appearance.projectBackground, /radial-gradient/);
    assert.match(appearance.projectAccent, /linear-gradient/);
    assert.equal(appearance.projectBorder, "rgb(61, 51, 69)");
    assert.equal(appearance.jobBackground, "none");
    assert.match(appearance.jobBorder, /rgba\(0, 0, 0, 0\)/);
    assert.equal(appearance.jobRadius, "11px");
    assert.equal(appearance.jobListDisplay, "grid");
    assert.match(appearance.providerMask, /brand-assets\/replicate\.svg/);
    assert.equal(appearance.providerColor, appearance.chipColor);
    assert.doesNotMatch(JSON.stringify(appearance), /rgb\(22, 24, 16\)|rgb\(53, 66, 42\)|rgb\(148, 162, 124\)/);
    await page.locator(".job-row").first().hover();
    await page.waitForTimeout(220);
    const hover = await page.locator(".job-row").first().evaluate((job) => ({ background: getComputedStyle(job).backgroundImage, border: getComputedStyle(job).borderColor, hint: getComputedStyle(job.querySelector(".job-view-hint")).opacity }));
    assert.match(hover.background, /radial-gradient/);
    assert.equal(hover.border, "rgb(81, 68, 93)");
    if (viewport.width > 650) assert.equal(hover.hint, "1");
    await page.screenshot({ path: new URL(`library-history-hover-${viewport.width}.png`, artifacts).pathname.slice(1), fullPage: true });
    await page.locator(".job-summary").first().click();
    await page.locator("#jobDetailsDialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("#jobDetailsDialog .provider-logo").count(), 1);
    assert.match(await page.locator("#jobDetailsBody").innerText(), /Generation ID[\s\S]*generation-replicate-1[\s\S]*Provider metrics/i);
    await page.screenshot({ path: new URL(`library-history-details-${viewport.width}.png`, artifacts).pathname.slice(1), fullPage: true });
    await page.keyboard.press("Escape");
    assert.equal(errors.length, 0, errors.join("\n"));
    await context.close();
  }
  console.log("Generation history provider marks, hover treatment and details lightbox passed at three widths.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
