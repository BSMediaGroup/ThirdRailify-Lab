# Update to ThirdRailify Lab 0.4.0-poc

This is one complete cumulative archive. No previous ZIP or individual file downloads are needed.

1. Stop the old Lab console with Ctrl+C.
2. Extract all ZIP contents directly into **X:\GIT\ThirdRailify-Lab\poc**. Choose Replace for application files. Do not delete the existing folder.
3. Double-click **START-LAB.cmd**.
4. Refresh the existing local browser tab with **Ctrl+F5**. Keep the same local address and browser profile.

The ZIP contains no extra enclosing folder. `START-LAB.cmd` and `server.mjs` belong directly under `poc`.

## Preserved

The ZIP does not contain `.env`, `.data`, `.git`, local `assets`, font binaries, model-provider credentials or personal browser storage. Merging application files leaves those in place. The launcher does not regenerate existing keys, clear projects, or change Windows execution policy.

No new variables, webhook secret, package installation, build, migration or Cloudflare action is required.

## New controls

- Research **Context & tools** edits the selected provider/model's instructions and supported tools. The paperclip accepts images and supported documents.
- Studio paperclip selects an actual model image input, or supplies reference images to direct GPT/Grok editing.
- Canvas header: zoom, width-fit, height-fit, contain, pan, reset and window-height lock. All are view-only.
- Library saved-session cards have Rename beside Delete.
- Settings and Connections are redesigned. Brand & Assets is a new intentionally scaffolded page.
- Provider logos load from your existing local icon files; the OpenAI filename is `opanai.svg` exactly as requested.

Web/analysis tools are requested by default, subject to provider/model access and billing. A model may reject a tool or optional effort value. Adjust that model's Context & tools settings; the app never secretly switches provider or drops a feature. Existing conversational histories remain separate by provider.

## Verify

The footer shows **0.4 POC**. Connections shows the current local key presence without requiring you to reenter keys. Library should retain your saved projects. `VERIFY-PACKAGE.cmd` checks application-file hashes without reading private files.

## Limitations

Authentication is scaffolded, not production-ready. Multi-key profiles, historical usage graphs/balances, Brand collection editing and embedded Google Images are future work. Voice/video are not supported attachments. Live paid inference and real account-specific model access were not tested during packaging.
