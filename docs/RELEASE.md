# Workshop Pages release evidence

Status: Pages Git deployments succeeded. Stable Lab hostname is active on Pages; authenticated/paid acceptance remains pending.

## Resources and schema

- Cloudflare account: Brainstream Media Group, `b98c3fe4118854c1a58982da6dae38a4`.
- Git-integrated Pages project: `thirdrailify-lab`, ID `c735f7e9-53cd-4977-ac4a-78c5bd988236`, GitHub `BSMediaGroup/ThirdRailify-Lab`, production branch `main`, root build `npm run build`, output `dist`.
- Lab D1: `thirdrailify-lab`, `24a3ce74-c56b-4788-87a8-8d5b6da3f886`; dedicated migration `0001_lab.sql`.
- Private R2: `thirdrailify-lab-private`; public development URL disabled, no bucket custom domains.
- Existing accounts D1: `b8be3879-7aa1-4d70-af3f-617abce7a929`; reviewed `0002_full_admin_capability_denials.sql` and `0003_workshop_access.sql` applied using Wrangler's migration ledger tooling. Commerce was not migrated.
- Account backup: `X:\GIT\_BACKUPS\ThirdRailify\workshop-20260912\thirdrailify-accounts-before-workshop.sql`, 298,032 bytes, SHA-256 `bcffb3516e409c2cadfb137f361ec0e1f102cee8ebf36be0414ae2e2273b0476`. Sidecars record schema, ledger and aggregate row baselines (2 Masters, 3 Full Admins, 5 regular accounts, all active).
- Initial account ledger contained only `0001_auth_foundation.sql`. New Lab had no application data before its first migration.
- The four allowlisted production Pages secrets were provisioned and read back by name/type as `secret_text`; provider keys were read without evaluating `.env`, and the signing secret was retrieved from Replicate. No values were printed or committed.

## Validation

- Original POC: 63 offline tests and syntax check passed.
- Existing Admin authorization/authentication: 16 tests passed, including Turnstile, OAuth, handoffs, capability policies, sessions and rate limits.
- Lab: real local D1/R2 ownership, revision races, duplicate callbacks, import retries without resubmission, revocation-before-submission, uncertain submissions, Admin grant auditing, protected Master delegation and fresh/upgrade schemas passed.
- Compiled Pages Functions runtime verified separately from Node. Edge fetch uses manual redirect handling; unsafe destinations are never followed with credentials.
- Browser checks passed at 1920/1440/768/390, with no JavaScript errors or page-width overflow. Studio screenshots at those widths were inspected; save/reload and native Research popout passed. Local fixtures are labeled and excluded from release assets.
- Paid acceptance authorized: six single requests, no automatic paid retries. None performed yet.

## Rollback and operations

Use the prior compatible Pages deployment for a frontend/auth rollback. Disable `LAB_PAID_ENABLED` in both Pages and the recovery helper before investigating provider incidents; disable `LAB_ENABLED` to close the entire Lab. Keep additive schemas in place during code rollback. Do not restore a whole shared accounts backup over newer sessions/account changes without reviewing the intervening changes. Idempotency and callback tombstones must remain intact while external work can still complete.

Back up Lab D1 before later migrations and retain R2 originals during rollback. Unknown external acceptance requires reconciliation against a known provider prediction/callback; it is never a reason for automatic paid resubmission. Provider-file cleanup failures remain recorded for retry; unknown file-upload acceptance is operationally uncertain rather than claimed deleted.

