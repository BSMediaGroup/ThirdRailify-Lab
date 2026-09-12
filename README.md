# ThirdRailify-Lab

The private creative Workshop runs on the Git-integrated Cloudflare Pages project `thirdrailify-lab`, targeting https://lab.thirdrailify.com. The approved local POC remains in `poc/` and is not used as a production data source.

## Build and layout

Node 22.16.0 / Wrangler 4.60.0. Cloudflare builds from the repository root with `npm run build`, output `dist`. On Windows use `npm.cmd`. `build-assets.json` and the explicit five-source stylesheet list in `scripts/build.mjs` form the complete asset allowlist; `poc/`, environment files, local data, tests, diagnostics and backups are excluded. Every published route invokes Pages Functions. Preview and pages.dev hostnames fail closed; only the configured stable origin is enabled.

```text
assets/                  approved fonts, logos, and social-preview artwork
public/                  preserved vanilla Studio/Research UI and canonical login client
public/violet.css        final dark gold/muted-violet theme
public/control-room.css  provider, stock-media, Google action and usage-dashboard layer
functions/_middleware.js protected Pages application, APIs, media and callbacks
lib/                     account-owned repositories and provider adapters
lib/google-images.mjs    Google callback normalization and bounded private image import
lib/stock-media.mjs      Pexels/Pixabay/Unsplash search, attribution and selection contracts
lib/provider-profiles.mjs encrypted credential vault and effective-profile resolver
lib/usage.mjs            idempotent safe provider-usage ledger and dashboard queries
lib/provider-pricing.mjs versioned official pricing catalog and immutable cost calculation
migrations/0001_lab.sql  independent Lab base schema
migrations/0002_provider_vault_stock_usage.sql  profile, usage, cache and attribution schema
migrations/0003_provider_cost_intelligence.sql  logical operations, exact ticks and pricing provenance
migrations/0004_usage_classification_repair.sql  deterministic non-inference deploy-window repair
backend/                 scheduled recovery helper; no frontend, hostname or public endpoint
scripts/                 build, checked provisioning and migration preparation
tests/                   D1/R2, account, recovery and Pages-runtime browser checks
docs/                    architecture, parity and release evidence
poc/                     approved local baseline, preserved in place
dist/                    generated allowlisted build output (ignored)
```

The document toolbar keeps project and conversation actions together, with the Research Desk visibility toggle isolated at the far-right edge by a retained divider.

## Link previews

Discord, X/Twitter, and other Open Graph clients receive the dedicated 1733×907 dark gold/violet `labseo.webp` card plus a concise title and description. Both the authenticated shell and the public login handoff publish the same canonical metadata because anonymous link crawlers follow the root login redirect. `/backgrounds/labseo.webp` is the only deliberately public social asset; it contains no account, project, or provider data and is packaged by the build allowlist.

## Identity and private data

Admin owns accounts, canonical sessions, OAuth/PKCE, Turnstile, capability denials and Workshop grants. Lab uses the existing login/handoff protocol with an exact Lab origin and host-only cookies. Handoffs are short-lived, target-bound and single-use. Every protected request rereads current account status, session revocation and Workshop policy. Active Masters retain recovery access; active Full Admins follow `workshop.use`; regular accounts require explicit unexpired approval. Suspension overrides Full Admin defaults. Disabled accounts are denied. Access administration and provider configuration are independent capabilities and do not grant ownership of other accounts' projects.

Lab D1 stores projects, conversations, preferences, job state and asset metadata. Private R2 stores originals, uploads, exported thumbnails and staged paid responses. Ownership comes from the canonical session. Server revisions reject stale saves; browser recovery, channels and windows are account/project scoped. Project-file and job-file constraints prevent cross-account references. Deletion retains idempotency tombstones and prevents late callbacks restoring a deleted project.

## Bindings and recovery

