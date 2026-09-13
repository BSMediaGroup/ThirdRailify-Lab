import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { chromium } from "../../ThirdRailify/node_modules/playwright-core/index.mjs";

const origin = "http://127.0.0.1:8798";
const directory = `X:/GIT/ThirdRailify-Lab/.artifacts/browser/replicate-inputs-${Date.now()}`;
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  const check = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  check.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, check]);
}
function fixturePng(width = 640, height = 400) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 3;
      const gold = x > width * 0.56 && y > height * 0.18 && y < height * 0.82;
      raw[offset] = gold ? 232 : 36 + Math.floor((x / width) * 44);
      raw[offset + 1] = gold ? 189 : 25 + Math.floor((y / height) * 40);
      raw[offset + 2] = gold ? 85 : 54 + Math.floor((x / width) * 55);
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const png = fixturePng();
await mkdir(directory, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: process.env.LAB_BROWSER_HEADED !== "1",
});

async function loadModel(page, id) {
  await page.locator("#modelPicker").click();
  await page.locator("#modelQuery").fill(id);
  await page.locator("#searchModels").click();
  await page.locator("#modelsDialog").waitFor({ state: "hidden" });
  await page.locator("#schemaStatus").filter({ hasText: "Live inputs loaded" }).waitFor();
}

async function upload(page, field, names) {
  const files = names.map((name) => ({ name, mimeType: "image/png", buffer: png }));
  await page.locator(`[data-reference="${field}"]`).setInputFiles(files);
  await page.locator(`[data-preview="${field}"] .input-preview-item`).nth(files.length - 1).waitFor();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    {
      name: "thirdrailify_session",
      value: "local-browser-fixture-token-12345678901234567890",
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  let submitted;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text());
  });
  await page.route("**/api/generate", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        job: {
          id: "browser-fixture-job",
          provider: "replicate",
          model: submitted.model,
          status: "succeeded",
          createdAt: new Date().toISOString(),
          assets: [],
        },
      }),
    });
  });

  await page.goto(origin);
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await loadModel(page, "fixture/bria");

  assert.equal(await page.locator('[data-field="image"] input[type="file"]').count(), 1);
  assert.equal(await page.locator('[data-field="image_url"] input[type="file"]').count(), 0);
  assert.equal(await page.locator('[data-param="image_url"]').getAttribute("type"), "url");
  assert.equal(await page.locator('[data-field="original_image_size"] textarea').count(), 1);

  await upload(page, "image", ["private-source.png"]);
  await page.locator('#resultImage:not([hidden])').waitFor();
  assert.match(await page.locator("#canvasLabel").textContent(), /REFERENCE.*Image/i);
  assert.equal(await page.locator("#emptyStage").isHidden(), true);
  assert.match(await page.locator('[data-file-note="image"]').textContent(), /private file ready/i);

  await page.locator('[data-param="aspect_ratio"]').selectOption("16:9");
  await page.locator("#saveSession").click();
  await page.locator("#sessionNameInput").fill("Replicate private input acceptance");
  await page.locator("#sessionConfirm").click();
  await page.getByText("Project and research saved to your account.", { exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === "true");
  await page.locator('[data-preview="image"] img').waitFor();
  await page.locator('#resultImage:not([hidden])').waitFor();
  assert.equal(await page.locator('[data-param="aspect_ratio"]').inputValue(), "16:9");

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/generate")),
    page.locator("#generate").click(),
  ]);
  assert.ok(submitted, "Generate request was captured");
  assert.deepEqual(Object.keys(submitted.input).sort(), ["aspect_ratio", "image"]);
  assert.equal(submitted.input.image.kind, "lab_asset");
  assert.match(submitted.input.image.assetId, /^[a-f0-9-]{36}(?:\.(?:png|jpg|webp|gif))?$/);
  assert.equal(submitted.input.aspect_ratio, "16:9");
  assert.equal(submitted.input.image_url, undefined);
  assert.equal(submitted.input.prompt, undefined);

  for (const [width, height] of [[1920, 1080], [1440, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `horizontal overflow at ${width}px`);
    await page.screenshot({ path: `${directory}/bria-single-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadModel(page, "fixture/face-swap");
  assert.equal(await page.locator("#prompt").isHidden(), true);
  await upload(page, "swap_image", ["face.png"]);
  await upload(page, "input_image", ["target.png"]);
  assert.equal(await page.locator('[data-preview="swap_image"] img').count(), 1);
  assert.equal(await page.locator('[data-preview="input_image"] img').count(), 1);
  await page.screenshot({ path: `${directory}/two-required-images-1440.png`, fullPage: true });

  await loadModel(page, "fixture/image-array");
  await page.locator("#prompt").fill("Combine the references");
  await upload(page, "image_input", ["first.png", "second.png"]);
  assert.equal(await page.locator('[data-preview="image_input"] .input-preview-item').count(), 2);
  assert.equal(await page.locator('[data-preview="image_input"] [data-move-reference="up"]').count(), 2);
  await page.screenshot({ path: `${directory}/image-array-1440.png`, fullPage: true });

  await loadModel(page, "fixture/url-only");
  assert.equal(await page.locator("#parameterForm input[type=file]").count(), 0);
  assert.equal(await page.locator('[data-param="image_url"]').getAttribute("type"), "url");
  await page.screenshot({ path: `${directory}/url-only-1440.png`, fullPage: true });

  await loadModel(page, "fixture/text-only");
  assert.equal(await page.locator("#parameterForm input[type=file]").count(), 0);
  assert.equal(await page.locator("#prompt").isHidden(), false);
  await page.screenshot({ path: `${directory}/text-only-1440.png`, fullPage: true });

  assert.deepEqual(errors, []);
  const evidence = {
    directory,
    sanitizedSubmission: {
      fields: Object.fromEntries(Object.entries(submitted.input).map(([key, value]) => [key, value?.kind === "lab_asset" ? "lab_asset" : typeof value])),
      imageAssetIdPresent: true,
      containsBytes: false,
      containsPrivateUrl: false,
    },
    widths: [1920, 1440, 768, 390],
    errors,
  };
  await writeFile(`${directory}/checks.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  await context.close();
} finally {
  await browser.close();
}
