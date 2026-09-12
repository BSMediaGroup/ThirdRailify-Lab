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