Pages bindings: `LAB_DB`, `THIRDRAILIFY_AUTH_DB`, `LAB_FILES`. Runtime provider secrets are `REPLICATE_API_TOKEN`, `OPENAI_API_KEY`, `XAI_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `UNSPLASH_ACCESS_KEY`, and `REPLICATE_WEBHOOK_SIGNING_SECRET`. `GOOGLE_PSE_CX` is a client-visible engine identifier, not an API key or vault entry. Named provider profiles are AES-GCM encrypted before D1 persistence with a per-record nonce and versioned `LAB_VAULT_MASTER_KEY_V1`, held only as a Cloudflare secret. Browsers receive labels, status, fingerprints and effective access, never raw credential values. `LAB_ENABLED` is the operational gate; `LAB_PAID_ENABLED` pauses new paid submissions independently. Preview bindings contain no production databases or secrets.

## Google Images research

The Research Desk uses the free, ad-supported Google Programmable Search **Standard Search Element**. It does not use Custom Search JSON API and requires no Google API key. The authenticated client registers documented `image.starting`, `image.ready`, and `image.rendered` callbacks before loading `https://cse.google.com/cse.js?cx=…`. Google's default image template renderer evaluates template strings and is incompatible with the Lab's strict CSP; the `image.ready(gname, query, promos, results, resultsDiv)` callback therefore renders documented structured fields with safe DOM APIs and returns `true`, which tells the Element to skip its default results renderer and continue to Google footer work. The parent `script-src` remains strict and does not allow `unsafe-eval`; no isolated child frame is used.

Native gold/violet result cards are bound to the authenticated account, originating project, Search Element instance, query generation, and internal result ID. Existing protected import/action authority still owns Add to Chat, Reference, Compose, and Source; the renderer does not parse Google's HTML or create an arbitrary fetch path. Structured promotions are retained in a labeled region, and the Element's own post-callback footer/branding and any Google-owned advertising outside the replacement results div are not hidden. Standard Search Element branding is currently optional, but the integration preserves the footer presentation Google emits rather than inventing or suppressing a Google mark. Invalid results, thumbnail fallback, empty results, provider timeout/challenge guidance, and callback failures use native Lab states without exposing raw provider exceptions. CSP diagnostics report only directive, blocked host, document path, timestamp, and a correlation ID.

Google renderer regression coverage exercises callback ordering and `true` bypass behavior, documented-field normalization, injection resistance, project/generation isolation, late callbacks, all four actions, promotions, empty/malformed/failure/thumbnail/challenge states, strict main CSP, two distinct queries, responsive 1920/1440/768/390 layouts, and the Research popout. The browser fixture intentionally attempts the old eval-dependent default path if the callback does not return `true`, so a CSP regression fails the run.

Google result imports and Pexels/Pixabay selections use the restricted importer: HTTPS only, no credentials or unexpected ports, public DNS verification on every redirect, bounded redirects/time/bytes, MIME/signature checks and a 40-megapixel decoded-header limit. Originals are saved only to the authenticated account/project. Google searches/results-used are local Workshop activity, not Google billing or quota evidence.

## Stock media, profiles and usage

Stock Media keeps distinct Pexels, Pixabay and Unsplash contracts behind protected Functions. Pexels preserves photographer/Pexels attribution and response rate headers. Pixabay search results are cached for 24 hours; deliberate selections are downloaded into private R2 rather than permanently hotlinked. Unsplash displays returned hotlinked URLs, preserves photographer/Unsplash attribution and UTM links, and calls `download_location` before a selection. Unsplash stays provider-backed rather than being silently copied; it works in Research Chat and compatible URL-based generation inputs, while the current canvas/Compose path clearly refuses it because export would not be reliable.

The Connections and Settings provider summaries package the approved `pexels-0.svg`, `pixabay-0.svg`, and `unsplash-0.svg` marks through the allowlisted `/brand-assets/` build alongside the existing AI and Google provider marks.

Runtime Defaults remain immutable. Authorized provider administrators can create, verify, enable/disable, default and logically remove named encrypted profiles. Account/provider/model preferences are server-resolved immediately before each provider call. Master-owned Admin policies can restrict an account to selected profiles; queued submissions recheck the policy, while already-submitted jobs use their retained credential provenance for cancellation/reconciliation without exposing it.

