# Third Railify Notespace — local POC 0.1.0

A working local-first brainstorming board, honey-do list and visual notebook. This is an **isolated proof of concept**, not a deployed Lab feature. It does not use Cloudflare, D1, the existing Lab login, or any of your current provider credentials.

## Open it

1. Extract the complete `notespace-poc` folder. Recommended location: `X:\GIT\ThirdRailify-Lab\notespace-poc`.
2. Double-click **START-NOTESPACE.cmd**. It uses your existing Node.js 22+ installation, starts only a loopback server, and opens your browser. No npm install or build is needed. The address is `http://127.0.0.1:4321`.
3. Keep the console open while using the app. Ctrl+C in that console stops only this POC.

For a zero-server preview, double-click **OPEN-NOTESPACE.html** instead. Everything needed for the core editor is embedded in that file. Browsers that restrict file-origin storage should use the launcher above. The launcher is recommended for stable local links and cross-window storage.

**Do not overwrite the existing Lab `poc` folder or copy these files over the live app.** This package belongs in its own `notespace-poc` folder.

## Start here

The opening board is a fully editable example, not a screenshot. The people shown on cards are assignment labels, not simulated online collaborators.

- Double-click a note or checklist to edit it. Select an object to edit its tags, colors, dimensions, assignment and custom fields in the inspector.
- Drag cards into containers. Containers are actual parents; moving one carries its children. Drag a child outside to detach it. Nested containers are supported. Resizing a container does not scale its contents.
- Choose a tool in the floating toolbar, then click to place an object. The pen tool draws while dragging. The connector tool takes two clicks: object-to-object, object-to-point or point-to-point.
- Open **Honey-do list** on the left to use a focused list of the board's real tasks. Checkmarks stay in sync with the canvas.
- Use **Images & GIFs** for uploads, a direct HTTPS image, the original bundled stickers, or optional provider search.
- Use **Your boards** to make, open, rename or delete boards. New boards can be blank, brainstorm starters or task boards.
- **Cinema** hides the surrounding shell but keeps the tools. The inspector button opens the full object inspector as a floating drawer. **Popout** opens the same stored board in a separate cinema window. Escape restores the workspace.
- **Share board** explains the local link and offers an editable export. The planned `lab.thirdrailify.com/notespace/<code>` is a preview only, not a live published URL.

## Working features

Sticky notes; text blocks; editable checklists with assignees and due dates; rounded containers; nested grouping; rectangle/ellipse shapes; freehand vector strokes; bound/free straight, curved and elbow leaders; labels and arrowheads; multi-select; drag, resize, lock, duplicate, delete, front/back stacking; undo/redo; pan, zoom and fit; minimap; local board library; find by text, tags, assignee and custom fields; canvas color, gradient, pattern and image background; cinema mode; local popout; JSON export/import; still PNG overview export.

Each object can carry `text`, `number`, `boolean`, `date`, `url` and `reference` fields. These are stored data, not executable formulas. Object IDs and connector endpoints are retained for a future rule/linking system.

## Images and GIFs

PNG, JPEG, WebP, animated GIF, AVIF, BMP, ICO and safe SVG are accepted when the current browser can decode them. APNG uses the PNG path. HEIC/HEIF, TIFF and PSD need conversion first; no unsupported decoder is claimed. Maximum 20 MB per local image, 20,000 pixels per side and 80 megapixels. SVG scripts, event handlers and external resources are rejected.

Images are shown with **Contain** by default: full image, no destructive crop. An optional Cover display crop is available in the inspector. Raster originals and GIF animation bytes are preserved in local storage and editable exports. Safe SVG is sanitized before storage. The bundled animated spark is original sample artwork.

A direct external image remains an external reference, so its host must permit display and remain reachable. PNG overview export is a simplified still layout, not a pixel-identical browser screenshot; remote/provider media uses labeled placeholders. Use the editable Notespace export to preserve local originals and GIF animation.

## Saving, sharing and collaboration — exact boundary

- Boards and local images autosave into this browser's **IndexedDB**. They are not saved into the repository or Cloudflare. Export regularly for an independent backup.
- Data is separated by browser and origin. The standalone file, `localhost`, `127.0.0.1`, and different ports can have separate storage. Keep using the same address. Use Export / Import when switching.
- Other tabs/windows on the same browser origin receive local change notifications through BroadcastChannel and read the same IndexedDB. Presence labels represent actual local windows only.
- Changes merge per object property. Simultaneous changes to the same property use the latest committed value; this is **not a CRDT or production multi-user collaboration service**. Undo history is cleared after a remote window update to avoid undoing another window's stale state.
- Shawn and Gina on different devices cannot join a live shared board yet. For now send an exported `.notespace.json` file, then import it in their copy. Those boards are independent copies.
- The seven-character case-sensitive code is an identifier, **not an access credential**. Production sharing must retain Lab authorization and explicit access grants. No production URL is activated by this package.
- Clearing browser data can remove boards. Deleting a board leaves its local media available to other boards/undo histories; automatic orphan-media cleanup is intentionally deferred.

