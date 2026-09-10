# THIRD RAILIFY LAB
## Local working POC · 0.3.0-poc

A near-black/gold image workshop, thumbnail composer and research desk for the future private `lab.thirdrailify.com` workspace.

**This package runs on your machine. It is not deployed, and it does not implement the production account/approval/Turnstile gates. Do not tunnel or publish this POC.**

## Start on Windows

1. Extract the **contents** of the ZIP directly into `X:\GIT\ThirdRailify-Lab\poc`. Stop the old Lab first. Merge/replace application files; preserve `.env`, `.data`, local `assets` and the repository `.git` directory. `START-LAB.cmd` and `server.mjs` should be immediately inside that folder, not another nested `ThirdRailify-Lab` folder. Preserve the existing `.git` directory.
2. Double-click **START-LAB.cmd**. Node 22 or newer is required. There is **no npm install and no build step**.
3. The browser opens at **http://127.0.0.1:4317**. Keep the console open.
4. Existing keys remain in `poc/.env`; do not enter them again for an update. For a new installation, use **Connections → Save connections → Test**. No PowerShell variables are needed.
5. Select a model and load its controls. Text models use **Generate**; input-only models use **Run model** after their required inputs are filled. No unrelated prompt is required. Real generations use your provider API balance.

Use **Try a layout** or import your own image to review the layout and thumbnail editor without any provider key or generation charge. The sample layout is procedural artwork, explicitly not an AI-generated result.

Update instructions: [UPDATE-0.3](docs/UPDATE-0.3.md). Full instructions: [SETUP](docs/SETUP.md).

**This is a complete, cumulative package, not a patch.** It contains the launcher, server, all supporting modules, all three stylesheets, all browser scripts, tests and documentation. Extract its contents into the existing `poc` folder without deleting that folder. It includes no `.env`, `.data`, `.git`, user assets or font binaries.

## Implemented

| Surface | POC behavior |
|---|---|
| Replicate studio | Provider-backed model search, exact model/URL/version lookup, live schema-derived controls, reference-image inputs where the schema supports them, advanced JSON, asynchronous predictions, status polling and cancellation. |
| GPT / Grok images | Separate automatically loaded provider-backed image model dropdowns with refresh and saved selection; direct image API adapters; one image per submission; local original-file saving. Direct image editing is not implemented here. |
| Output library | Local originals, job outcomes, prompt reuse, image/thumbnail sessions and exported images. Discard current work, reopen/delete sessions, delete history, and delete unreferenced local images. |
| Thumbnail composer | One background image, headline/subheading/badge/bolt, text positioning, colors, brightness treatment, fit or explicit fill/crop, common landscape/square/portrait presets, PNG/JPEG export and saved project readback. Not a full multilayer Photoshop replacement. |
| Research desk | Collapsible sidebar with viewport-based wide resizing, dedicated window/tab route, GPT/Grok provider and model selectors, genuine response text streaming, shared per-provider local conversation/draft, chat history/deletion and copy/use-as-prompt. Plain-text chat; no web tools or fabricated reasoning. |
| Shell | Shared project tabs with close confirmations and overlay auto-hide, resizable/collapsible left controls, wider resizable Research desk, full Library and Settings pages, header layout menu, local labs0.svg brand treatment, and an Admin-style account/login scaffold (not authenticated). |
| Model workflows | Schema-driven prompt requirements; central Run model action for image-only models; local-upload/HTTPS-image previews; returned Replicate cover art and current-model information panel. |
| Creative directions | Editable Original, Cinematic, Thumbnail and Railify instructions in a local preset lightbox. |
| Settings | Working connections, layout and preset controls; usage, token and balance reporting is visibly deferred rather than populated with fabricated figures. |
| Google Images | Designed tab, query field and a real external Google Images action. Embedded API results are deferred. |
| Connections | Server-side `.env` saving, masked presence, API authentication tests, provider-backed default-model selectors and optional Replicate webhook-signing-key retrieval. |

Model lookup does not imply compatibility with every model on Replicate. This POC accepts ordinary JSON-shaped inputs and PNG/JPEG/WebP image outputs, not arbitrary video/audio/text pipelines. Complex schema unions or special integrations may require advanced inputs or a later adapter.

## Files and private data

```text
ThirdRailify-Lab/poc/
├── START-LAB.cmd              # Double-click Windows launcher
├── RUN-TESTS.cmd              # Offline native Node regression tests
├── VERIFY-PACKAGE.cmd         # Optional read-only integrity check
├── package.json              # Version 0.3.0-poc; no dependencies
├── PACKAGE-MANIFEST.json      # File lengths and SHA-256 hashes
├── .env.example              # Empty-key template, NOT your .env
├── .gitignore
├── README.md
├── BUMP_NOTES.md
├── server.mjs                # Loopback HTTP, jobs, files and config
├── lib/
│   ├── core.mjs              # Validation/config/webhook helper
│   ├── models.mjs            # Provider model discovery and cache
│   ├── brand.mjs             # Read-only nested-poc brand resolver
│   └── providers.mjs         # Provider request/metadata adapters
├── public/
│   ├── index.html
│   ├── app.js                # Studio, composer and shared project UI
│   ├── model-schema.js       # Browser/server prompt workflow contract
│   ├── style.css             # Original complete visual foundation
│   ├── upgrade.css           # Model/session/brand additions
│   ├── workspace.css         # Tabs, full pages, previews and resize
│   └── icons.svg
├── scripts/
│   └── verify-package.mjs    # Dependency-free manifest verifier
├── tests/
│   ├── lab.test.mjs
│   ├── upgrade.test.mjs
│   └── workspace.test.mjs
└── docs/
    ├── UPDATE-0.3.md
    ├── UPDATE-0.2.md          # Historical instructions
    ├── SETUP.md
    ├── FUTURE-INTEGRATION.md
    ├── TESTING.md
    └── TESTING-0.2.md         # Historical validation record
```

