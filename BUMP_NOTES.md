# Bump notes

## 2026-09-13 — Stock-provider Connections branding

- Added the supplied Pexels, Pixabay and Unsplash SVG marks to the allowlisted Lab build and exposed them through the existing provider-brand registry.
- Connections and Settings now render the approved stock-provider marks instead of generic fallback glyphs; credential, profile and status behavior is unchanged.

## 2026-09-13 — Model Explorer cover and card upgrade

- Hydrated the four curated starter models through the same Replicate metadata route used by search and model details, so their current provider feature images render on initial modal load without hardcoded cover URLs.
- Rebuilt result and detail presentation around square, cover-filled media canvases, refined responsive cards, violet/gold fallback artwork and compact provider/status details.
- Added source-contract coverage plus rendered desktop/mobile checks for all four starter covers, square geometry, cover fitting, fallback colors, overflow and the selected-model detail card.

## 2026-09-13 — Search, stock, encrypted profiles and usage control room

CURRENT VER=0.4.0

PENDING VER=0.5.0

- Replaced the unfinished Google JSON API adapter with the authenticated, image-first Standard Programmable Search Element. No Google API key is used; callbacks supply documented result metadata while Google retains compliant rendering, branding and ads.
- Added operational Pexels, 24-hour-cached Pixabay and hotlinked/tracked Unsplash research with provider-specific filters, attribution and compatible Chat/generation/Compose actions.
- Added AES-GCM named credential profiles, immutable Runtime Defaults, server-side account/model preference resolution, Master-only account restrictions and existing-job provenance recovery.
- Added an idempotent provider usage ledger and filtered Settings dashboard with tokens, requests, outputs, searches, tools, quota evidence, storage and explicit actual/estimated/unknown cost coverage.
- Added Lab migration `0002_provider_vault_stock_usage.sql`, new provider/profile/usage modules, `public/control-room.css`, Google brand packaging and focused D1/R2/provider-contract tests.

## 2026-09-13 — Document toolbar alignment

- Moved the Research Desk visibility toggle to the far-right end of the document toolbar while retaining a clear divider from project and conversation actions.
- Added source-level order and divider regression coverage; no project, document, conversation or Research Desk behavior changed.

## 2026-09-12 — Cloudflare Pages Workshop

CURRENT VER=0.4.0-poc (preserved local baseline)

PENDING VER=0.4.0 (new production root)

- Added the allowlisted root build, Pages Functions, canonical account login and current Workshop access enforcement.
- Retained the approved vanilla Studio/Research interface, actual brand fonts/logos, model adapters, composer and project workflows.
- Added private Lab D1/R2 repositories, revision protection, persisted generation jobs, verified Replicate callbacks and an independent recovery-only cron helper.
- Added real local D1/R2 and compiled Pages-runtime checks. Live release identifiers and acceptance are recorded in `docs/RELEASE.md`.
- Preserved `poc/.env`, `.data`, projects, assets, launchers and concurrent repository work. No private POC projects were imported.

- Corrected Pages extensionless login routing, canonical OAuth handoff returns and the existing `twitter` provider identifier. Added login-route regression coverage and an explicit Admin checkout override for isolated-release tests.

Login polish (2026-09-12): the sign-in and OAuth verification views share the exact Lab header motif gradient, housing and hover treatment. Packaged the canonical Admin OAuth icons and `thirdadminfav2.ico` favicon through the asset allowlist. Added accessible password visibility, provider back navigation and verification retry/expiry states. Inspected desktop/mobile and OAuth/error screenshots; these UI fixtures do not prove live login.

Runtime/provider repair (2026-09-12): avoid binding the global fetch function to a Providers instance, which Cloudflare rejects as an illegal invocation. The runtime test covers real adapters with local provider responses. Browser errors now reject non-JSON responses explicitly. The approved four CSS sources are combined in fixed order into `lab.css` by the root build; packaged fonts and the header motif load before account bootstrap. The account menu has a prominent Log out control and checks canonical logout success before clearing recovery state.

2026-09-12 processor dispatch and account-menu repair: added one dedicated `thirdrailify-lab-jobs` queue (`LAB_JOBS`) with 24-hour retention. Pages persists the job before awaiting dispatch; the existing backend-only helper consumes one job per batch, with two consumers maximum and bounded recovery delivery. D1 leases and status transitions prevent duplicate submissions. Verified callbacks and download retries also wake the helper. Missing queue configuration fails closed, and rejected dispatch reports a failed job instead of hanging. The minute schedule remains a secondary reconciliation/cleanup path, not the sole kickoff. No new database migration or provider secrets were required. Added queue redelivery, dispatch failure, and missing-binding checks against local D1/R2. Sign out now matches Admin red styling below Open Admin dashboard. A temporary Master-only `/api/render-check` records only fixed computed-color fields and theme-override booleans in runtime logs; no identity or private content. The affected Brave rendering remains under investigation.

2026-09-12 live rendering root cause: the operator browser reported the expected lab.css loaded but Dark Reader present, logo background-image none, border rgb(124,115,101), and button rgb(132,103,0), on both initial and delayed checks. OS forced colors was false. Added the supported static darkreader-lock meta tag before styles on Studio/Research and login/OAuth views, preserving the existing dark theme. Documentation: https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md#disabling-dark-reader-on-your-site. The queue/sign-out Pages release is `9c47bccc-708f-471b-9a05-8707b5197b3b`, Git `b611c1c1b1977e0b98891e2f85ce7408b20db225`; its LAB_JOBS binding is verified. A no-purchase probe invoked the live queue consumer successfully.

