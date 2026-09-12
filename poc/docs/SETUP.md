# ThirdRailify Lab — setup and operation
## Complete local POC 0.4.0-poc

### 1. Run the local app

Extract ZIP contents directly into `X:\GIT\ThirdRailify-Lab\poc`. For an update, stop the previous console first and merge/replace application files without deleting the folder. Node 22 or newer must be installed. Double-click `START-LAB.cmd`, then use `http://127.0.0.1:4317`. No dependency installation or build is required. Keep the console open.

The launcher calls `node.exe` directly, not PowerShell's blocked `npm.ps1`. It does not change execution policy. To stop, press Ctrl+C in the Lab console. A submitted provider generation may continue; stopping the Lab is not a refund or a cancellation.

### 2. Preserve configuration

On an update, leave `.env` and `.data` in place. No new variables are required. The app reads its own `.env` before inherited environment values. There is no need to maintain duplicate permanent Windows variables.

For a new install, use the in-app Connections dialog. Alternatively copy `.env.example` to `.env` once and fill the provider-issued keys privately. Do not overwrite an existing `.env` with the example file.

### 3. Connect Replicate

1. Sign in at https://replicate.com and check your billing/credits.
2. Open https://replicate.com/account/api-tokens and create a dedicated Lab token.
3. In Connections paste it into Replicate, click Save connections, then Test.
4. Select Replicate in Create, search a model or enter an owner/model reference, and load its real input schema.
5. Fill required fields, review the model's pricing/license, and click Generate or Run model once.

`REPLICATE_API_TOKEN` is provider-issued, not a random locally invented secret. Blank key fields keep saved keys. Provider catalog requests and authentication tests do not create image generations.

The local server polls prediction status and copies supported image output bytes into `.data/assets`. Keep it running until local saving finishes. A generation's provider record link can help investigate uncertain submission/network failures before retrying and incurring another charge. Existing download retry resumes output saving rather than generation.

### 4. Connect OpenAI/GPT and Grok

For OpenAI, create an API project key at https://platform.openai.com/api-keys and verify API billing/model access. Save it as `OPENAI_API_KEY` in Connections. For Grok, use https://console.x.ai/ to create/select the team API key and funding, then save `XAI_API_KEY`.

Image and chat model dropdowns load provider-returned catalog lists. OpenAI's catalog is not a detailed capability schema; compatible IDs are filtered, but the actual provider is authoritative for tool, parameter and account access. Catalog failures are explicit or labelled cached/saved fallback. The app does not invent account balances.

Images through Replicate and research through GPT/Grok are independent choices. Direct-provider model selections are optional saved defaults. Model names in fixtures/documentation are not guarantees of current API availability.

### 5. Research context, tools and attachments

Select the research provider/model and open **Context & tools**. Instructions are saved separately per provider/model in `.data/state.json`.

- Web search: OpenAI/Grok Responses API tool.
- Code & data analysis: provider-hosted `code_interpreter` tool; no local arbitrary-code execution.
- Grok also exposes X search and page-image/image-search options.
- Reasoning effort and image detail are optional explicit settings. Provider default is safest for model portability.
- Leave output budget blank to omit an app-level output cap. Provider limits and billing still apply.

Tools are requested, not guaranteed to be invoked. Unsupported settings return an explicit provider error without silent model switches or feature removal. Search sources, tool activity, usage and generated-file links are based on returned evidence, not fake thinking/search animations. Hidden chain-of-thought is not displayed.

Use the paperclip to attach PNG/JPEG/WebP, PDFs, or supported UTF-8 text/code files (TXT, MD, CSV, JSON, JS, MJS, TS, TSX, JSX, PY, JAVA, C, CPP, H, CS, HTML, CSS, XML, YAML/YML, SQL, LOG, SH, PS1). Maximum eight files per message, 16 MB per file, and 64 MB of distinct attachments per conversation request. Audio/video/ZIP/Office binaries are not supported in this POC.

Images are sent as actual image inputs. Documents use provider Files endpoints; temporary remote files are reused within a request and deletion is attempted afterward, including on stop/error. Check cleanup warnings. Local files stay in `.data/attachments`; deleting a conversation is not a local file purge or a provider-retention guarantee. Documents can be resent as part of subsequent conversation turns. Only share files you authorize the selected provider to process.

OpenAI container-file citations are downloaded to local files where supported. Grok returned source/output links remain provider links unless supported by the implemented adapter. Unsupported output formats are not represented as successfully saved local files. Stop preserves partial returned text.

### 6. Image references and canvas controls