The usage ledger stores one logical provider operation per stable job/conversation key. Lifecycle callbacks update that row instead of creating billable requests. It retains requested/served models, safe provider IDs, token modalities, outputs/searches/tools, xAI integer cost ticks, versioned estimate nanos, immutable rate snapshots and coverage reasons; prompts and secrets are excluded. Cost authority is `actual_provider`, `estimated_catalog`, `estimated_formula`, proven free/non-billable, `unknown`, or `not_applicable`. Unknown is never rendered as zero. Usage history has sortable columns and persisted pointer/keyboard column resizing on desktop, semantic status/cost chips, explicit `US$` labels and accessible quota bars; utilization below 70% is violet, 70% to below 90% is amber, and 90% or higher is red.

Research tab/search/filter state is account/project scoped. Chat adds an attachment to the unsent draft, generation attaches only to schema-compatible image inputs (or preserves the image in a visible unassigned reference tray), and Compose asks before replacing a different base image. Publication rights remain the operator's responsibility. A missing CX or stock credential reports a precise unavailable state.

The backend-only `thirdrailify-lab-recovery` helper has its own `backend/wrangler.jsonc` and minute cron. It claims persisted jobs, checks current permission before a paid submission, polls known predictions when needed, imports completed originals, retries downloads and provider-file cleanup, and marks interrupted submissions uncertain. It has the same storage bindings and only the three provider API secrets. It does not serve Pages APIs or own a hostname. A browser, `waitUntil` or process-local loop is not the durable job executor.

Replicate callbacks terminate at the Pages Function `/api/webhooks/replicate`. Raw-body signatures, timestamps, recorded jobs, private callback nonces and receipt hashes are verified. Duplicate/out-of-order callbacks are monotonic. Signing material comes from Replicate's authenticated `/v1/webhooks/default/secret` endpoint. Unknown paid acceptance is never retried automatically; output retries never purchase another generation. Exact-once external billing is not promised.

Research streams preserve partial answers in D1 and track uploaded provider files for cleanup. Browser closure can stop a streaming answer; partial answers remain recoverable. Global/account concurrency, request-size, rate, output and tool limits apply. Provider-reported usage is shown; balances and unreported cost remain unknown.

## Operations and evidence

See [POC parity](docs/POC_PARITY.md) and [release evidence / rollback](docs/RELEASE.md). This milestone adds reviewed Admin migration `0004_workshop_provider_profile_restrictions.sql` and Lab migration `0002_provider_vault_stock_usage.sql`; never apply Commerce migrations for Workshop. Back up both existing D1 databases before mutation. Deploy compatible Admin first, then Lab Pages and its recovery helper from a checked build.

Local tests: `npm.cmd test` (set `LAB_TEST_ADMIN_ROOT` to the checked Admin release directory when using an isolated worktree), `npm.cmd run test:poc`; Pages compilation uses `npx.cmd wrangler pages functions build functions --outdir .artifacts/functions-build --compatibility-flags=nodejs_compat`. `tests/browser-server.mjs` runs the compiled Pages handler with real local D1/R2 and explicitly synthetic local accounts, without paid providers. `tests/google-images-browser.mjs` is the focused strict-CSP callback, lifecycle, action, responsive, and popout acceptance suite; `tests/browser-check.mjs` exercises the complete gold/violet shell. Both browser suites cover 1920, 1440, 768, and 390 pixels. Set `LAB_BROWSER_HEADED=1` for headed evidence. These local fixtures are not live acceptance.
Image lab for Third Railify

Login polish (2026-09-12): the sign-in and OAuth verification views share the exact Lab header motif gradient, housing and hover treatment. Packaged the canonical Admin OAuth icons and `thirdadminfav2.ico` favicon through the asset allowlist. Added accessible password visibility, provider back navigation and verification retry/expiry states. Inspected desktop/mobile and OAuth/error screenshots; these UI fixtures do not prove live login.

