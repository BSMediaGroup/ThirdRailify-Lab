> Historical UPDATE-0 record. Current release: [0.4 update](UPDATE-0.4.md) and [testing](TESTING.md).

# Update the existing /poc installation to 0.2

1. Finish any generation you want to keep running, then press Ctrl+C in the old Lab console.
2. Keep the existing `X:\GIT\ThirdRailify-Lab\poc` folder. Do not delete it.
3. Extract this archive's **contents directly into that folder**, replacing application files. There is no extra enclosing `poc` folder in the archive.
4. Leave your `.env`, `.data`, local assets and repository `.git` in place. They are not included in this archive and do not need replacing.
5. Double-click `X:\GIT\ThirdRailify-Lab\poc\START-LAB.cmd`.
6. Reload the existing browser tab (Ctrl+F5). Use the same address/profile to retain browser chat history.

No package install, build, new API key, webhook, Windows environment-variable setup
or Cloudflare change is required. The webhook field can remain blank.

## Where to find the changes

**Image models:** click GPT or Grok in the left controls. The model dropdown loads
from your key's provider catalogue. The refresh icon reloads it. Chat has its own
provider/model selectors. Connections defaults are dropdowns too.

**Work lifecycle:** Save session and New / discard work sit above the canvas.
Library has delete controls for saved sessions, completed generation records and
local images. Deleting a session keeps images. Delete/change any referencing saved
session before deleting an image. Discard does not cancel already-submitted jobs.

**Chat lifecycle:** New chat archives the current conversation. The trash icon
clears the current conversation; the folder/history icon opens/deletes past chats.
These conversations are stored in this browser, not the on-disk image ledger.

**Workspace:** the top left-rail button switches to icon-only mode. The right divider
can grow much wider, based on screen space. Arrow keys resize, Shift makes larger
steps, Home/End reaches bounds, and double-click resets. The research header has
window and new-tab buttons; the dedicated view has Dock and the same conversation.

**Brand:** the title font is read from `assets/fonts/headings/American Captain.ttf`
or `.otf`. The motif is `assets/logos/labs0.svg`. Lookup checks `poc/assets`, then
`ThirdRailify-Lab/assets`, then the sibling Public/Admin assets, all read-only.
Connections → Local brand assets displays which files were found. Restart after
adding assets. This ZIP supplies neither your font binaries nor a made-up labs0
icon. With missing files you see fallback typography/LAB placeholder.

**Account widget:** matches the Admin layout and has a working dropdown, but is
explicitly a local scaffold. It does not claim a real authenticated session.

## Provider-model limitations

The menu is populated from the API rather than a hardcoded selection list.
OpenAI's catalogue gives IDs, not a full task/parameter schema; this adapter
filters compatible ID families and lets the provider report model-specific
access/options errors. Grok uses its typed image and language catalogues.
No catalogue read submits a billable generation. Existing .env selections are
preferences, not proof of access. A failed discovery is labelled rather than
silently filled with invented models.

## Preservation and safety

Your keys and saved work are not migrated or cleared on startup. Destructive
Library actions are deliberate and separate. Model/side-panel preferences and
chat history remain under the same browser storage keys. Keep this unauthenticated
POC on localhost; production accounts, approvals and Turnstile remain future work.
