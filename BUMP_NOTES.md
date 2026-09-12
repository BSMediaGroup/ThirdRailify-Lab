# Bump notes

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
