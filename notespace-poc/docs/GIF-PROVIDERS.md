# Optional GIF lookup

Nothing in this document is required to open the POC or upload your own images and animated GIFs. No existing Lab or Cloudflare keys are read by the POC.

## GIPHY

1. Open https://developers.giphy.com/ and sign in or register.
2. In the developer dashboard, create an app and choose the **API** option for this prototype.
3. Give it a clear description, e.g. "Third Railify Notespace private whiteboard prototype". Accept the applicable provider terms.
4. Copy the app's developer API key; do not post it in chat or a repository.
5. Launch Notespace, open Images & GIFs, choose GIPHY, then **GIF keys**.
6. Enter the GIPHY client key and save. Search only when ready; each search uses the key's quota. Use the local launcher for an ordinary HTTP origin.
7. Click a returned GIF to add a provider-hosted reference to the board.

GIPHY's current docs state that beta keys are limited to 100 searches/API calls per hour. Production access requires an upgrade application and may involve a pricing discussion. A no-cost, unlimited production account is **not** promised here.

GIPHY requires visible "Powered by GIPHY" attribution in integrations. The picker labels its provider. Its current standard integration rules prohibit proxying API/media requests, caching media URLs or media copies without approval, rewriting returned URLs, reordering provider results or mixing provider results in a shared grid. The prototype therefore calls the provider directly from the browser, stores the GIF ID rather than its rendition URL, keeps results in provider-specific grids, and excludes provider media bytes from exports. Reopening a provider GIF offers a fresh load by ID. Before production, confirm the final attribution artwork/layout and API terms with the provider's approval process.

These client API keys are visible to the browser by design. Do not put OpenAI/Replicate/Lab login secrets in this dialog. The POC keeps GIF keys only in sessionStorage; session keys are not a production vault.

## Tenor

Google's Tenor quickstart states: as of January 2026, Tenor is no longer accepting new API clients. Its key-creation instructions are reference material, not a promise of new eligibility.

For an **already eligible existing client**:
1. Confirm the existing Tenor API key in Google Cloud's APIs & Services / Credentials.
2. Use the existing key and its applicable API restrictions; do not assume a generic new Google key enables Tenor access.
3. Open Notespace -> Images & GIFs -> Tenor -> GIF keys.
4. Enter the existing Tenor client key and save.
5. Search, then select a GIF. The integration uses smaller previews, original provider references and a share-event call.

Without an eligible existing client, the Tenor tab explains the constraint and offers a normal external search link. Uploads and the local animated sticker remain fully usable.

## What was and was not tested

The picker, settings UI, local GIF decoding, local media storage and export/import were tested. No provider account was supplied for this new POC, so actual GIPHY/Tenor authenticated search responses and your key restrictions were **not** live-tested. Invalid/missing keys and fetch failures are surfaced rather than replaced with fake results. There is no automatic paid API or retry loop.

## Official references (reviewed September 2026)

- GIPHY API and beta limits: https://developers.giphy.com/docs/api/
- GIPHY API best practices / attribution: https://developers.giphy.com/docs/api/#best-practices
- Tenor current quickstart and new-client notice: https://developers.google.com/tenor/guides/quickstart
- Tenor attribution: https://developers.google.com/tenor/guides/attribution

Provider licensing does not give blanket rights to publish someone else's copyrighted material. Local uploads are assumed to be material you are entitled to use.
