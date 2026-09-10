# Protected hosted implementation — later Codex milestone

This is architecture/planning documentation, **not a deployment instruction for the un-gated POC**. The eventual hostname is `lab.thirdrailify.com` and the repository is `X:\GIT\ThirdRailify-Lab`.

## Carry forward

Reuse the approved layout, thumbnail document model, per-provider adapters, schema normalization, job-state vocabulary, request-identity protections, settings presentation and responsive Research desk. Retain the distinction between actual provider output and authored procedural layout samples.

The current Node server is a local filesystem process. It is **not a drop-in Cloudflare Pages Function**, and `.data` is not a multi-tenant database. A production port needs explicit durable services rather than uploading this folder and assuming it works.

## Identity and permissions

Inspect the actual current ThirdRailify-Admin account/session/handoff implementation and adapt it; do not create another identity database or match people by display name/email alone. Reuse canonical IDs, server-verified roles and the established login/Turnstile flows.

Grant Lab use only to Admins and explicitly approved accounts under the agreed policy. Separate access, generation/spend authority, provider-settings authority and administrative access to other users' work. Require owner/role checks on job creation/status, conversations, project files, image downloads, uploads and exports, not only the UI shell.

Keep ordinary account access from implying unlimited API spend. Add per-account/project limits, model allowlists, concurrency, audit records and an explicit authorized billing owner. Never give every approved user the provider API tokens. Turnstile is not a substitute for authentication or asset authorization.

Use the existing session-cookie/CSRF/cross-origin design after inspection. Do not casually broaden all account cookies or put a shared master secret in a browser bundle.

## Application and storage authority

Choose the hosting boundary after inspecting existing Cloudflare structure. A Lab-specific Worker/Pages backend may own Lab D1 records and private R2 assets while trusting the existing account authority through its supported mechanism. Do not add public D1 bindings or repurpose unrelated commerce tables without deliberate design.

A hosted job needs:
- canonical owner ID and authorization context;
- local request ID, provider prediction/request ID and immutable input/model/version snapshot;
- durable queued/submitted/processing/completed/failed/uncertain states;
- independent download/import state and retained original asset references;
- quota/spend accounting and cancellation semantics;
- recovery after network interruption or process loss;
- file/reference ownership and bounded upload validation.

Use a durable queue/workflow for provider submissions and output imports. Avoid billing duplicates after ambiguous POST timeouts. A repeated browser request should return the original job. A webhook should update a known job, never mint an unknown user's asset just because a prediction ID was supplied.

Keep generated originals private. Serve authorized assets through protected routes or tightly bounded signed delivery rather than publicly enumerable permanent CDN URLs. Thumbnail exports remain linked to their source/project and owner. Durable retention/deletion and storage budgets must be explicit.

## Model discovery and input schemas

Retain true per-model input schemas. Do not pretend every Replicate model supports the same image dimensions, seeds, negative prompts, reference images or pricing. Support advanced schemas deliberately, and reject incompatible media families.

A model picker should distinguish documented capability, account access, version, provider, license link and configured allowlist. Do not present a guessed cost as an authoritative provider quote.

Direct OpenAI/SpaceXAI model IDs and features must be rechecked against official docs and the actual account at implementation time. Never silently switch providers on a failure; that would send private inputs to another service without the user's selection.

## Replicate callbacks

Implement the actual signed HTTPS callback only when the hosted job store exists. Retrieve the real Replicate webhook secret, verify raw bytes and timestamp/signature, prevent replay, and handle repeated/out-of-order terminal updates. Retain polling/reconciliation for callbacks that are missed.

Record files to private durable storage promptly. Preserve uncertainty and show import failures separately from successful provider generation. Keep outputs used by saved projects until the appropriate retention/deletion workflow permits removal.

## Chat and research

The POC's text streaming is useful for UI review, not a full ChatGPT clone. Production should add owner-scoped conversation storage, message editing/regeneration, provider/model history labels, proper Markdown/code rendering, attachment controls and explicit token/cost limits.

Only display tool/search/thinking status corresponding to actual API events. Do not invent inner reasoning, a hidden chain-of-thought transcript or fake search citations. Any research/web tool must identify its source and supported capability.

Integrated image search is a separate provider decision. Google Custom Search JSON API is closed to new customers; a new deployment must not assume access. Preserve the Google Images tab/external navigation while researching a currently supported licensed integration. An image search result is not automatically a licensed reusable asset.

## Deployment sequence — when authorized

1. Approve the local layout and concrete POC workflow.
2. Audit the new Lab repository and existing account authority. Scope writable repositories explicitly.
3. Implement and test protected backend/storage/quotas before public exposure.
4. Create the verified Lab hosting project and private bindings under the correct Cloudflare account. Use scoped secrets in the project actually executing the provider calls; do not duplicate them across Public/Admin without a need.
5. Test authorized and unauthorized access on every route and asset, Turnstile server verification, job retries, webhook signatures, private downloads and spending limits.
6. Apply only reviewed necessary migrations with backups and a verified target/configuration.
7. Deploy exact validated artifacts and configure `lab.thirdrailify.com` through the explicitly authorized domain task.
8. Perform bounded real-provider acceptance, verify billing, complete-image persistence, account isolation and recovery.

Keep the main Public site, Admin and Bot operational throughout. No new Lab feature should weaken their existing identity or permission boundaries.
