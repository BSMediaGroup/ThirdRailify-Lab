# ThirdRailify-Lab

The private creative Workshop runs on the Git-integrated Cloudflare Pages project `thirdrailify-lab`, targeting https://lab.thirdrailify.com. The approved local POC remains in `poc/` and is not used as a production data source.

## Build and layout

Node 22.16.0 / Wrangler 4.60.0. Cloudflare builds from the repository root with `npm run build`, output `dist`. On Windows use `npm.cmd`. `build-assets.json` and the explicit five-source stylesheet list in `scripts/build.mjs` form the complete asset allowlist; `poc/`, environment files, local data, tests, diagnostics and backups are excluded. Every published route invokes Pages Functions. Preview and pages.dev hostnames fail closed; only the configured stable origin is enabled.

```text
assets/                  approved fonts, logos, and social-preview artwork
public/                  preserved vanilla Studio/Research UI and canonical login client
public/violet.css        final dark gold/muted-violet theme and responsive image-search layer
functions/_middleware.js protected Pages application, APIs, media and callbacks
lib/                     account-owned repositories and provider adapters
lib/google-images.mjs    supported Google image search, signed results and bounded private import
migrations/0001_lab.sql   independent Lab schema and migration ledger
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

Pages bindings: `LAB_DB`, `THIRDRAILIFY_AUTH_DB`, `LAB_FILES`. Existing production encrypted secrets are `REPLICATE_API_TOKEN`, `OPENAI_API_KEY`, `XAI_API_KEY`, and `REPLICATE_WEBHOOK_SIGNING_SECRET`. Google Images additionally requires the not-yet-configured encrypted secret `GOOGLE_CUSTOM_SEARCH_API_KEY` and non-secret Pages variable `GOOGLE_CUSTOM_SEARCH_CX` containing the Programmable Search Engine ID. Secret values never enter client output or Git. Configure the API key interactively with `npm.cmd exec wrangler -- pages secret put GOOGLE_CUSTOM_SEARCH_API_KEY --project-name thirdrailify-lab`; configure the engine ID in the Pages dashboard under Settings > Variables and Secrets. `LAB_ENABLED` is the operational gate; `LAB_PAID_ENABLED` pauses new paid submissions independently. Preview bindings contain no production databases or secrets.

## Google Images research

The Research Desk uses Google Custom Search JSON API with `searchType=image`; no scraping or unofficial endpoint is used. Query, SafeSearch, type, size, color, dominant-color, site, and bounded pagination controls are sent from the browser to an account/project-protected Function. The Function adds credentials, returns only a sanitized result projection, and signs short-lived result capabilities bound to the authenticated account and project. Thumbnails and imports pass through those capabilities. Imports accept only public HTTPS PNG/JPEG/WebP responses, revalidate redirects, enforce time, byte, signature, and dimension limits, and save originals into the existing private R2 repository before any chat, generation, or Compose action.

Search and filters are remembered per project in scoped browser storage; results themselves are not persisted there. Chat adds an attachment to the unsent draft, generation attaches only to schema-compatible image inputs (or preserves the image in a visible unassigned reference tray), and Compose asks before replacing a different base image. Publication rights remain the operator's responsibility. If either Google setting is absent, the UI stays available and reports a precise unconfigured state.

The backend-only `thirdrailify-lab-recovery` helper has its own `backend/wrangler.jsonc` and minute cron. It claims persisted jobs, checks current permission before a paid submission, polls known predictions when needed, imports completed originals, retries downloads and provider-file cleanup, and marks interrupted submissions uncertain. It has the same storage bindings and only the three provider API secrets. It does not serve Pages APIs or own a hostname. A browser, `waitUntil` or process-local loop is not the durable job executor.

Replicate callbacks terminate at the Pages Function `/api/webhooks/replicate`. Raw-body signatures, timestamps, recorded jobs, private callback nonces and receipt hashes are verified. Duplicate/out-of-order callbacks are monotonic. Signing material comes from Replicate's authenticated `/v1/webhooks/default/secret` endpoint. Unknown paid acceptance is never retried automatically; output retries never purchase another generation. Exact-once external billing is not promised.

Research streams preserve partial answers in D1 and track uploaded provider files for cleanup. Browser closure can stop a streaming answer; partial answers remain recoverable. Global/account concurrency, request-size, rate, output and tool limits apply. Provider-reported usage is shown; balances and unreported cost remain unknown.

## Operations and evidence

See [POC parity](docs/POC_PARITY.md) and [release evidence / rollback](docs/RELEASE.md). Use reviewed migration ledgers only: Admin account migrations `0002_full_admin_capability_denials.sql` and `0003_workshop_access.sql`, and Lab `0001_lab.sql`. Never apply Commerce migrations for Workshop. Back up an existing affected database before mutation. Deploy compatible Admin first, then the checked Git Pages release and helper. Do not deploy stale `dist` after a failed build.

Local tests: `npm.cmd test` (set `LAB_TEST_ADMIN_ROOT` to the checked Admin release directory when using an isolated worktree), `npm.cmd run test:poc`; Pages compilation uses `npx.cmd wrangler pages functions build functions --outdir .artifacts/functions-build --compatibility-flags=nodejs_compat`. `tests/browser-server.mjs` runs the compiled Pages handler with real local D1/R2 and explicitly synthetic local accounts, without paid providers. `tests/browser-check.mjs` exercises the complete gold/violet shell, Google Images workflow, destination actions, panel controls, popout, fullscreen, menus, and pages at 1920, 1440, 768, and 390 pixels. Set `LAB_BROWSER_HEADED=1` for headed evidence. These local fixtures are not live acceptance.
Image lab for Third Railify

Login polish (2026-09-12): the sign-in and OAuth verification views share the exact Lab header motif gradient, housing and hover treatment. Packaged the canonical Admin OAuth icons and `thirdadminfav2.ico` favicon through the asset allowlist. Added accessible password visibility, provider back navigation and verification retry/expiry states. Inspected desktop/mobile and OAuth/error screenshots; these UI fixtures do not prove live login.

Runtime/provider repair (2026-09-12): avoid binding the global fetch function to a Providers instance, which Cloudflare rejects as an illegal invocation. The runtime test covers real adapters with local provider responses. Browser errors now reject non-JSON responses explicitly. The approved four CSS sources are combined in fixed order into `lab.css` by the root build; packaged fonts and the header motif load before account bootstrap. The account menu has a prominent Log out control and checks canonical logout success before clearing recovery state.

2026-09-12 processor dispatch and account-menu repair: added one dedicated `thirdrailify-lab-jobs` queue (`LAB_JOBS`) with 24-hour retention. Pages persists the job before awaiting dispatch; the existing backend-only helper consumes one job per batch, with two consumers maximum and bounded recovery delivery. D1 leases and status transitions prevent duplicate submissions. Verified callbacks and download retries also wake the helper. Missing queue configuration fails closed, and rejected dispatch reports a failed job instead of hanging. The minute schedule remains a secondary reconciliation/cleanup path, not the sole kickoff. No new database migration or provider secrets were required. Added queue redelivery, dispatch failure, and missing-binding checks against local D1/R2. Sign out now matches Admin red styling below Open Admin dashboard. A temporary Master-only `/api/render-check` records only fixed computed-color fields and theme-override booleans in runtime logs; no identity or private content. The affected Brave rendering remains under investigation.

2026-09-12 live rendering root cause: the operator browser reported the expected lab.css loaded but Dark Reader present, logo background-image none, border rgb(124,115,101), and button rgb(132,103,0), on both initial and delayed checks. OS forced colors was false. Added the supported static darkreader-lock meta tag before styles on Studio/Research and login/OAuth views, preserving the existing dark theme. Documentation: https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md#disabling-dark-reader-on-your-site. The queue/sign-out Pages release is `9c47bccc-708f-471b-9a05-8707b5197b3b`, Git `b611c1c1b1977e0b98891e2f85ce7408b20db225`; its LAB_JOBS binding is verified. A no-purchase probe invoked the live queue consumer successfully.

2026-09-12 confirmed live theme repair: Pages `f6b685f8-47a6-42ec-9dd4-47db1b4c6d18`, Git `166930faa97ba565d891beba151fafda740de9b9`. Operator confirmed the colors look correct. Both initial and delayed live checks show Dark Reader absent, the full approved gold gradient restored, border rgb(56,59,41), and gold button rgb(255,209,47). Removed the temporary render-check endpoint and browser reporting after collecting that proof. Live queue probe and canceled-job redelivery succeeded; scheduled recovery is also now observed every minute without exceptions. The 66-file POC baseline, including private env/data, remains byte-for-byte unchanged. Stable anonymous protected API returns JSON401/no-store; stable and immutable pages.dev origins return503/no-store. No controlled paid generation acceptance had been run at this checkpoint.

Final repair checkpoint 2026-09-12: stable Lab Pages deployment a182fa25-f9d6-4e29-b629-3c94d455111a, release e0fe15acd2302e8501dc641945f4970526c353e1. Operator confirmed the theme and generation now work. Independently verified a live xAI image job succeeded with one submission and a ready 628,622-byte JPEG record associated with its original owner/project. Temporary diagnostics were removed from production. The six controlled provider acceptance cases, real Replicate callback, GPT image and complete live multi-account acceptance remain unverified. Further operator prompts were stopped at the explicit user request. Names-only evidence: .artifacts/live/repair-evidence.json.
2026-09-12 prompt action alignment: grouped the reference attachment and Generate buttons into one non-wrapping action group. The helper text can wrap independently at narrow canvas widths. Removed the trailing Generate arrow from both initial markup and dynamic model rendering, retaining one leading icon. The account Admin shield now uses the gold theme color in the header and dropdown. POC files and generation behavior are unchanged.

2026-09-12 favicon update: the allowlisted build now publishes the supplied assets/icons/labsfav.ico as /favicon.ico for all Lab pages. Login and Workshop favicon links include a version query to refresh the previous cached icon.
