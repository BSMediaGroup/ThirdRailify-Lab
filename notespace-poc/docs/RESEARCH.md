# Mature foundations considered

Research checked against official project/license documentation in September 2026. This is engineering selection guidance, not a legal opinion. Pin and review the exact package versions and notices before production adoption.

## React Flow / xyflow + Yjs

React Flow is a mature node-based UI toolkit. Its custom HTML nodes, handles, edges, parent-child relations, viewport controls and whiteboard examples make it a good technical fit for structured cards, checklists, nested containers and future object links. Yjs supplies shared data/CRDT building blocks; it does not itself supply your account authorization, persistence or hosting.

The inspected xyflow and Yjs repository licenses are MIT: they permit private modification/use and do not require publishing a public fork. Their copyright and permission notices must remain with copies/substantial portions. That is different from putting a large powered-by badge in your application.

Important nuance: React Flow's current attribution page asks users to subscribe to Pro to remove its built-in attribution and labels that UI action as Pro. Do not rely on an old blog post or assume its Pro examples are included in the core license. Review the exact package and attribution position before production; no Pro subscription or attribution removal has been implemented by this POC.

Sources:
- https://reactflow.dev/learn
- https://reactflow.dev/learn/layouting/sub-flows
- https://reactflow.dev/remove-attribution
- https://raw.githubusercontent.com/xyflow/xyflow/main/LICENSE
- https://github.com/yjs/yjs
- https://raw.githubusercontent.com/yjs/yjs/main/LICENSE

## Excalidraw

MIT-licensed and a strong choice for a drawing-first experience: shapes, arrows, images, freehand, pan/zoom, undo and scene exports. Its default visual/editor model is closer to a sketch whiteboard than to HTML-like interactive cards. A highly customized checklist/container/metadata system is still significant work. Do not assume every feature of the hosted Excalidraw app is a turnkey feature of its embedded editor package, or that hosted collaboration supplies Lab security.

Sources:
- https://github.com/excalidraw/excalidraw
- https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE

## tldraw

Excellent canvas SDK technically, but its current SDK is source-available rather than permissively open source. Production use requires a valid license. The discretionary noncommercial hobby license requires the watermark; commercial deployment uses commercial licensing. This is a poor fit for the requested no-paid-license/no-watermark direction.

Source:
- https://tldraw.dev/community/license

## Decision for this package

This POC uses an **original dependency-free DOM/SVG editor**, not a fork or an embedded copy of any of these libraries. There is no engine license key, vendor watermark, dependency install or hosted SDK requirement. The local visual system and structured board contract can be carried into the Lab implementation.

For production, custom DOM nodes plus a reviewed collaboration layer (such as Yjs) remains a sensible direction. React Flow is a strong alternative for the object/connector engine if its exact-version licensing and attribution fit are accepted. A no-branding requirement does not remove mandatory third-party license notices. We should not casually rebuild a mature conflict-resolution engine simply to avoid a license text file.

GIF-provider attribution is a separate matter from the whiteboard engine. GIPHY and Tenor require their own provider attribution in the GIF picker; building the whiteboard from scratch does not waive those API terms.
