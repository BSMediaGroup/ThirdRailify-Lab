# Approved POC parity

Baseline: the actual local `poc/` 0.4.0-poc working tree, including deliberate changes after the packaged versions. Existing offline suite: 63 passing; syntax checks passed. Baseline content hashes are retained locally in `.artifacts/poc-baseline.json`; the build never writes to `poc/`.

| Working feature | Production route / implementation |
| --- | --- |
| Replicate discovery, metadata, thumbnails and dynamic schemas | `/api/models/search`, `/api/model`; preserved `models.mjs`, `model-schema.js`, provider adapter |
| Prompt-free and multiple-image workflows | validated model inputs, private reference imports, persisted `/api/generate` jobs |
| GPT/Grok image and edit adapters, separate model choices | `/api/provider-models`, `/api/generate`; real provider image endpoints |
| GPT/Grok research, per-model instructions and tools | `/api/research/profile`, `/api/chat`; provider Responses APIs |
| Image/PDF/text inputs and hosted analysis artifacts | `/api/attachments`, owned downloads and tracked provider-file cleanup |
| Markdown, sources, streaming, stop and partial replies | preserved sanitized renderer; D1 `research_runs`, `/api/research/runs` recovery |
| Shared Studio/Research tabs, save/rename/close/recovery | `/api/projects`, `/:id/rename`, `/:id/delete`; account-scoped browser recovery and server revisions |
| Native Research popout/new tab | protected `/research?session=...`; account/project channels and save conflicts |
| Overlay auto-hide tab rail, independent panels | preserved `app.js`, workspace CSS and resize/keyboard controls |
| Centered canvas, zoom/pan/fit/fullscreen/window height | preserved `canvas-view.js`; original aspect ratio and composer controls |
| Thumbnail composition, imports and PNG/JPEG exports | `/api/import`, `/api/export`, private original downloads |
| Editable creative direction | `/api/preferences`, account-owned presets |
| Library and deletion | `/api/state`, protected media and reference-aware cleanup |
| Connections and Settings | truthful runtime-secret/test states; independent provider permission; disabled multiple-key scaffold |
| Brand & Assets and Google Images | approved scaffold and external-search behavior retained |
| Fonts, logo hover, icons and US English | actual American Captain/Blinker/Geist Mono and approved Lab/provider SVG assets |

POC filesystem endpoints became owned repositories; no production request reads sibling Windows paths. The POC itself remains unchanged. Model listing is not a claim that a model supports every tool. Provider errors are returned explicitly; attachments are not silently removed or models silently replaced in a submitted request.