## Optional GIF-provider setup

**No API key is needed to open the app, edit boards, upload GIFs or use the bundled stickers.** Optional provider setup is in `docs/GIF-PROVIDERS.md`.

Integrated search adapters exist for GIPHY and eligible existing Tenor clients. They have not been live-tested with your accounts. Client keys are entered in the GIF key dialog and kept in the current tab's session storage, never in board exports. These are provider-designated client keys, not Lab secrets or paid AI-provider keys. Searches are user initiated, bounded, and have no automatic retry loop.

## Branding

The local launcher looks for existing user-owned files in nearby Lab asset folders and `X:\GIT\ThirdRailify-Lab`: American Captain headings, Blinker body, Geist Mono, and `labs0.svg`. It references matching files **in place**; it does not copy them, change them, or include them in this package. The fully standalone HTML uses installed local fonts where available and system fallbacks otherwise. No font files are distributed.

Chrome uses dark desaturated violet with gold accents. The default canvas is `#131415`, a nearly black blue-gray at approximately **5% HSL saturation**, under the requested 10% maximum. Accent colors on cards are independent of the canvas background.

## Controls

| Action | Shortcut |
| --- | --- |
| Select / pan | V / H; hold Space to pan |
| Note / text / checklist / container | N / T / L / F |
| Image picker / connector / pen / shape | I / C / P / R |
| Search text, tags and fields | Ctrl+F |
| Edit selected object | Enter or double-click |
| Multi-select | Shift-click, or drag a selection box |
| Duplicate / delete | Ctrl+D / Delete |
| Group / ungroup | Ctrl+G / Ctrl+Shift+G |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| Zoom at cursor | Ctrl+wheel; + / - |
| Fit all / 100% | Shift+1 / 0 |
| Nudge / larger nudge | Arrow keys / Shift+arrow |
| Close dialog or leave cinema | Escape |

On narrow mobile screens, the initial camera focuses the first container rather than shrinking the whole board into unreadable thumbnails. Fit still shows the whole board.

## Safety and current limitations

The Node launcher binds only `127.0.0.1`, serves a small allowlisted set of static files, and has no upload, proxy, account or cloud write endpoints. It rejects other hostnames, non-read methods, hidden files and path traversal. **Do not expose this local POC through a tunnel or public hosting.** It is not an authenticated application.

No dependencies, installation downloads, hosted scripts, remote fonts, telemetry, D1 polling, production route checks or paid generation calls are required. Optional remote media/GIF actions contact their hosts only when requested or when displaying a chosen remote reference.

This is an interactive prototype, not a production replacement for a mature whiteboard engine. Real cross-device collaboration, account permissions, cloud storage, public/approved sharing, advanced rich-text editing, formulas, binding execution, robust document conflict resolution and large-board virtualization are future work. Mobile toolbars are responsive; advanced gestures such as two-finger pinch/rotation are not implemented.

## Package map

- `OPEN-NOTESPACE.html` — self-contained entry point, no build required.
- `START-NOTESPACE.cmd` / `server.cjs` — Windows launcher and read-only local server.
- `public/index.html`, `styles.css`, `app.js` — editable application sources.
- `public/model.js` — board, parenting, diff, import-validation and search model.
- `public/seed.js`, `public/media/spark.gif` — original editable examples and artwork.
- `scripts/build-standalone.cjs` — regenerate the single HTML after editing sources.
- `tests/model.test.cjs`, `tests/server.test.cjs` — executable Node regression tests.
- `docs/RESEARCH.md` — open-source and licensing research with official sources.
- `docs/GIF-PROVIDERS.md` — optional provider setup and real constraints.
- `docs/IMPLEMENTATION.md` — local data contract and production handoff direction.
- `docs/VALIDATION.md` / `evidence/` — actual tests, screenshots and disclosed gaps.
- `BUMP_NOTES.md` — POC development notes.

To run tests from this folder: `node --test tests/*.test.cjs`. With PowerShell npm commands use `npm.cmd`, not bare `npm`. Opening this POC does not require either command.