Runtime/provider repair (2026-09-12): avoid binding the global fetch function to a Providers instance, which Cloudflare rejects as an illegal invocation. The runtime test covers real adapters with local provider responses. Browser errors now reject non-JSON responses explicitly. The approved four CSS sources are combined in fixed order into `lab.css` by the root build; packaged fonts and the header motif load before account bootstrap. The account menu has a prominent Log out control and checks canonical logout success before clearing recovery state.

2026-09-12 processor dispatch and account-menu repair: added one dedicated `thirdrailify-lab-jobs` queue (`LAB_JOBS`) with 24-hour retention. Pages persists the job before awaiting dispatch; the existing backend-only helper consumes one job per batch, with two consumers maximum and bounded recovery delivery. D1 leases and status transitions prevent duplicate submissions. Verified callbacks and download retries also wake the helper. Missing queue configuration fails closed, and rejected dispatch reports a failed job instead of hanging. The minute schedule remains a secondary reconciliation/cleanup path, not the sole kickoff. No new database migration or provider secrets were required. Added queue redelivery, dispatch failure, and missing-binding checks against local D1/R2. Sign out now matches Admin red styling below Open Admin dashboard. A temporary Master-only `/api/render-check` records only fixed computed-color fields and theme-override booleans in runtime logs; no identity or private content. The affected Brave rendering remains under investigation.

2026-09-12 live rendering root cause: the operator browser reported the expected lab.css loaded but Dark Reader present, logo background-image none, border rgb(124,115,101), and button rgb(132,103,0), on both initial and delayed checks. OS forced colors was false. Added the supported static darkreader-lock meta tag before styles on Studio/Research and login/OAuth views, preserving the existing dark theme. Documentation: https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md#disabling-dark-reader-on-your-site. The queue/sign-out Pages release is `9c47bccc-708f-471b-9a05-8707b5197b3b`, Git `b611c1c1b1977e0b98891e2f85ce7408b20db225`; its LAB_JOBS binding is verified. A no-purchase probe invoked the live queue consumer successfully.

2026-09-12 confirmed live theme repair: Pages `f6b685f8-47a6-42ec-9dd4-47db1b4c6d18`, Git `166930faa97ba565d891beba151fafda740de9b9`. Operator confirmed the colors look correct. Both initial and delayed live checks show Dark Reader absent, the full approved gold gradient restored, border rgb(56,59,41), and gold button rgb(255,209,47). Removed the temporary render-check endpoint and browser reporting after collecting that proof. Live queue probe and canceled-job redelivery succeeded; scheduled recovery is also now observed every minute without exceptions. The 66-file POC baseline, including private env/data, remains byte-for-byte unchanged. Stable anonymous protected API returns JSON401/no-store; stable and immutable pages.dev origins return503/no-store. No controlled paid generation acceptance had been run at this checkpoint.

Final repair checkpoint 2026-09-12: stable Lab Pages deployment a182fa25-f9d6-4e29-b629-3c94d455111a, release e0fe15acd2302e8501dc641945f4970526c353e1. Operator confirmed the theme and generation now work. Independently verified a live xAI image job succeeded with one submission and a ready 628,622-byte JPEG record associated with its original owner/project. Temporary diagnostics were removed from production. The six controlled provider acceptance cases, real Replicate callback, GPT image and complete live multi-account acceptance remain unverified. Further operator prompts were stopped at the explicit user request. Names-only evidence: .artifacts/live/repair-evidence.json.
2026-09-12 prompt action alignment: grouped the reference attachment and Generate buttons into one non-wrapping action group. The helper text can wrap independently at narrow canvas widths. Removed the trailing Generate arrow from both initial markup and dynamic model rendering, retaining one leading icon. The account Admin shield now uses the gold theme color in the header and dropdown. POC files and generation behavior are unchanged.

2026-09-12 favicon update: the allowlisted build now publishes the supplied assets/icons/labsfav.ico as /favicon.ico for all Lab pages. Login and Workshop favicon links include a version query to refresh the previous cached icon.
