# POC 0.3 release validation

## Current automated suite

Node 22.16.0; `node --test`: **39 tests passed, zero failures**. This retains the
26 prior server/model/catalog/config tests and adds 13 workspace/schema tests.
Syntax checks cover server.mjs, all lib modules, public/app.js, public/model-schema.js
and the package verification script. The runtime has no install/build dependency.

The workspace tests cover prompt-free two-image generation with the real local
HTTP API, schema-required prompts, optional defaults, rejected unknown/missing
inputs before submission, retained job/session identity, uploaded reference-asset
materialization, saved-project reference protection, restart persistence, safe
metadata/preview values, required image arrays, preset persistence, legacy
projects, static routes and Research rendering resources.

All provider traffic is simulated/injected. No API keys, real inference charges,
provider account mutations, live login or hosted webhook were used.

## Package checks for this release

The completed ZIP is extracted into a fresh directory, its full manifest is
verified, the 39-test suite is rerun there, and the actual extracted server is
started with external provider requests disabled. The smoke check loads the
main shell, Research route, all three stylesheets, both browser scripts, and the
SVG icon resource with their expected content types. It verifies that the new
workspace controls are present and that private configuration paths are not
served. All required unchanged 0.2 runtime files are included, not assumed to
exist on the user's machine.

A second installation check overlays the same ZIP onto an extracted 0.2 package
with synthetic existing .env, .data/state.json, a saved project/image, user asset
and repository-marker files. Protected file hashes are compared before/after the
overlay and after read-only server smoke checks. The old saved project and image
are read back through the current API. The prior individual-file 0.3 handoff is
not needed to install this release.

Archive checks reject .env, .data, .git, user assets, font binaries, dependency
folders, symlinks and unsafe paths. PACKAGE-MANIFEST.json records the length and
SHA-256 of every other included file. The manifest itself is not self-hashed.
The release contains CRLF Windows launchers and no npm-based launch requirement.

## UI evidence retained from the workspace implementation

The preceding workspace implementation reported browser checks at 1920, 1440,
768 and 390 pixels for shared tabs/research, generating while switching projects,
saving/reopening/discarding, final-tab Library fallback, layout menu, overlay
auto-hide, panel resizing, collapsible model controls and model-specific inputs.
It used actual HTML/CSS/JS with a local HTTP bridge because the managed Chromium
runtime blocks ordinary navigation. Prior visual captures used font fallbacks
and a missing-logo placeholder; the user's actual fonts/SVG were not supplied.

Those historical browser checks are not a claim of paid live model testing or
native Windows navigation. The final packaging pass is specifically a fresh-ZIP,
overwrite-preservation, static-resource and automated-regression verification.
Windows .cmd execution on a Windows machine, native popup/tab navigation and
user-account paid API acceptance remain unverified in this Linux environment.

The previous version's detailed historical test record is in TESTING-0.2.md.

## Reproduce without changing your data

RUN-TESTS.cmd runs the automated tests in temporary fixture directories; they do
not load the installation's real .env/.data. VERIFY-PACKAGE.cmd checks release
files only and does not change the application, private data or provider state.
Both scripts call Node directly. Running tests/checks is optional for using the POC.
