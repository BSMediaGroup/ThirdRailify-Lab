// Local fixtures only. Not part of the allowlisted release or production auth.
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { recordUsage } from "../lib/usage.mjs";
const origin = "http://127.0.0.1:8798";
const replicateSchemas = {
  "fixture/single-image": {
    required: ["image"],
    properties: {
      image: { type: "string", format: "uri", title: "Reference image" },
    },
  },
  "fixture/bria": {
    properties: {
      image: {
        type: "string",
        format: "uri",
        title: "Image",
        description: "Image file",
      },
      prompt: { type: "string" },
      image_url: {
        type: "string",
        title: "Image URL",
        description: "Image URL",
      },
      aspect_ratio: { type: "string", enum: ["1:1", "16:9"], default: "1:1" },
      original_image_size: {
        type: "array",
        items: { type: "integer" },
        minItems: 2,
        maxItems: 2,
      },
    },
  },
  "fixture/face-swap": {
    required: ["swap_image", "input_image"],
    properties: {
      swap_image: { type: "string", format: "uri", title: "Swap image" },
      input_image: { type: "string", format: "uri", title: "Input image" },
    },
  },
  "fixture/multi-image": {
    properties: {
      prompt: { type: "string" },
      image: { type: "string", format: "uri", title: "Source image" },
      mask: { type: "string", format: "uri", title: "Mask image" },
    },
  },
  "fixture/image-array": {
    required: ["prompt"],
    properties: {
      prompt: { type: "string" },
      image_input: {
        type: "array",
        items: { type: "string", format: "uri" },
        maxItems: 4,
        title: "Reference images",
      },
    },
  },
  "fixture/url-only": {
    required: ["image_url"],
    properties: {
      image_url: {
        type: "string",
        title: "Image URL",
        description: "HTTPS image URL",
      },
    },
  },
  "fixture/text-only": {
    required: ["text"],
    properties: { text: { type: "string" } },
  },
};
const account = {
  id: "local-browser-fixture",
  displayName: "Workshop Test",
  role: "admin",
  adminLevel: "master",
  status: "active",
  avatarUrl: null,
};
const csrf = "local-browser-fixture-csrf",
  token = "local-browser-fixture-token-12345678901234567890";
const hash = (s) => createHash("sha256").update(s).digest("base64url");
const mime = (p) =>
  p.endsWith(".js")
    ? "text/javascript"
    : p.endsWith(".css")
      ? "text/css"
      : p.endsWith(".svg")
        ? "image/svg+xml"
        : p.includes("/brand-fonts/")
          ? "font/ttf"
          : "text/html";
