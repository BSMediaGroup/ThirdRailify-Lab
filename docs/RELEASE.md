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
