# Notespace POC 0.1.0 — validation record

This package was built and tested locally. No Lab deployment, D1 operation, production login, provider key, paid API call or account action was involved.

## Executed checks

### Model and local HTTP server

Node.js **22.16.0**, `node --test tests/*.test.cjs`: **20 passed, 0 failed** (including five subtests).

Coverage includes seven-character IDs, world/local coordinates, nested parenting, cycle rejection, grouping, ungrouping, cascade deletion, property patches, validation, search, and read-only loopback HTTP behavior. HTTP checks exercise the actual local server, including `/notespace/<code>`, content security policy, host validation, method restrictions and blocked hidden files.

### Interactive browser checks

The actual app's JavaScript and DOM were exercised in Chromium with Playwright. The four-width suite completed **59 assertions** at:

- 1920 × 1080
- 1440 × 960
- 768 × 1024
- 390 × 844

All four shell layouts had no horizontal overflow; no application exceptions were recorded. Covered: real pointer dragging, double-click editing, notes, checklists, custom fields, find, parent movement, undo, local image file input, GIF decode, media/background dialogs, cinema controls, library, creation, duplication and deletion.

An additional suite completed **15 assertions** covering nested grouping, free/attached connections, freehand drawing, resize, lock, editable export/import, original GIF bytes, private-key exclusion from export and custom background media.

### Packaged single HTML

The actual final `OPEN-NOTESPACE.html` was loaded, not just the source files. It rendered the editable starter board, opened the double-click editor, switched cinema mode, exposed the full inspector, and rendered tasks/library without application exceptions.

This check caught and fixed a bundling defect in string substitution before delivery. It also confirmed that no external script or stylesheet is necessary for the single-file editor.

## Important environment qualification

This test environment's managed browser blocks URL navigation and native fullscreen/download behavior. Its policy was **not modified or bypassed**. Render/interaction suites use `page.set_content` and a clearly test-only in-memory IndexedDB API fixture. The shipped application does **not** include that fixture and uses the browser's real IndexedDB.

Consequently, the following have **not** been accepted as native end-to-end behavior here:

- Browser-profile persistence through a real browser/OS restart.
- Actual popout navigation, cross-window BroadcastChannel delivery, or native fullscreen.
- The Windows double-click launcher on a Windows machine (its Node server was tested directly).
- Live GIPHY/Tenor results, entitlement, branding review, or API quotas.
- Any cross-device or production collaboration/access/sharing.

The export test captures the app's generated download Blob and feeds its real contents back to the import input; it does not assert a native browser download dialog. GIF decode and original animated byte preservation were checked; no GIF playback frame-rate benchmark is claimed.

## Evidence included

`evidence/` includes test-result JSON/text and screenshots of the packaged board, cinema, library, honey-do list, mobile board, media picker, and object inspector. Screenshots were opened and visually inspected. They use the available system-font fallback; the local launcher can read your existing Lab brand fonts in place.

Source-level browser harnesses are included under `tests/browser/` for later reproduction. They require Python Playwright separately; no browser-test dependency is required to open this app. Set `NOTESPACE_BROWSER` to a Chromium executable when reproducing the fixture tests. They are explicitly fixture-backed, not production acceptance tests.

## Reproducible basic check

From the extracted package folder, run `node --test tests/*.test.cjs`. To rebuild the embedded HTML after source edits, run `node scripts/build-standalone.cjs`. Neither is needed for ordinary use.