const manifest = JSON.parse(
  await readFile(new URL("../build-assets.json", import.meta.url), "utf8"),
);
const allowed = new Set([...Object.values(manifest), "lab.css"]);
const mf = new Miniflare({
  host: "127.0.0.1",
  port: 8798,
  modules: true,
  scriptPath: new URL(
    "../.artifacts/functions-build/index.js",
    import.meta.url,
  ).pathname.slice(1),
  compatibilityDate: "2026-09-12",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["LAB_DB", "THIRDRAILIFY_AUTH_DB"],
  r2Buckets: ["LAB_FILES"],
  bindings: {
    LAB_ENABLED: "true",
    LAB_PAID_ENABLED: "false",
    LAB_ORIGIN: origin,
    THIRDRAILIFY_ADMIN_ORIGIN: "https://admin.thirdrailify.com",
    REPLICATE_API_TOKEN: "local-replicate-fixture",
    OPENAI_API_KEY: "local-openai-fixture",
    XAI_API_KEY: "local-xai-fixture",
    PEXELS_API_KEY: "local-pexels-fixture",
    PIXABAY_API_KEY: "local-pixabay-fixture",
    UNSPLASH_ACCESS_KEY: "local-unsplash-fixture",
    LAB_VAULT_MASTER_KEY_V1: Buffer.alloc(32, 7).toString("base64url"),
    LAB_ASSET_DELIVERY_SIGNING_SECRET: Buffer.alloc(32, 11).toString(
      "base64url",
    ),
    GOOGLE_PSE_CX: "local-google-fixture-cx",
  },
  serviceBindings: {
    ASSETS: async (request) => {
      let path = new URL(request.url).pathname.slice(1);
      if (!path || path === "research") path = "index.html";
      if (!allowed.has(path)) return new Response("Not found", { status: 404 });
      return new Response(
        await readFile(new URL("../dist/" + path, import.meta.url)),
        { headers: { "Content-Type": mime("/" + path) } },
      );
    },
  },
  outboundService: async (request) => {
    if (request.url === "https://admin.thirdrailify.com/api/workshop/session")
      return Response.json({
        ok: true,
        authenticated: true,
        account,
        csrfToken: csrf,
        workshop: {
          allowed: true,
          source: "local_test_fixture",
          canManageAccess: true,
          canManageProviders: true,
          canManageProfileRestrictions: true,
        },
      });
    if (request.url.startsWith("https://cloudflare-dns.com/dns-query"))
      return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    if (request.url.startsWith("https://fixture.images.example/"))
      return new Response(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
        { headers: { "Content-Type": "image/png" } },
      );
    if (request.url.startsWith("https://api.openai.com/v1/models"))
      return Response.json({
        data: [{ id: "gpt-5-mini" }, { id: "gpt-image-1" }],
      });
    if (request.url.startsWith("https://api.x.ai/v1/models"))
      return Response.json({
        data: [{ id: "grok-4-fast-reasoning" }, { id: "grok-imagine-image" }],
      });
    if (request.url.startsWith("https://api.pexels.com/v1/search"))
      return Response.json(
        {
          total_results: 1,
          photos: [
            {
              id: 4,
              width: 1200,
              height: 800,
              url: "https://www.pexels.com/photo/4",
              photographer: "Workshop Artist",
              photographer_url: "https://www.pexels.com/@workshop",
              alt: "Gold violet studio",
              src: {
                original: "https://fixture.images.example/reference.png",
                large: "https://fixture.images.example/reference.png",
              },
            },
          ],
        },
        {
          headers: {
            "x-ratelimit-limit": "200",
            "x-ratelimit-remaining": "199",
          },
        },
      );
    if (request.url.startsWith("https://pixabay.com/api/"))
      return Response.json({
        totalHits: 1,
        hits: [
          {
            id: 7,
            type: "photo",
            tags: "violet studio",
            pageURL: "https://pixabay.com/photos/7",
            largeImageURL: "https://fixture.images.example/reference.png",
            webformatURL: "https://fixture.images.example/reference.png",
            imageWidth: 1200,
            imageHeight: 800,
            user: "Workshop",
            user_id: 9,
          },
        ],
      });
    if (request.url.startsWith("https://api.unsplash.com/search/photos"))
      return Response.json({
        total: 1,
        total_pages: 1,
        results: [
          {
            id: "u1",
            width: 1200,
            height: 800,
            alt_description: "Unsplash workshop",
            urls: {
              regular: "https://images.unsplash.com/u1",
              small: "https://images.unsplash.com/u1-small",
            },
            links: {
              html: "https://unsplash.com/photos/u1",
              download_location: "https://api.unsplash.com/photos/u1/download",
            },
            user: {
              name: "Workshop Artist",
              links: { html: "https://unsplash.com/@workshop" },
            },
          },
        ],
      });
    if (request.url.includes("/photos/u1/download"))
      return new Response(null, { status: 200 });
    if (request.url.startsWith("https://api.replicate.com/v1/models/")) {
      const id = new URL(request.url).pathname.split("/").slice(-2).join("/");
      const fixture = replicateSchemas[id] || {
        properties: { prompt: { type: "string" } },
      };
      return Response.json({
        name: id.split("/").at(-1),
        owner: id.split("/")[0],
        description: "Local schema fixture",
        cover_image_url:
          "https://fixture.images.example/" + encodeURIComponent(id) + ".png",
        run_count: 693183614,
        url: "https://replicate.com/" + id,
        latest_version: {
          id: "a".repeat(64),
          openapi_schema: {
            components: {
              schemas: {
                Input: {
                  type: "object",
                  properties: fixture.properties,
                  required: fixture.required || [],
                },
              },
            },
          },
        },
      });
    }
    return Response.json(
      {
        error: {
          message: "External providers are disabled in this local fixture.",
        },
      },
      { status: 503 },
    );
  },
});
const env = await mf.getBindings();
async function migration(db, url) {
  let part = "";
  for (const line of (await readFile(url, "utf8"))
    .replace(/^--.*$/gm, "")
    .split(/\r?\n/)) {
    part += line + "\n";
    if (line.trim().endsWith(";")) {
      await db.prepare(part).run();
      part = "";
    }
  }
}
await migration(
  env.LAB_DB,
  new URL("../migrations/0001_lab.sql", import.meta.url),
);
await migration(
  env.LAB_DB,
  new URL("../migrations/0002_provider_vault_stock_usage.sql", import.meta.url),
);
await migration(
  env.LAB_DB,
  new URL("../migrations/0003_provider_cost_intelligence.sql", import.meta.url),
);
await migration(
  env.LAB_DB,
  new URL(
    "../migrations/0004_usage_classification_repair.sql",
    import.meta.url,
  ),
);
const authMigrationsRoot = process.env.LAB_TEST_ADMIN_ROOT
  ? new URL(
      "migrations/",
      new URL(
        "file:///" +
          process.env.LAB_TEST_ADMIN_ROOT.replace(/\\/g, "/").replace(
            /\/?$/,
            "/",
          ),
      ),
    )
  : new URL("../../ThirdRailify-Admin/migrations/", import.meta.url);
