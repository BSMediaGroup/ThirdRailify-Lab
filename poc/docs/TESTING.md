# Release verification — 0.4.0-poc

## Actual checks

- Node 22.16.0; dependency-free `node --test`: **63 passed, 0 failed**.
- Includes the retained 39 prior scenarios plus 24 final-pass tests for research profiles, tool payloads, attachment bytes/persistence, second chat turn, cleanup on errors, generated-file download, OpenAI/Grok image editing, library rename, credential testing, safe Markdown, canvas geometry and static modules.
- The old test requiring absent research tools was deliberately updated to the new requested web/analysis contract. Provider errors are still tested and never silently retried with features removed.
- Browser interaction passed at 1920, 1440, 768 and 390 widths for Settings, Brand Assets and Connections, with no document overflow or application exceptions. Desktop flows exercised image width/center/zoom/pan/portrait fit/window lock, model-profile save/readback, two multimodal conversation turns with formatted sources/usage, and Library save/rename.
- Viewed representative desktop and mobile captures. These use fallback fonts/initial logo placeholders because the user's local brand files are unavailable. No fonts are bundled.

## Browser boundary

Native navigation is blocked by this environment's managed Chromium policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Browser tests used an about:blank document with a same-local-server transport bridge, inline SVG sprite references, and test-only browser-storage/UUID shims. The actual UI scripts/styles and real local server handlers were exercised; provider responses were simulated. This is not Windows/Brave native popout or persistent cross-window acceptance. Native fullscreen/window and browser-storage synchronization remain user-environment checks; no claim of paid live generation or real provider authentication is made.

## Packaging checks

The final ZIP is tested after extraction, not just from the source directory. Release manifest and startup/static/API smoke checks are run on that extracted copy. An overwrite fixture starts with the actual 0.3 complete package, an existing `.env`, saved project/research, local image, custom asset and repository marker. Overlaying the new archive must preserve protected bytes and return the prior saved work from the new server. The release report is recorded in the accompanying package-check output.

Windows launchers are included with their existing direct-Node execution and no npm/build dependency. The server and tests were executed on Linux Node 22.16.0; Windows .cmd execution itself was not run in this environment.

## Deliberate limits

The application is local single-user software. Login/Turnstile, multi-key management, billing history/balances, brand collection management and embedded Google Images are scaffolded. Voice/video attachments are not implemented. Model listing and a saved key do not guarantee tools or endpoint support. No paid provider requests or user credentials were used in validation.
