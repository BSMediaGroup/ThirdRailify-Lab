# THIRD RAILIFY LAB
## Local working POC · 0.1.0-poc

A near-black/gold image workshop, thumbnail composer and research desk for the future private `lab.thirdrailify.com` workspace.

**This package runs on your machine. It is not deployed, and it does not implement the production account/approval/Turnstile gates. Do not tunnel or publish this POC.**

## Start on Windows

1. Extract the **contents** of the ZIP directly into `X:\GIT\ThirdRailify-Lab`. `START-LAB.cmd` and `server.mjs` should be immediately inside that folder, not another nested `ThirdRailify-Lab` folder. Preserve the existing `.git` directory.
2. Double-click **START-LAB.cmd**. Node 22 or newer is required. There is **no npm install and no build step**.
3. The browser opens at **http://127.0.0.1:4317**. Keep the console open.
4. Open **Connections**, paste your Replicate token, click **Save connections**, then **Test**. Keys go straight into this repository's `.env` file; you do not need PowerShell variables.
5. Select a model, click **Load model controls**, write a prompt and click **Generate**. Real generations use your provider API balance.

Use **Try a layout** or import your own image to review the layout and thumbnail editor without any provider key or generation charge. The sample layout is procedural artwork, explicitly not an AI-generated result.

Full instructions: [SETUP](docs/SETUP.md).

## Implemented

| Surface | POC behaviour |
|---|---|
| Replicate studio | Provider-backed model search, exact model/URL/version lookup, live schema-derived controls, reference-image inputs where the schema supports them, advanced JSON, asynchronous predictions, status polling and cancellation. |
| GPT / Grok images | Direct image API adapters with editable model IDs; one image per submission; local original-file saving. Direct image editing is not implemented here. |
| Output library | Local originals, job outcomes, prompt reuse, thumbnail projects and exported images. |
| Thumbnail composer | One background image, headline/subheading/badge/bolt, text positioning, colours, brightness treatment, fit or explicit fill/crop, common landscape/square/portrait presets, PNG/JPEG export and saved project readback. Not a full multilayer Photoshop replacement. |
| Research desk | Collapsible, draggable/keyboard-resizable sidebar, GPT/Grok selector, genuine response text streaming, per-provider local conversation, copy/use-as-prompt. Plain-text chat; no web tools or fabricated reasoning. |
| Google Images | Designed tab, query field and a real external Google Images action. Embedded API results are deferred. |
| Connections | Server-side `.env` saving, masked presence, API authentication tests, configurable model IDs and optional Replicate webhook-signing-key retrieval. |

Model lookup does not imply compatibility with every model on Replicate. This POC accepts ordinary JSON-shaped inputs and PNG/JPEG/WebP image outputs, not arbitrary video/audio/text pipelines. Complex schema unions or special integrations may require advanced inputs or a later adapter.

## Files and private data

```text
ThirdRailify-Lab/
├── START-LAB.cmd              # Double-click Windows launcher
├── RUN-TESTS.cmd              # Offline/native Node tests
├── package.json              # No dependencies
├── .env.example              # Optional empty-key configuration template
├── .gitignore
├── README.md
├── BUMP_NOTES.md
├── server.mjs                # Loopback HTTP service, jobs, files, config
├── lib/
│   ├── core.mjs              # Validation/config/schema/webhook helper
│   └── providers.mjs         # Replicate, OpenAI and SpaceXAI adapters
├── public/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── icons.svg
├── tests/
│   └── lab.test.mjs
└── docs/
    ├── SETUP.md
    ├── FUTURE-INTEGRATION.md
    └── TESTING.md
```

Created at runtime, **not included or committed**:

- `.env` — API credentials and local model defaults, readable by your local account/process.
- `.data/state.json` — local jobs, image references and thumbnail projects.
- `.data/assets/` — imported/generated originals and exports.
- Chat text — this browser's localStorage, separately for GPT and Grok. It is sent to the chosen provider when you submit that conversation.

The project `.env` takes precedence over inherited environment settings. Blank key fields preserve existing keys. To deliberately remove a saved key, stop the Lab, edit/remove its `.env` line, and relaunch. No keys are returned to the frontend or stored in browser localStorage.

This is single-user, local plaintext storage, not an encrypted multi-tenant archive. Back up `.data` and keep `.env` private. An original file and its thumbnail export are separate assets. Generated files remain on disk until you manage them yourself; there is not yet an in-app retention/deletion manager.

## Brand fonts

The Lab searches the sibling **`X:\GIT\ThirdRailify`** repository read-only for your existing American Captain, Blinker and Geist Mono files. When found, it serves them locally to this browser. It does not copy, alter or distribute those files.

**No font binaries are bundled.** If local fonts are absent, the CSS uses externally loaded Google Fonts fallbacks, then system fonts. Exact display typography therefore depends on the fonts available on your machine. Network-blocked/offline environments use their system fallbacks.

## Local boundary

The server binds only to `127.0.0.1`. Host/origin checks and a per-process request token reduce accidental cross-site API calls. These are basic loopback protections, **not production account authorization**. Anyone with access to this local browser/session/machine can use the POC.

The future service must reuse Third Railify's account system and approved-account policy, enforce authorization on every private API/asset, and apply Turnstile through the established verified server flow. See [future integration](docs/FUTURE-INTEGRATION.md).

## Validation

Double-click **RUN-TESTS.cmd**, or run `node --test` in this directory. See [TESTING](docs/TESTING.md) for exactly what was exercised and what was not.

Provider HTTP was simulated in automated tests; no user API token or paid live generation was available during this build. The first local generation is the live account/model/billing acceptance step.
