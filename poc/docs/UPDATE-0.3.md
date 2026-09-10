# Install the complete 0.3.0 POC update

This ZIP contains the entire application. Do not install individual files or layer
a second download over it. It updates either the original POC, version 0.2, or the
previously supplied partial 0.3 runtime files.

## Existing installation

1. Stop the Lab console with **Ctrl+C**.
2. Extract this ZIP's **contents** directly into **X:\GIT\ThirdRailify-Lab\poc**. Choose **Replace the files in the destination**. Do not delete the existing folder first and do not extract into an extra nested folder.
3. Double-click **START-LAB.cmd** in that same folder. Refresh the browser with **Ctrl+F5**.

Your `.env`, `.data`, local assets and repository metadata are not in the ZIP and
are not overwritten. Existing keys continue to work. Keep the webhook secret
blank; no new variable or webhook is required. No npm install/build is needed.

`START-LAB.cmd`, `server.mjs`, `package.json`, `lib`, `public` and `docs` are
immediately at the ZIP root. This is not a wrapper directory containing `poc`.

The footer identifies **0.3 POC** and Connections returns **0.3.0-poc**.

## Existing work

Saved sessions, images and exports remain in `.data`. Browser-local open tabs and
chat history are not part of the ZIP. Use the same local address, port and browser
profile; do not clear site data just to install this update. Older saved projects
remain readable. Only deliberate delete/discard actions remove user work.

Before any software update, a separate private backup of `.env` and `.data` is
sensible; it is not necessary to copy those files into the update archive.

## Included changes

- Shared Studio/Research project tabs, close confirmations, compact actions and
  auto-hide overlay.
- Full Library and Settings pages and a clean no-project state.
- Collapsible Research model controls, hover/click layout menu, two resizable
  side panels and dedicated Research tab/window.
- Thumbnail previews for reference inputs and schema-specific Run model behavior.
- Editable creative directions and provider-returned model covers/info.
- Updated US-English UI helper text, with slightly increased small-text sizing.

## Branding

The original read-only lookup remains: `poc/assets`, Lab root `assets`, then
sibling ThirdRailify/Public and Admin `assets`. Title: `fonts/headings/American
Captain.ttf` or `.otf`. Motif: `logos/labs0.svg`. Your local files are used and are
not included, changed or replaced by this archive.

## Optional checks

**RUN-TESTS.cmd** runs the included offline automated suite with temporary fixture
data. **VERIFY-PACKAGE.cmd** checks application file lengths and SHA-256 values
against PACKAGE-MANIFEST.json without reading or changing `.env` or `.data`.
Neither check submits a provider job. Neither check is required to launch.

A local change to an application/documentation file will intentionally make its
manifest check report a mismatch; it does not block the normal launcher.

The setup guide remains at **docs/SETUP.md**. Production authentication, hosting,
Google's embedded search feed and usage/balance accounting remain deferred as
previously documented. This is a local POC, not a deployment-ready service.
