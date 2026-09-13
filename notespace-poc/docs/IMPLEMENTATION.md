# Notespace data contract and production boundary

## Current authority

An original, dependency-free browser application stores boards and local media in IndexedDB (`ThirdRailify-Notespace-POC`, schema version 1). The optional Node server serves files from loopback only. It does not own data, accept write calls, query another repository or contact Cloudflare.

A board has a schema version, a random seven-character case-sensitive base62 ID, title, description, background, ordered objects, edges, revision and updated timestamp. Random codes use crypto.getRandomValues with unbiased sampling and an existing-board collision check. Codes are readable identifiers, never authorization tokens.

Objects have stable IDs, type, parentId, local x/y coordinates, width/height, content, tags, assignment and typed fields. A parent's motion composes with child coordinates. Group/ungroup preserve world positions. Parenting rejects cycles. Deleting a container removes its descendants and references from connector edges.

The DOM hierarchy mirrors real parent/child objects; cards contain ordinary HTML controls. SVG renders leaders/strokes. Native image elements display animated image formats. Drag frames update transforms/positions locally; storage writes happen at gesture completion rather than at every pointer event. No continuous canvas-to-D1 write loop exists.

## Persistence and popouts

Mutations diff object fields and merge inside a browser IndexedDB read/write transaction. BroadcastChannel tells local windows when a board is saved; those windows fetch their latest local state. Presence is ephemeral. The same property edited at once uses last commit wins. Edge-array and list-item updates are not a CRDT. Remote updates clear the receiving window's undo history. This prototype is not a guarantee of conflict-free collaboration across users or devices.

Local media is a stored Blob with an opaque ID. Native blob URLs are recreated after loading a board. JSON exports include base64 local media; imports validate first and allocate new asset IDs and a new board code. GIPHY/Tenor objects retain provider and GIF IDs without persistent rendition URLs. Only user-triggered loads obtain fresh media.

## Production direction, not an authorized deployment

Keep the frontend in the existing **ThirdRailify-Lab Cloudflare Pages** surface. This package does not change that hosting choice and does not add a public Worker frontend.

Use the established Lab account/session gate and access capability. Introduce explicit per-board owner/editor/viewer grants; a share code alone must never grant editor access. Private by default, view/edit grants revocable, no simulated login shortcuts.

Persist media in the existing authorized private Lab media architecture with its size/signature checks. A durable board snapshot should include a version and a safe conflict model. Evaluate a suitable event-driven collaborative transport and Yjs/shared-document persistence after the POC UI is approved. Transport choice, authority and pricing require inspection of the actual current Lab before implementation.

D1 must not receive cursor positions, pan/zoom frames, per-frame drag updates or a repeated full-board list query. Presence is ephemeral and separate. Batch committed content changes, debounce snapshots, use bounded indexed document/access lookups, short-lived authorized session state, backoff on unavailability and explicit quota telemetry. Avoid repeating the unrelated dashboard's quota failure.

Future object automation can address stable object IDs and typed fields. Add typed rules, safe expression parsing, validation, dependency/cycle handling and explicit execution permissions. Do not eval arbitrary strings, treat visual connectors as executable rules, or claim Excel-equivalent behavior from metadata alone.

## Deferred

Production authentication and board grants; cross-device live editing; server durable persistence; permissioned production share links; robust CRDT conflict handling; advanced rich-text/rotation/alignment tools; provider production approvals; orphan asset collection; very-large-board virtualization; object-linked automations.

No migration, cloud configuration, paid provider generation, production route probe or live deployment was performed for this POC.
