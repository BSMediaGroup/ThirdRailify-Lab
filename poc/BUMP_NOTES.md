# BUMP_NOTES

CURRENT VER= 0.3.0-poc / PENDING VER= 0.3.0-poc

## 2026-09-10 — First local Lab POC

### Human-readable

- Added the dark/gold Third Railify image workshop, thumbnail composer, output library and collapsible/resizable research desk.
- Replicate model lookup, live input-schema controls, reference-image fields, prediction status and locally retained originals are wired to the provider API.
- Added direct GPT/OpenAI and Grok/SpaceXAI image adapters plus optional streamed text chat with independent provider conversations.
- Added saved thumbnail projects, readable title/badge treatments, fit versus explicit crop and PNG/JPEG export.
- Added in-app Connections that persist credentials directly to the Lab's own `.env`, with presence-only status and non-generation API authentication tests.
- Added a Google Images tab with real external search and an explicit deferred integrated-feed state.
- Added a zero-install Windows launcher: no npm invocation, dependency install or production build is necessary.

### Technical

- Loopback-only native Node 22+ HTTP service, fixed route map, Host/Origin/request-token checks, typed inputs and server-side keys.
- Atomic local JSON state; local binary assets; bounded generation queue; concurrent request-ID coalescing; provider-specific cancellation/uncertainty handling; Replicate status retry separated from paid creation.
- API outputs copied to disk; independent recoverable output-download state; known Replicate prediction IDs retained through restart.
- Raw-body webhook-signature helper tested; optional real signing-key retrieval present, but no public callback is enabled.
- Brand fonts are discovered read-only in the sibling Public repository; font files are not bundled.
- README and docs cover setup, tokens, current provider model defaults, webhook preparation, private hosted architecture and precise validation limits.

### Acceptance boundary

All 13 automated tests passed, exercising actual local server paths with simulated provider HTTP. Browser bridge acceptance covers layout, local composition/persistence and controls. No user keys were supplied and no paid live generation was performed. Current model/account access must be verified by the user's first generation.

This POC is local-only. Shared Admin-account approvals, Turnstile, durable hosted services and authenticated private asset delivery are deferred to the approved Codex implementation. The unauthenticated local POC must not be publicly deployed or tunneled.


## 2026-09-11 — POC 0.2 model, session and workspace upgrade

### Operator changes

- Added provider-returned GPT/Grok model dropdowns for images and research chat, refresh controls and saved preferences. Removed invented direct-provider default model IDs for new installs; existing .env preferences are retained.
- Added Save session and New/discard workspace, delete saved sessions, delete completed generation history and delete unreferenced local assets. Legacy thumbnail projects still open; destructive actions require confirmation.
- Added current-chat deletion, archived-chat history and deletion; New chat retains the previous conversation in history.
- Added dedicated research tab/window, provider/history/draft continuity, cross-view Use as prompt and Dock. Added icon-only left sidebar and viewport-based broad research resizing.
- Added Admin-style account/login scaffold, explicitly not authenticated. Mobile trigger is avatar-only, with no extra chevron or role badge.
- Matched inspected Public brand mark box, gold mask and hover CSS; motif resolves to the user's local labs0.svg. Fixed named American Captain TTF/OTF lookup when installed under repo/poc. No font files are bundled.

### Technical and custody

- Added lib/models.mjs and lib/brand.mjs; extended server with safe catalogue, delete and research/allowlisted-brand routes. Server catalogue cache and inflight coalescing avoid repeated lookups. API keys remain server-side.
- Image generation and chat use the actual selected model value. OpenAI ID-based capability filtering is explained; model-specific provider errors stay visible. Cached failures are not called verified live results.
- Generation-history tombstones retain request-ID idempotency without keeping the deleted prompt. Session references protect image deletion; deletion-in-progress blocks conflicting session saves.
- Shared browser chat history/drafts use existing localStorage keys, BroadcastChannel and per-provider Web Locks where supported. No Windows environment variables, provider secrets or production projects are changed.
- Added public/upgrade.css and tests/upgrade.test.mjs. README tree and setup/update/testing guides are updated. No source files removed. Update ZIP excludes .env, .data, assets, fonts and test outputs.

### Acceptance

26 Node tests pass with simulated provider HTTP, no paid calls. Ten connected browser workflow groups pass using actual app code and the local HTTP server through the managed-browser bridge. Inspected desktop, mobile, account menu, library, wide sidebar and research-only captures. Tests cover exact model propagation, safe deletion, provider cache/error handling, nested-poc TTF/OTF/asset resolution and access boundaries. User-local font/SVG appearance and actual paid account generation cannot be visually/live verified in this runtime.


## 2026-09-11 — POC 0.3 shared workspace and complete cumulative release

### Operator changes

- Shared project tabs below the header connect Studio and Research; titles, close confirmations, saved state and compact conversation actions are included. Auto-hide overlays the workspace instead of shifting it.
- Full Library and Settings shell pages; the final closed tab returns to Library. Session-dependent Create/Compose controls are disabled without a project.
- Header layout menu, collapsible Research model selection, bounded left-inspector resizing and broad right-sidebar resizing.
- Reference-image previews for uploads and HTTPS URLs; actual schema-driven central Run model workflow without a forced text prompt on input-only models.
- Editable prompt presets; returned model cover art and a compact selected-model information chip. Small helper text is more legible and application-owned labels use US English.

### Persistence and compatibility

- Model references are stored as local assets, materialized server-side only for submission, retained in saved projects and protected from deletion while referenced.
- Saved projects include generation, composition, per-provider research and drafts. Legacy project records remain readable. Job/session identity prevents a late result from replacing a different active project's canvas.
- Existing .env, .data, browser storage and locally supplied brand assets are not replaced by the release ZIP. The local American Captain TTF/OTF and labs0.svg resolver remains read-only.

### Package completion

- This release is one complete cumulative ZIP, not an eight-file patch: includes unchanged style.css, upgrade.css, brand/models modules and the Windows launcher alongside all updated files.
- Updated package version, README tree, setup/update/testing records, and added a SHA-256 package manifest plus optional read-only verifier. No runtime dependency installation or build step.
- Current validation and exact overwrite/fresh-install checks are recorded in docs/TESTING.md. Provider responses in automated tests are simulated; no paid live generation or production login is claimed.
