# Third Railify Lab — complete setup

Prepared 10 September 2026. This guide concerns the downloadable local POC, not an already hosted service.

## 1. Put the POC in the correct folder

1. Download the supplied ZIP.
2. In File Explorer open `X:\GIT\ThirdRailify-Lab`, the empty repository you already created.
3. Copy/extract the ZIP's **contents** into that directory. Keep its existing `.git` directory. The correct result is `X:\GIT\ThirdRailify-Lab\START-LAB.cmd`.
4. Do not paste source files into the Public, Admin or Bot repository.
5. Double-click **START-LAB.cmd**. It checks Node 22+, opens the browser and runs in its visible console. You do not need `npm install`, a build, PowerShell execution-policy changes or an additional Python environment.
6. Use `http://127.0.0.1:4317`. Keep the console running; Ctrl+C stops it.

Your previous machine logs already showed Node installed. If the launcher reports Node missing/too old, install a supported Node release from [nodejs.org](https://nodejs.org/en/download), then close and reopen the launcher. Do not replace working project-specific toolchains in other repositories for this POC.

To launch from your current PowerShell instead of File Explorer, these are the only commands needed:

```powershell
Set-Location 'X:\GIT\ThirdRailify-Lab'
.\START-LAB.cmd
```

## 2. Review the interface before connecting billing

1. Click **Try a layout**. This makes a local procedural background; it does not call any AI provider.
2. Choose **Compose** in the left rail.
3. Edit the headline, secondary text, badge, colours and output size. Drag the headline on the canvas or use the position controls.
4. Use **Fit / no crop** to preserve the entire background; **Fill / crop** is a deliberate alternative.
5. Click **Save project**, then **Export** to generate a PNG or JPEG. Export also saves a local asset.
6. Open **Library** to reopen the project or inspect outputs.
7. Drag the boundary beside Research desk to resize it, or use its collapse button. A focused resize handle also responds to arrow keys.

The right AI chat and Google tabs are separate from image generation. Selecting Grok for chat does not switch the image provider, and vice versa.

## 3. Get the Replicate API token

1. Sign in to [Replicate](https://replicate.com/).
2. In your account, review billing/credits and enable the billing required for the models you intend to run. Check the chosen model's pricing before a paid test.
3. Open [Replicate API tokens](https://replicate.com/account/api-tokens).
4. Create a dedicated token named something recognizable, such as **ThirdRailify Lab Local**. Use the token Replicate issues; this is not a random secret you invent yourself.
5. Copy the token privately. Do not post it in this chat, Git, screenshots or a shared document.
6. In the Lab click **Connections**. Paste it into **Replicate API token**.
7. Click **Save connections**. The local server writes `REPLICATE_API_TOKEN` into `X:\GIT\ThirdRailify-Lab\.env`. You do not have to edit `.env` manually or set Windows user environment variables.
8. Click the Replicate **Test** action. This authenticates against the account endpoint; it does not create a prediction.

An authentication test is not a guarantee that every paid/private model is available to the account. Model access, billing and input validity are checked on real requests. Reference: [Replicate token documentation](https://replicate.com/docs/topics/security/api-tokens).

## 4. Make the first Replicate image

1. Select **Replicate** in the Image provider control.
2. Open the model picker. Start with **FLUX.1 Schnell** for a simple text-to-image test, or load another compatible model.
3. Click **Load model controls** if the controls are not loaded yet. The Lab requests the model's actual input schema; it does not use a made-up common settings list.
4. Set an aspect ratio using the fields actually supported by that model. Set a single output for your first test where the model offers an output-count field.
5. Enter a harmless test prompt, for example a moody gold-lit recording desk with room for a headline.
6. Review the chosen model's external page/pricing. Click **Generate** once. This submits a billable provider request.
7. Watch the real queued/starting/processing/saving states. There is no invented percentage counter.
8. When successful, inspect the image and use **Compose thumbnail** or download the original.
9. Keep the server open while it downloads the output to `.data/assets`.

The picker supports named-model search and pasting an exact Replicate model URL or `owner/model` reference. Explicit `owner/model:64-character-version` references are supported. Search results are not a promise that every returned model is an image model supported by this prototype. Verify its purpose and license on the provider page.

Common enums, numbers, booleans, text and JSON fields come from the schema. Compatible image URI fields offer local reference upload; larger/specialized nested input schemas may need **Advanced input JSON**. Reference uploads are included only when you submit Generate. They are not automatically sent to an unrelated provider.

Current limits: two running jobs, six queued/running jobs total, up to eight extracted output file URLs, 32 MB per saved provider image. The UI does not compute a guaranteed cross-model price. No generation-POST retry occurs automatically after an uncertain network response.

API contract: [Replicate HTTP API](https://replicate.com/docs/reference/http).

## 5. Local output persistence and failed requests

The original bytes are saved locally, not just their temporary provider links. Replicate documents that API prediction inputs/outputs/logs are removed after an hour by default, so leaving everything as remote hotlinks is unsuitable for a durable image library. See [output files](https://replicate.com/docs/topics/predictions/output-files).

- **Keep the server running** until output saving finishes.
- **Retry download** re-reads an existing known Replicate prediction. It does not create a new generation.
- Known pending Replicate prediction IDs resume checking after a server restart.
- Interrupted direct OpenAI/Grok image requests cannot reliably resume or cancel through this POC.
- **Submission uncertain** means a network interruption may have occurred after the provider accepted the request. Check its dashboard before creating another paid generation.
- Downloaded files remain in `.data/assets` independently of provider retention.
- If provider files expired before the local server saved them, a retry cannot reconstruct deleted provider output.

Do not delete `.data` to troubleshoot without backing it up. Imported images, projects and outputs are private local data, not checked into Git.

## 6. Add GPT / OpenAI (optional)

1. Sign in to the [OpenAI API platform](https://platform.openai.com/).
2. Select the appropriate API project, enable its required billing and review limits.
3. Create a project API key at [API keys](https://platform.openai.com/api-keys). Use a dedicated Lab key where possible.
4. Paste it into **Connections → OpenAI API key** and **Save connections**.
5. Click **Test** to verify model-list authentication. Account permissions can still prevent a selected model from running.
6. Select **GPT** in the image-provider selector and generate an image, or select **GPT / OpenAI** in the chat sidebar and send a message.

Defaults from the current official documentation are `gpt-image-2.5-sunburst` for images and `gpt-6-astra` for chat. The model IDs are editable in Connections because availability varies by account and changes over time. An account lacking access should select a documented model it can actually use, not a fabricated alias.

The direct image adapter uses the Images API. Chat uses the Responses API and streams response text. The POC does not request hidden reasoning or claim live web search. Direct OpenAI image editing is not included yet; use a compatible Replicate reference-image model for that workflow.

Official references: [quickstart](https://developers.openai.com/api/docs/quickstart), [image generation](https://developers.openai.com/api/docs/guides/image-generation).

## 7. Add Grok / SpaceXAI (optional)

1. Sign in to the [SpaceXAI console](https://console.x.ai/).
2. Select your team, configure credits/billing and review its API limits.
3. Create a dedicated API key in the console's API-key area.
4. Paste it into **Connections → Grok / SpaceXAI API key** and save.
5. Click **Test**, then choose **Grok** for images or the chat provider.

Current documented defaults are `grok-imagine-image-2.0` for images and `grok-4.6` for chat. Grok 4.6 access may depend on your account. Change the model ID in Connections to an accessible, documented alternative when needed.

Image generation uses the direct SpaceXAI image endpoint, not the Replicate token. The returned base64 image is saved locally. Chat and image keys are the same provider key but the two provider selections are independent.

Official references: [quickstart](https://docs.x.ai/developers/quickstart), [image generation](https://docs.x.ai/developers/model-capabilities/images/generation).

## 8. Exactly what is stored where

| Setting | Where it goes | Required for this POC? |
|---|---|---|
| `REPLICATE_API_TOKEN` | Lab `.env`, server-side only | For Replicate generation/lookup |
| `OPENAI_API_KEY` | Lab `.env`, server-side only | Only for GPT images/chat |
| `XAI_API_KEY` | Lab `.env`, server-side only | Only for Grok images/chat |
| `OPENAI_IMAGE_MODEL`, `OPENAI_CHAT_MODEL` | Lab `.env` | Defaults supplied; editable |
| `XAI_IMAGE_MODEL`, `XAI_CHAT_MODEL` | Lab `.env` | Defaults supplied; editable |
| `REPLICATE_WEBHOOK_SIGNING_SECRET` | Lab `.env`, server-side only | **Not required** for local polling |
| `PORT` | Lab `.env` | Defaults to 4317 |

The `.env` beside `server.mjs` wins over old Windows environment variables. Blank key inputs preserve existing values. This avoids the earlier confusion between shell variables, permanent Windows variables and an empty repository `.env`.

To remove a key, stop the Lab, remove its line from `.env`, then relaunch. Keys are not encrypted at rest in this local POC. Do not use the workstation as a shared multi-user server. Never prefix these keys with `VITE_` or put them in `public/`.

## 9. Replicate webhooks: nothing required locally

**Do not create a tunnel or configure a callback just to run this POC.** The local server queries the prediction status itself and copies completed images. Replicate cannot call your private loopback address from the internet.

For the future hosted service, Replicate's callback URL is supplied in each prediction request. It is not a generic “register one webhook and all predictions appear” assumption. The callback needs HTTPS and must not depend on an interactive user login or a redirect. See [webhooks](https://replicate.com/docs/topics/webhooks).

### Optional: retrieve the correct signing secret now

1. Save and test the Replicate API token first.
2. In Connections, open the webhook-preparation area.
3. Click **Fetch signing key**.
4. The server calls Replicate's `GET /v1/webhooks/default/secret` and saves the returned key into `REPLICATE_WEBHOOK_SIGNING_SECRET` in the Lab `.env`.
5. The UI reports presence only. It does not print the secret.

**Do not generate a random replacement** for this signing key. Replicate signs with its issued key, not a locally invented value. Retrieving it does not activate a webhook listener in this package.

### Hosted webhook setup sequence (after the protected hosted backend exists)

1. Finish Lab account authorization, approved-access checks, private job storage and private asset delivery first.
2. Create/deploy the actual Lab HTTPS callback, for example `https://lab.thirdrailify.com/api/webhooks/replicate`. This is the proposed future path, **not a working endpoint in this POC**.
3. Store the Replicate API token and fetched signing secret in encrypted runtime settings of the actual callback/job-service project, not public frontend build variables.
4. The generation backend adds its callback URL and `webhook_events_filter: ["completed"]` to each prediction it creates.
5. The callback verifies the raw body against `webhook-id`, `webhook-timestamp` and `webhook-signature`, checks timestamp freshness and constant-time HMAC equality, and rejects forged messages before processing.
6. Match the provider prediction ID to a known job/account. Make duplicate/out-of-order callbacks safe; never create another paid prediction just because a callback is repeated.
7. Persist the event/job update and copy output files into private durable storage. Return promptly; lengthy imports belong in a durable background workflow.
8. Run one deliberately authorized image generation and verify valid-signature success, invalid-signature rejection, repeated-callback no-op, asset ownership and expiry handling.

The verified HMAC helper in `lib/core.mjs` is a starting point with unit tests, not a production callback route. Production still needs durable replay records, job ownership, queueing, monitoring and recovery. Reference: [verify webhooks](https://replicate.com/docs/topics/webhooks/verify-webhook).

## 10. Google Images tab

The tab currently accepts a query and opens Google Images in a new browser tab. It does not scrape Google, embed a blocked iframe, or display invented results.

Google states that Custom Search JSON API is closed to new customers and that existing-customer service ends on 1 January 2027. Do not spend time creating a new project around an assumed available legacy API. An embedded image-search feed needs a separately approved available search integration later. No Google key is needed for the POC's external link. See [Google's current notice](https://developers.google.com/custom-search/v1/overview).

## 11. Fonts and network behaviour

The Lab looks read-only in the sibling `X:\GIT\ThirdRailify` checkout for the existing American Captain, Blinker and Geist Mono files. When found they are used without copying them into this package. No font binaries are distributed.

Fallback typography comes from external Google Fonts CSS when reachable, then system fonts. Font-loading requests do not contain provider credentials. The screenshots accompanying this package use available substitute fonts for visual review; your installed brand fonts determine exact typography locally.

Actual generation transmits the submitted prompt/reference inputs to the chosen provider. Chat sends the current conversation to its selected chat provider. Local-only means the app runs on your machine, **not that cloud AI computation happens offline**.

## 12. Common issues

**Nothing opens:** keep the launcher console visible and read its error. Confirm Node 22+. Manually open the loopback address printed by the launcher.

**Port already in use:** the Lab may already be running. Open its existing page instead of starting another process. Do not kill unrelated Node processes. To choose another port, stop this Lab and edit `PORT` in its `.env`.

**No model controls:** save/test Replicate first, then load the model schema. Some models are inaccessible or have an unsupported schema. Try exact owner/model lookup; use the model's official API schema rather than guessing parameter names.

**401 / 402 / 403 / 429:** inspect the displayed provider explanation for invalid credentials, billing, access or rate limits. Do not repeatedly mash Generate. A model-list test does not prove generation entitlement.

**Model not found:** edit the model identifier in Connections or the Replicate picker to one available to your account. Do not change production project keys to fix a POC model selection.

**Uncertain/interrupted generation:** check the provider dashboard before resubmitting. Direct image cancellation is not guaranteed after submission, and stopping the local server does not guarantee provider billing stops.

**Export looks cropped:** choose Fit / no crop. Fill / crop intentionally scales to cover the selected thumbnail ratio. The original asset is retained separately.

**Browser refuses the local URL:** check the browser's administrator/enterprise policies or another permitted local browser. The app does not modify security policy automatically.

**Chat knows no current facts:** no web research tool is wired in this POC. Treat it as prompt-writing/general conversation, not verified browsing. Provider histories stay separate and can be cleared with New chat.

**Ready for Cloudflare?** Not yet. The protected hosted backend, account integration and approvals must be implemented before `lab.thirdrailify.com` is exposed. See [FUTURE-INTEGRATION](FUTURE-INTEGRATION.md).
