# THIRD RAILIFY LAB
## Complete local POC · 0.4.0-poc

A private, local image workshop, thumbnail composer and research desk. This is the entire application, not a patch. It retains the shared projects and all previous 0.3 workflows, with the final UI/research upgrade included.

## Install or update on Windows

1. Stop the running Lab console with **Ctrl+C**.
2. Extract this ZIP's **contents directly into `X:\GIT\ThirdRailify-Lab\poc`**, replacing application files. **Do not delete the destination folder first.** There is no enclosing folder in the ZIP.
3. Double-click **START-LAB.cmd**. Node 22 or newer is required; no npm installation or build is required.
4. Open **http://127.0.0.1:4317**, or use the configured local port. Refresh the browser with **Ctrl+F5**.

Your existing `.env`, `.data`, local assets, fonts and `.git` are not in the archive and are not replaced. On an update, no new variables, keys or webhook secret are required. Leave the webhook secret blank for local use.

**Local only:** production login, approved-account gates and Turnstile are not implemented. Do not tunnel this server, expose it to the network, or deploy this package as a public website.

## What's in 0.4

- Redesigned Connections cards, local provider logo masks, honest saved/verified/missing/rejected states, and future saved-key-profile UI. Current `.env` keys remain active; multiple-key storage/switching is not implemented.
- Per-provider/per-model research system instructions, web search, supported code/data analysis, Grok X/image-search options, optional reasoning effort and output budget. Defaults request documented web/analysis tools and omit an arbitrary output-token cap. The provider decides access and limits; unsupported combinations produce errors, never silent model/tool substitution.
- Chat paperclip for PNG/JPEG/WebP, PDF, and supported UTF-8 text/code files. Images are real image inputs; documents are uploaded as provider files. Temporary document cleanup is attempted even when stopped, with warnings when cleanup fails. Local originals remain in `.data`.
- Safe Markdown formatting, returned source links, reported per-response token usage, and local downloads of supported OpenAI analysis artifacts.
- Studio paperclip maps images into the actual Replicate image input, or selects the OpenAI/Grok image-edit endpoint for direct-provider references.
- Centered image viewport with zoom, width/height/contain fit, pan, reset and window-height lock. Default width fit grows vertically for the full image. View controls do not alter the source or exported pixels.
- Icon-only navigation with dark tooltips, current page eyebrow, improved cog, layout-menu icons and restrained helper/footer readability improvements.
- Redesigned Settings, library Rename controls, and a Brand & Assets library scaffold with intentionally disabled future management actions.

## Existing workflows retained

Replicate search and schema-derived inputs, model thumbnails, prompt-free image-to-image models, live GPT/Grok model catalogs, editable creative presets, input previews, generation polling/output persistence, shared Studio/research tabs, saved projects, delete/discard controls, auto-hide document rail, independent pane resizing/collapse, research window/tab controls, image import, thumbnail text composition and PNG/JPEG export.

Close the final session to return to Library. Create/Compose are disabled without an open session. Save a project to persist its research and generation/composition settings on disk; working tabs/drafts also recover through the existing browser storage keys.

## Connections and research

Use **Connections → Save connections → Test**. Blank key fields keep saved values; values are never sent back to the browser. A saved key is not an authenticated connection until Test succeeds. Test results are local-process status, reset when keys change or the server restarts.

Research: choose provider and model, then **Context & tools**. Profiles are saved in `.data/state.json` under an independent provider/model key. A listing is not a capability guarantee. These are API integrations, not replicas of every feature in ChatGPT or Grok consumer apps. Voice/video, arbitrary MCP servers, external computer control and account actions are not implemented. No provider safety settings are bypassed.

Tools, image analysis and document uploads can incur provider charges. Enabling a tool makes it available; the model may decide not to call it. File cleanup does not promise erasure of provider-side request retention. Keep confidential data out of attachments unless approved for that provider.

Google Images remains a scaffold with a working external search action. Usage graphs, provider account balances, multi-key management and Brand collection editing remain scaffolded; there are no fabricated values.

## Local brand assets

Read-only search order: `poc/assets` → parent Lab `assets` → sibling ThirdRailify `assets` → sibling ThirdRailify-Admin `assets`.

Expected files:

- `assets/fonts/headings/American Captain.ttf` or `.otf`
- Existing Blinker and Geist Mono files discovered in those asset trees
- `assets/logos/labs0.svg`
- `assets/icons/replicate-0.svg`
- `assets/icons/opanai.svg` (the requested filename spelling is retained)
- `assets/icons/grok-0.svg`

The Connections dialog reports selected local paths. Restart after adding brand files. Missing logos have an explicit initial placeholder; no provider logo is fabricated. No fonts or user assets are bundled. The existing optional browser font fallback remains; local fonts take precedence when found.

## Storage

- `.env`: active provider keys and optional model/port choices; local plaintext, excluded from Git.
- `.data/state.json`: generations, asset metadata, saved projects, research profiles/presets and attachment metadata.
- `.data/assets/`: originals and thumbnail exports.
- `.data/attachments/`: local research documents/images and supported analysis downloads.
- Browser storage: existing working sessions, draft conversations, pane settings and project tabs. Use the same host/port/profile to retain these.

Update by merging files, not by deleting storage. Back up `.env` and `.data` privately before substantial local changes. Deleting a saved project doesn't delete its images. Renaming only changes its title. Uploaded documents have no automatic local purge in this POC. Provider keys and local storage are not encrypted at rest.

## Package structure

```
poc/
  START-LAB.cmd
  RUN-TESTS.cmd
  VERIFY-PACKAGE.cmd
  server.mjs
  package.json
  .env.example
  .gitignore
  PACKAGE-MANIFEST.json
  README.md
  BUMP_NOTES.md
  lib/
    brand.mjs
    core.mjs
    models.mjs
    providers.mjs
    research.mjs
  public/
    index.html
    app.js
    icons.svg
    model-schema.js
    canvas-view.js
    rich-text.js
    style.css
    upgrade.css
    workspace.css
    final-pass.css
  tests/
    lab.test.mjs
    upgrade.test.mjs
    workspace.test.mjs
    final-pass.test.mjs
  scripts/
    verify-package.mjs
  docs/
    SETUP.md
    UPDATE-0.2.md
    UPDATE-0.3.md
    UPDATE-0.4.md
    TESTING-0.2.md
    TESTING.md
    FUTURE-INTEGRATION.md
```

The real file inventory and SHA-256 values are in PACKAGE-MANIFEST.json. It intentionally excludes itself. Double-click VERIFY-PACKAGE.cmd for read-only release-file verification. Tests use isolated temporary files and simulated provider responses: RUN-TESTS.cmd needs only Node, makes no paid requests, and does not use your keys.

[Full setup](docs/SETUP.md) · [0.4 update](docs/UPDATE-0.4.md) · [Validation and limitations](docs/TESTING.md) · [Future hosted boundaries](docs/FUTURE-INTEGRATION.md)
