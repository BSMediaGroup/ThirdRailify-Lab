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