2026-09-12 confirmed live theme repair: Pages `f6b685f8-47a6-42ec-9dd4-47db1b4c6d18`, Git `166930faa97ba565d891beba151fafda740de9b9`. Operator confirmed the colors look correct. Both initial and delayed live checks show Dark Reader absent, the full approved gold gradient restored, border rgb(56,59,41), and gold button rgb(255,209,47). Removed the temporary render-check endpoint and browser reporting after collecting that proof. Live queue probe and canceled-job redelivery succeeded; scheduled recovery is also now observed every minute without exceptions. The 66-file POC baseline, including private env/data, remains byte-for-byte unchanged. Stable anonymous protected API returns JSON401/no-store; stable and immutable pages.dev origins return503/no-store. No controlled paid generation acceptance had been run at this checkpoint.

Final repair checkpoint 2026-09-12: stable Lab Pages deployment a182fa25-f9d6-4e29-b629-3c94d455111a, release e0fe15acd2302e8501dc641945f4970526c353e1. Operator confirmed the theme and generation now work. Independently verified a live xAI image job succeeded with one submission and a ready 628,622-byte JPEG record associated with its original owner/project. Temporary diagnostics were removed from production. The six controlled provider acceptance cases, real Replicate callback, GPT image and complete live multi-account acceptance remain unverified. Further operator prompts were stopped at the explicit user request. Names-only evidence: .artifacts/live/repair-evidence.json.
2026-09-12 prompt action alignment: grouped the reference attachment and Generate buttons into one non-wrapping action group. The helper text can wrap independently at narrow canvas widths. Removed the trailing Generate arrow from both initial markup and dynamic model rendering, retaining one leading icon. The account Admin shield now uses the gold theme color in the header and dropdown. POC files and generation behavior are unchanged.

2026-09-12 favicon update: the allowlisted build now publishes the supplied assets/icons/labsfav.ico as /favicon.ico for all Lab pages. Login and Workshop favicon links include a version query to refresh the previous cached icon.

## 2026-09-13 — Gold/violet Workshop and Google Images research

CURRENT VER=0.4.0

PENDING VER=0.4.0

- Reworked the complete Lab visual system around dark charcoal, deep violet, restrained purple depth, metallic gold focus, and preserved semantic success/warning/error colors. The fifth compiled style layer covers Studio, Research, Compose, Library, Brand & Assets, Settings, dialogs, menus, inputs, empty states, and responsive layouts.
- Removed the canvas phantom right strip by replacing the width-constraining 16:9/max-height combination with a width-owned responsive stage and explicit fullscreen flex sizing.
- Moved the Research Desk show/hide control to the project-tab rail, retained popout/new-tab controls in the Research header, and replaced ambiguous View Options and Brand & Assets glyphs with purpose-built symbols.
- Added the protected Google Custom Search JSON API image workflow with supported filters and pagination, safe unconfigured/provider/quota states, sanitized results, short-lived account/project-bound result tokens, private no-store responses, and independent search/thumbnail/import rate limits.
- Added private R2 import with HTTPS-only signed sources, redirect revalidation, local/private/reserved literal-address denial, 10-second timeouts, 12 MB streaming limits, PNG/JPEG/WebP signature checks, and a 40-megapixel decoded-header limit where dimensions are available.
- Added explicit image destinations: unsent Research Chat drafts, schema-aware generation references without silent model switching, and Compose with confirmation before replacing another base image. Search state and cross-window signals remain account/project scoped.
- Kept Compose integration within its current single-base-image architecture. A future multi-layer/blend-mode editor remains deliberately deferred.
- Expanded real local D1/R2 integration coverage and four-width browser evidence. Google credentials are deliberately not stored in the repository; production search remains unconfigured until both Pages settings are provisioned.
- Production implementation release: Git `54dc2271fed0b9da25d988cfef46524c0b5a0510`, Pages `4bddf385-d336-4c6b-9e99-e8c366d39ec0`. The existing stable host retained its private 302 login gate and JSON 401/no-store API denial; the deployed login stylesheet matches the reviewed build byte-for-byte. Local validation completed with 21 current tests, 63 preserved POC regressions, successful Pages Functions compilation, and headed 1920/1440/768/390 screenshots with zero console errors, horizontal overflow, or canvas gap. Production Google key/CX settings were still absent by names-only inspection, so real Google search/import acceptance remains blocked rather than inferred from fixtures.
- Header follow-up: shortened the production Workshop subtitle to `CREATIVE WORKSHOP` across the authenticated shell, login/OAuth header, and login signature, and replaced the Brand & Assets geometric identity glyph with a dedicated outlined artist-palette icon.
- Link-preview upgrade: published the supplied 1733×907 `assets/backgrounds/labseo.webp` dark-theme card; complete Open Graph/Twitter large-image metadata and concise Workshop copy now appear on both the protected shell and crawler-facing login handoff. The image is publicly readable and cacheable without exposing private Lab state.
