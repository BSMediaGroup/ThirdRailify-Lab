# BUMP_NOTES

CURRENT VER= 0.1.0-poc / PENDING VER= 0.1.0-poc

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