Created at runtime, **not included or committed**:

- `.env` — API credentials and local model defaults, readable by your local account/process.
- `.data/state.json` — local jobs, image references and thumbnail projects.
- `.data/assets/` — imported/generated originals and exports.
- Open tabs, unsaved project state and research drafts/history — browser localStorage, partitioned by project and chat provider. Saving a project also stores its research snapshot in `.data/state.json`. Chat is sent to a provider only when submitted.
- `.data/state.json` also retains locally saved creative-direction instructions.

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
color movement use the Public site's inspected brand CSS, changing the motif
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
with general-catalog fallback only when a typed endpoint is not present.
Model IDs are not a fabricated static menu. A saved preference is used only when
it is in the returned list; otherwise an available listed option is selected.
Model catalog reads do not submit an inference job. Refresh buttons reload;
the local server coalesces requests and caches successful catalogs for five
minutes. A failed refresh with an older list is explicitly labelled stale.

OpenAI's model-list response is not a full capability/parameter schema. Filtering
is a compatibility heuristic, and model-specific input/access failures remain
visible on actual submission. Specialized or fine-tuned models requiring another
endpoint are not claimed universally compatible. If catalog lookup fails, an
existing configured choice may be offered as an explicitly unverified saved
setting, never as a successful discovery result. No default GPT/Grok IDs are
invented for a new installation.

## Shared projects, Library and detached research

The slim document rail below the header owns the Image Studio and Research desk
as one project. New creates a clean tab; Save stores its image inputs, selected
asset, prompt/model, thumbnail settings, research conversations and unsent drafts.
Double-click a tab title to rename it. Closing a tab confirms the action and can
save or discard unsaved work. Closing the last tab returns to the full Library;
Create and Compose stay disabled until a project is opened or created.

Uploaded model inputs are local Library assets and survive saved-project reload.
Deleting a local asset is blocked while a saved project references it. Remote
HTTPS inputs remain remote references: their availability is controlled by the
source. Thumbnails do not silently upload images to an inference provider.

New conversation archives the current conversation within its project. Delete
conversation removes the current one after confirmation. History opens/deletes
archives; the saved project includes a snapshot. Existing 0.1/0.2 projects remain
readable, and the prior browser conversation keys remain accessible as legacy
history rather than being erased by this update.

The rail can be pinned or auto-hidden. In auto-hide mode it overlays the workspace
on pointer hover or keyboard focus without shifting the underlying panels. The
header layout menu also controls the rail, Research visibility and detached views.
Research's model selectors collapse to leave more room for messages. Both panel
resize handles support keyboard operation; the left panel has tighter bounds.

Research opens at `/research` with the originating project ID in the URL. Matching
host, port and browser profile let browser storage/BroadcastChannel share drafts
and conversations. Use as prompt returns to that same project. Finishing or
stopping a response is required before docking. Native navigation may be limited
by browser popup policy. No project switch causes an output from an already
submitted generation to be assigned to another project.

## Model-specific workspace and presets

The Replicate schema determines whether the central prompt exists and is required.
A two-image transformation model is run with its actual image inputs; a made-up
`prompt` is not injected. Upload and safe HTTPS fields show previews. Required
inputs are checked in the browser and again before provider submission. Complex
input unions remain available through Advanced JSON where supported.

Replicate cover thumbnails, run counts and other metadata are shown only when
returned. Owner avatars are not invented; absent art uses a neutral placeholder.
The slim selected-model chip opens the model information panel. GPT/Grok model
selectors remain provider-backed and separate for image generation and chat.

Edit creative-direction instructions using the preset settings button/lightbox.
Settings is a full shell page with layout, preset and connection actions. Its
future usage/balance panels do not report tokens or balances in this POC.

## Local boundary

The server binds only to `127.0.0.1`. Host/origin checks and a per-process request token reduce accidental cross-site API calls. These are basic loopback protections, **not production account authorization**. Anyone with access to this local browser/session/machine can use the POC.

The future service must reuse Third Railify's account system and approved-account policy, enforce authorization on every private API/asset, and apply Turnstile through the established verified server flow. See [future integration](docs/FUTURE-INTEGRATION.md).

## Validation

Double-click **RUN-TESTS.cmd**, or run `node --test` in this directory. See [TESTING](docs/TESTING.md) for exactly what was exercised and what was not.

Provider HTTP was simulated in automated tests; no user API token or paid live generation was available during this build. The first local generation is the live account/model/billing acceptance step.
