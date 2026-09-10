# THIRD RAILIFY LAB
## Local working POC · 0.2.0-poc

A near-black/gold image workshop, thumbnail composer and research desk for the future private `lab.thirdrailify.com` workspace.

**This package runs on your machine. It is not deployed, and it does not implement the production account/approval/Turnstile gates. Do not tunnel or publish this POC.**

## Start on Windows

1. Extract the **contents** of the ZIP directly into `X:\GIT\ThirdRailify-Lab\poc`. Stop the old Lab first. Merge/replace application files; preserve `.env`, `.data`, local `assets` and the repository `.git` directory. `START-LAB.cmd` and `server.mjs` should be immediately inside that folder, not another nested `ThirdRailify-Lab` folder. Preserve the existing `.git` directory.
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
| GPT / Grok images | Separate automatically loaded provider-backed image model dropdowns with refresh and saved selection; direct image API adapters; one image per submission; local original-file saving. Direct image editing is not implemented here. |
| Output library | Local originals, job outcomes, prompt reuse, image/thumbnail sessions and exported images. Discard current work, reopen/delete sessions, delete history, and delete unreferenced local images. |
| Thumbnail composer | One background image, headline/subheading/badge/bolt, text positioning, colours, brightness treatment, fit or explicit fill/crop, common landscape/square/portrait presets, PNG/JPEG export and saved project readback. Not a full multilayer Photoshop replacement. |
| Research desk | Collapsible sidebar with viewport-based wide resizing, dedicated window/tab route, GPT/Grok provider and model selectors, genuine response text streaming, shared per-provider local conversation/draft, chat history/deletion and copy/use-as-prompt. Plain-text chat; no web tools or fabricated reasoning. |
| Shell | Icon-only left-sidebar mode, original Public brand-box/hover styling with local labs0.svg, and Admin-style account/login scaffold (not authenticated). |
| Google Images | Designed tab, query field and a real external Google Images action. Embedded API results are deferred. |
| Connections | Server-side `.env` saving, masked presence, API authentication tests, provider-backed default-model selectors and optional Replicate webhook-signing-key retrieval. |

Model lookup does not imply compatibility with every model on Replicate. This POC accepts ordinary JSON-shaped inputs and PNG/JPEG/WebP image outputs, not arbitrary video/audio/text pipelines. Complex schema unions or special integrations may require advanced inputs or a later adapter.

## Files and private data

```text
ThirdRailify-Lab/poc/
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
│   ├── models.mjs            # Live GPT/Grok catalogue discovery and cache
│   ├── brand.mjs             # Read-only nested-poc brand asset resolver
│   └── providers.mjs         # Replicate, OpenAI and SpaceXAI adapters
├── public/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   ├── upgrade.css           # Model/session/layout/brand additions
│   └── icons.svg
├── tests/
│   ├── lab.test.mjs
│   └── upgrade.test.mjs
└── docs/
    ├── UPDATE-0.2.md
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

This is single-user, local plaintext storage, not an encrypted multi-tenant archive. Back up `.data` and keep `.env` private. An original file and its thumbnail export are separate assets. The Library has explicit deletion controls. Deleting a session or generation-history record retains its image files. Deleting an image permanently removes the local file and is blocked while a saved session references it. Provider-side records and copies downloaded elsewhere are not deleted. Generation request-ID tombstones remain internally so a hidden history record cannot accidentally resubmit a paid request.

## Brand assets and nested `/poc` installation

The resolver checks only named, read-only assets in this order:
1. `X:\GIT\ThirdRailify-Lab\poc\assets`
2. `X:\GIT\ThirdRailify-Lab\assets`
3. `X:\GIT\ThirdRailify\assets`
4. `X:\GIT\ThirdRailify-Admin\assets`

Title: `fonts/headings/American Captain.ttf` or `.otf`.
Body: `fonts/body/Blinker-Regular.ttf` and `Blinker-SemiBold.ttf`.
Monospace: `fonts/monospace/GeistMono-VariableFont_wght.ttf`.
Brand motif: `logos/labs0.svg`.

The header's 42px rounded-square, gold gradient mask, inset border, glow and hover
colour movement use the Public site's inspected brand CSS, changing the motif
URL to the local labs0.svg. No replacement motif is invented: when absent a LAB
placeholder is shown, and Connections reports the missing file. Restart the Lab
after adding brand files. The account widget follows the inspected Admin layout,
with a truthful Local operator / Login not connected identity and avatar-only
mobile trigger. It does not authenticate or read a real Admin session.

**No font binaries are bundled.** Local American Captain drives both headings and
thumbnail text when found. Without it, a system display fallback is used. The
existing optional external body/monospace font fallback remains; no provider key
is sent with font requests. Connections displays the actual relative file paths.

## Model selection

Image generation and chat each have independent provider/model dropdowns. GPT
uses the authenticated OpenAI model list, filtered for supported image versus
text-model ID families. Grok uses its image-generation and language-model lists,
with general-catalogue fallback only when a typed endpoint is not present.
Model IDs are not a fabricated static menu. A saved preference is used only when
it is in the returned list; otherwise an available listed option is selected.
Model catalogue reads do not submit an inference job. Refresh buttons reload;
the local server coalesces requests and caches successful catalogues for five
minutes. A failed refresh with an older list is explicitly labelled stale.

OpenAI's model-list response is not a full capability/parameter schema. Filtering
is a compatibility heuristic, and model-specific input/access failures remain
visible on actual submission. Specialized or fine-tuned models requiring another
endpoint are not claimed universally compatible. If catalogue lookup fails, an
existing configured choice may be offered as an explicitly unverified saved
setting, never as a successful discovery result. No default GPT/Grok IDs are
invented for a new installation.

## Sessions and detached research

Save session stores prompt, provider/model choice, selected local asset and
thumbnail settings in `.data`. Legacy 0.1 thumbnail projects remain readable.
Generation reference-file data is deliberately not embedded in a project; the
session reminds you to reattach reference files after reopening.

New / discard work resets the workspace without deleting saved sessions, images
or submitted jobs. Cancel a running job through its separate Cancel action.
Chat text and archives remain in this browser's localStorage, not on the disk
project ledger. New chat archives the current conversation; the trash button
clears the current one; History opens/deletes past conversations.

Research can open in a dedicated `/research` window or tab, retaining provider,
conversation and unsent draft. Same-origin browser storage and BroadcastChannel
coordinate views; Web Locks prevent two simultaneous sends to the same current
provider conversation in supporting browsers. Use as prompt sends reviewed text
back to the main workspace. Keep the same host/port/browser profile for shared
history. The window must finish/stop a response before Dock closes it.

## Local boundary

The server binds only to `127.0.0.1`. Host/origin checks and a per-process request token reduce accidental cross-site API calls. These are basic loopback protections, **not production account authorization**. Anyone with access to this local browser/session/machine can use the POC.

The future service must reuse Third Railify's account system and approved-account policy, enforce authorization on every private API/asset, and apply Turnstile through the established verified server flow. See [future integration](docs/FUTURE-INTEGRATION.md).

## Validation

Double-click **RUN-TESTS.cmd**, or run `node --test` in this directory. See [TESTING](docs/TESTING.md) for exactly what was exercised and what was not.

Provider HTTP was simulated in automated tests; no user API token or paid live generation was available during this build. The first local generation is the live account/model/billing acceptance step.