The Studio paperclip chooses a real Replicate image-input field. Multiple image fields open a field picker, so a reference is not sent to the wrong parameter. Prompt-free image models do not require an unrelated prompt. For direct GPT/Grok image editing, select images using the same paperclip, then give the editing instruction in the prompt.

References are saved locally before submission. Schema-required fields remain authoritative. Models with complex/non-image outputs may need a future specialized adapter. The app does not bypass provider moderation or license restrictions.

Canvas default: centered, width-fit, growing to show the full image height. Header controls provide zoom, height-fit, contain, pan, reset, and window-height lock. Fullscreen uses the available display area. These controls change only the view. Composer dimensions and exported original pixels are unchanged. In Compose, image fit/crop is a deliberate composition setting, separate from view zoom.

### 7. Projects, Library and research windows

Studio and Research share each document tab. Save persists settings, image references, both provider conversations, drafts, and attachment references together. Working tabs remain in the existing browser storage. Use the same hostname/port/browser profile to recover them. Saving also writes the project to disk.

Close uses a confirmation; closing is different from deleting a saved record. New/discard work opens a clean project without deleting prior saved data. Library is the fallback when all tabs close. Rename changes the saved title while retaining project contents. Project/history deletion retains image files; image deletion is separate and blocked for saved references.

The header layout menu includes pane visibility, research window/new-tab, rail auto-hide and panel reset. Auto-hidden rail overlays content without moving it on reveal. Left and right panes resize independently within viewport limits. Research model controls collapse to maximize conversation space.

Detached research uses existing same-origin browser storage and a BroadcastChannel. Browser pop-up settings and host/profile differences can affect it. The test environment could not verify native window navigation; preserve the same local address/profile and open via the app's controls.

### 8. Brand assets

No font binaries or user logo assets are shipped. The app reads existing files from `poc/assets`, parent Lab `assets`, then sibling ThirdRailify/Public and Admin assets.

Heading: `assets/fonts/headings/American Captain.ttf` or `.otf`.
Header: `assets/logos/labs0.svg`.
Provider icons: `assets/icons/replicate-0.svg`, `assets/icons/opanai.svg`, `assets/icons/grok-0.svg`.

Provider SVGs are masked to inherit title color. Missing files show an initial and local-path diagnostics. Restart after adding assets. Brand & Assets previews a future reusable library; no fictional inventories are displayed and management remains disabled. Normal Library is operational.

### 9. Webhooks — not required locally

Leave `REPLICATE_WEBHOOK_SIGNING_SECRET` blank. The POC uses server-side status polling and needs no public callback or tunnel.

Connections can retrieve Replicate's issued signing secret through the existing authenticated API and write it to `.env`, for later hosted preparation only. Retrieving it does not create a callback service. Do not invent a webhook signing key or expose this local server.

Future hosted sequence: implement the secured Lab/account gates and durable owned jobs, deploy a real HTTPS callback, store provider credentials and issued signing secret in encrypted server-side bindings, include the callback when creating predictions, verify raw-body signatures/timestamps, deduplicate delivery and save outputs privately. The included webhook helper is not an active public route.

### 10. Security and deferred production work

Single user, loopback-only server with Host/Origin/CSRF protections, but no production authentication or account authorization. Keys are plaintext local `.env`, not encrypted, and local assets/documents are not encrypted. Keep the directory private. Do not upload `.env` or `.data` to Git.

No Cloudflare attachment, custom-domain change, DNS mutation, remote migration or real transaction is performed by this POC. Production must later reuse Third Railify account/approval/Turnstile authority with proper per-account jobs, storage, quotas, audit and secure key profiles.

Usage histories, account balances, multiple-key switching, Brand collection management and embedded Google Images remain explicitly deferred. Google Images currently opens an external search; a supported embedded provider must be selected for production.

### Official API references

https://replicate.com/docs/reference/http
https://replicate.com/docs/topics/predictions/output-files
https://replicate.com/docs/topics/webhooks/verify-webhook
https://developers.openai.com/api/docs/guides/tools-web-search
https://developers.openai.com/api/docs/guides/file-inputs
https://developers.openai.com/api/docs/guides/tools-code-interpreter
https://developers.openai.com/api/docs/guides/image-generation
https://docs.x.ai/developers/tools/web-search
https://docs.x.ai/developers/tools/code-execution
https://docs.x.ai/developers/model-capabilities/files/chat-with-files
https://docs.x.ai/developers/model-capabilities/images/editing

Provider/model availability changes. The adapter sends these documented request shapes; live paid account/model acceptance was not performed for this package. See TESTING.md for exact evidence and limits.