Official contracts: [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Replicate webhook verification](https://replicate.com/docs/topics/webhooks/verify-webhook), [xAI tool usage and turn limits](https://docs.x.ai/developers/tools/tool-usage-details).

## Deployed releases

- Admin Git release `174939d20e546195078e4a1e181871874bd50452`, deployment `e03f7ba5-ecec-475a-a40e-86d6d0a01c1d`. This layers Workshop over the concurrent, already deployed Commerce snapshot `afd5874d-04b3-453e-9499-dc834938d73e`, recorded separately as `6c0fa25`; live JS/CSS SHA-256 matched that snapshot. Newer unfinished Commerce files were not included.
- Lab Git release `b10da37cea6237267b345a1fe5f0727fd804a1d6`, Pages deployment `29941276-b10b-4afb-b539-5ebee222dcb9`.
- Recovery helper version `28c526d8-6ddf-46e5-b586-3b63d408d350`, minute cron, no public URL or hostname. Three provider secrets provisioned, no webhook/auth secrets.
- Admin account migrations 0002/0003 applied at 2026-09-12 11:24:23 UTC; Lab 0001 at 11:24:35 UTC. Ledgers and foreign-key checks verified afterward.
- Both stable and immutable Lab pages.dev URLs return 503/no-store as intended. Preview has no production D1/R2/secrets, preview builds disabled, fail_open=false for both environments.
- Operator saved the proxied CNAME `lab` ? `thirdrailify-lab.pages.dev`. Pages domain `e043d300-5277-4175-acc9-034ab3eb68aa` verified active after validation retry. No apex/www/Admin/mail/nameserver records changed. Anonymous API/app assets and unsigned callbacks return JSON 401 with no-store/security headers. The live Pages extensionless login redirect exposed a gate mismatch, corrected with explicit `/login` bootstrap routing and the canonical `/account/login` OAuth handoff path.
- Operator Chrome automation received Turnstile 600010, documented by Cloudflare as bot detection. No token/session bypass attempted. Regular-browser operator login remains the valid acceptance path.

## Login repair and visual polish

The concurrent Admin deployment `264abbc2-6eea-4094-88bb-a2cd23ff185b` removed Workshop code and the Lab origin. The exact deployed Commerce JS/CSS matched the local release snapshot (SHA-256 `2d7fcc9c8e43da42db38c37fe5a25d16c08f536e8f7c2ca0a4f62d6471edfab9` / `fc8561956198723523e04adf3dc6238ee7cc32af77d2638daa7e40f6ed0ee98f`). Admin Git commit `6a371bee3bfd75975ab2092e949b33b6dcb15861`, deployment `69aa05b6-4793-4faf-bebd-0666861f5878`, retains that Commerce update and restores Workshop. No migration was applied. Live Lab auth config returned JSON 200/configured with Discord, Google, GitHub and twitter afterward.

The login UI now uses the exact approved header CSS motif and housing, canonical provider icons, and the Admin favicon on login and Studio/Research. `tests/login-browser.mjs` checks four widths (1920, 1440, 768, 390), all four icons, gradient/mask, OAuth back navigation, password visibility, expiry and retry. Six screenshots were inspected in `.artifacts/login-polish/`. Turnstile in these local UI screenshots is an explicitly labeled fixture; no authenticated or paid acceptance is claimed. The real widget remains server verified.

Lab login polish is live at Pages deployment `7f4b8181-5e2f-4dca-8aa7-8dcf99d7f8e0`, Git `d8b4732e642c883edf7b905642a02fbd5dcbb882`. Production login CSS/JS match the release after LF/CRLF normalization; all four icon routes return SVG 200; `/favicon.ico` matches the Admin file byte-for-byte. Protected state remains JSON 401 anonymously. The operator retried a fresh automated Chrome session and the real widget still returned 600010; this is not accepted as successful authentication.

Another direct Admin release, `aebf199b-891f-4112-bce2-e2e15642deb5`, superseded Workshop again. Its sole newly changed Commerce file was `src/commerce/displayMedia.ts`; preserved in Git `8f34b84` with Workshop. Repeated deployments from snapshots lacking Workshop can remove the exact-origin integration again; future Admin releases must include the current main integration.

Latest combined Admin deployment `e22345c5-8c80-4a5d-99f4-ff38d62770c5` (`8f34b84fe3c8d356a51dd710b786dfdc765b2516`) verified live: exact Lab origin configured and Lab auth bootstrap JSON 200/configured with all four providers. Real operator authentication remains outstanding.

## Authenticated operator findings

The operator signed in normally as Master Admin 1 in Brave and supplied the live Studio screenshot. Model discovery failed; sanitized Pages tail recorded API 502 with successful invocations, not CPU exhaustion. The provider adapter reproduced `Illegal invocation` in real Miniflare because it assigned `globalThis.fetch` as an instance method. Calling the supplied function from a wrapper fixes the receiver. Independent GET-only reads with the approved POC keys returned Replicate FLUX schema, 142 OpenAI catalog entries, and 7 xAI language entries. No paid request was submitted by these checks. Runtime adapter regression and the Lab-to-canonical logout/revocation integration now pass; total suite 12 tests. Four-width compiled Pages browser checks passed and screenshots were inspected again.

The intermittent operator color issue has not been reproduced under the local browser harness. Bundled CSS and declarative fonts/motif remove partial stylesheet delivery and delayed brand setup; this is a robustness fix, not a claim that external browser recoloring was proven. The screenshot account row labeled Sign out was present but too subdued; replaced with a highlighted Log out control and exit icon.

## Queue dispatch and corrected sign out

The three operator image jobs inspected on 2026-09-12 were canceled with zero submission attempts and no provider IDs. The helper had the correct D1/R2 bindings, enabled flags, deployment and minute schedule, but no invocations were observed in the attached tail or one-hour telemetry query. A single dedicated queue now provides active dispatch and persisted redelivery through the same backend-only helper. Queue retention is 86,400 seconds; Wrangler default four-day retention was rejected, and the explicit one-day setting succeeded without a plan change. Helper version `15d55482-aba3-43d5-8e99-fe1eef2821f9` includes the queue consumer. No migrations were needed. Local suite: 13 tests passing, including dispatch failure, missing binding, duplicate delivery and single provider submission. Four-width Pages browser checks pass. Sign out matches the actual Admin red control and is the last menu action. The color mismatch remains unproven; a temporary Master-only fixed-field render diagnostic is included. No controlled paid live acceptance request has been run.
Provider/style/logout release: Git `e96f7bbdc2467d2fa264326ecf8b1b736c1c36ad`, Pages deployment `8b87ad20-bc12-4a59-b7a6-2514e44f313c`, recovery helper `f3023de1-c052-4296-ab30-ddb4ea9b866d`. Pages succeeded and canonical bootstrap remained JSON 200/configured. Lab jobs table was empty before helper deployment. Live catalog success after this correction is awaiting the operator refresh.

2026-09-12 live rendering root cause: the operator browser reported the expected lab.css loaded but Dark Reader present, logo background-image none, border rgb(124,115,101), and button rgb(132,103,0), on both initial and delayed checks. OS forced colors was false. Added the supported static darkreader-lock meta tag before styles on Studio/Research and login/OAuth views, preserving the existing dark theme. Documentation: https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md#disabling-dark-reader-on-your-site. The queue/sign-out Pages release is `9c47bccc-708f-471b-9a05-8707b5197b3b`, Git `b611c1c1b1977e0b98891e2f85ce7408b20db225`; its LAB_JOBS binding is verified. A no-purchase probe invoked the live queue consumer successfully.

2026-09-12 confirmed live theme repair: Pages `f6b685f8-47a6-42ec-9dd4-47db1b4c6d18`, Git `166930faa97ba565d891beba151fafda740de9b9`. Operator confirmed the colors look correct. Both initial and delayed live checks show Dark Reader absent, the full approved gold gradient restored, border rgb(56,59,41), and gold button rgb(255,209,47). Removed the temporary render-check endpoint and browser reporting after collecting that proof. Live queue probe and canceled-job redelivery succeeded; scheduled recovery is also now observed every minute without exceptions. The 66-file POC baseline, including private env/data, remains byte-for-byte unchanged. Stable anonymous protected API returns JSON401/no-store; stable and immutable pages.dev origins return503/no-store. No controlled paid generation acceptance had been run at this checkpoint.

Prompt controls verification: inspected four responsive prompt captures (1920, 1440, 768, 390) and the account dropdown. Attachment/Generate gap is exactly 8px at all four widths with aligned centers and one Generate icon. Both account badges compute to rgb(255,209,47). No page overflow or browser script errors. Evidence: .artifacts/control-alignment/.