for (const name of [
  "0001_auth_foundation.sql",
  "0002_full_admin_capability_denials.sql",
  "0003_workshop_access.sql",
  "0004_workshop_provider_profile_restrictions.sql",
])
  await migration(env.THIRDRAILIFY_AUTH_DB, new URL(name, authMigrationsRoot));
await env.THIRDRAILIFY_AUTH_DB.prepare(
  "INSERT INTO accounts(id,display_name,role,admin_level,status,created_at,updated_at,source) VALUES(?,'Workshop Test','admin','master','active','2026-01-01','2026-01-01','test')",
)
  .bind(account.id)
  .run();
await env.THIRDRAILIFY_AUTH_DB.prepare(
  "INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)",
)
  .bind(
    "browser-fixture",
    account.id,
    hash(token),
    hash(csrf),
    "2026-01-01",
    "2099-01-01",
    "2026-01-01",
    null,
    origin,
    null,
  )
  .run();
for (const [index, event] of [
  {
    provider: "xai",
    model: "grok-4.6",
    operation: "research_chat",
    outcome: "succeeded",
    inputTokens: 3519,
    cachedTokens: 512,
    outputTokens: 253,
    actualCostTicks: 77_880_000,
    toolCalls: 1,
  },
  {
    provider: "replicate",
    model: "black-forest-labs/flux-schnell",
    operation: "image_generation",
    outcome: "succeeded",
    generatedOutputs: 1,
  },
  {
    provider: "pexels",
    operation: "stock_search",
    outcome: "succeeded",
    searchCount: 1,
  },
].entries())
  await recordUsage(env, {
    idempotencyKey: "browser-usage-" + index,
    logicalRequestId: "browser-operation-" + index,
    ownerId: account.id,
    startedAt: new Date(Date.now() - index * 2 * 3600000).toISOString(),
    ...event,
  });
console.log(
  "Local Pages runtime ready at " +
    origin +
    " (local fixtures, providers disabled).",
);
process.on("SIGINT", async () => {
  await mf.dispose();
  process.exit(0);
});
