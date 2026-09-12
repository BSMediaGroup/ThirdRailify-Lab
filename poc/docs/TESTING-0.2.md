> Historical TESTING-0 record. Current release: [0.4 update](UPDATE-0.4.md) and [testing](TESTING.md).

# POC 0.2 validation record

## Automated server/adapters

Node 22.16.0. `node --test tests/*.test.mjs`: **26 passed, zero failures**.
Syntax checks: server.mjs, all lib/*.mjs and public/app.js passed.
No runtime dependency installation required.

Coverage retains the original 13 tests and adds provider-driven model discovery,
image/chat filtering, Grok typed catalogues/general fallback, refresh/cache/stale
handling, key rejection, coalescing, actual selected image/chat model forwarding,
saved project/asset/history deletion, active-job guards, event request-ID tombstones,
CSRF/origin rejection, preserved .env contents, nested-poc named asset discovery,
OTF MIME, shared /research route and allowlisted-only brand asset access.

Provider network is injected/simulated into the actual local server and adapters.
No user tokens were supplied, no paid inference or provider account changes ran.
New GPT/Grok installations have blank model preferences; tests submit explicit
synthetic model IDs rather than relying on invented defaults. User .env preferences
are preserved during overwrite installation and model selection.

## Connected browser exercise

Ten workflow groups passed, with no observed page exceptions:

1. GPT image/chat catalogue task filtering, refresh and model-selection retention.
2. Grok separate image/language choices.
3. Exact selected chat model submitted through the real server and returned text rendered.
4. New-chat archive, archive reopen, current deletion and history deletion.
5. Save/discard/reopen image/thumbnail session with settings and asset preservation.
6. Saved-session deletion, in-use-image protection and subsequent image deletion.
7. Account menu, keyboard navigation, Escape and truthful login scaffold.
8. Left icon rail, hidden inspector and research expanded past 900px at 1440px.
9. Research popup URL/provider/tab selection, shared draft/history and standalone rendering.
10. Containment at 1920/1440/768/390; mobile avatar-only widget and research overlay.

The runtime's Chromium has an administrator URL-block policy preventing ordinary
navigation including localhost. Policies were not changed. The test loaded actual
HTML/CSS/app JS into about:blank and bridged fetch to the actual localhost service.
Image bytes from that service were rendered via test-only data URLs. Native
confirmation/prompt answers and shared browser storage events were driven by the
harness. The popup was actually opened, but its target was substituted with
about:blank and the real research UI hydrated there. This validates the application
state and UI contract, not unrestricted user-browser navigation/popup policy.

Provider responses were simulated; fixture model IDs in screenshots are not an
availability claim. The original CSS external-font import was omitted only inside
the harness. No user's American Captain/labs0 file was present, so captures show
system font fallbacks and LAB placeholder. TTF/OTF and SVG routing is separately
verified with synthetic files. Exact final local brand appearance depends on the
user's existing files; none are distributed.

Desktop, library deletion, account menu, wide-sidebar, research popout, tablet and
mobile images were opened and visually inspected. Full Windows launch, native
popup/tab navigation, exact user-logo glyphs and paid generation remain user-machine
acceptance, not claims made from these bridged tests.

## Reproduce local checks

Double-click RUN-TESTS.cmd, or use `node --test` from this POC directory. All test
data is temporary and removed; real .env/.data are not used.

After copying the update, use the existing launcher, check Connections' brand
paths, choose a returned image/chat model and test your own account once. No webhook
configuration, production deployment or new key is required by this update.
