# Finance data flows

A zoomable map of BibleProject's finance systems and the processes that move data between
them. It's built as a [bp-vibes](CLAUDE.md) app: a single `index.html` with no build step.

- **Zoom out** to see every system and how data moves between them.
- **Click a connection** to open its step-by-step process: source → steps → destination.
- **Zoom in** on the map and each connection shows its steps as numbered dots, colour-coded by
  type. Click a dot to go straight to that step.
- **Click a system** to see its owner, what it's used for, and everything it sends, receives,
  reconciles or syncs with.

Every edit saves automatically and is shared with anyone signed in at BibleProject.

## Live together

When teammates have the map open at the same time:

- **Who's here** — their avatars sit in the top bar. Hover for what they're looking at; click to
  jump to it.
- **Cursors** — everyone's pointer is drawn on the map with their name, pinned to map positions
  so it lines up whatever your own zoom. Cursors trail about a second behind.
- **What they have open** — a ring in their colour around the system or connection they're
  viewing. In the side panel: "Jordan is here too" / "Jordan is editing step 3", with that step
  outlined in their colour.
- **Edits appear live** — within a second or two, with a brief highlight on what changed.

How it works: the platform has no live channel, so each open tab keeps one small record in the
`presence` collection (cursor trail, what's open, a counter that ticks when they save) and every
tab reads the collection once a second. A tab only writes about once a second while its cursor
moves *and* someone else is watching, every 15 seconds otherwise, and not at all when hidden.
Someone disappears when they close the tab, or 40 seconds after their tab goes quiet.

## Using it

| To… | Do this |
| --- | --- |
| Add a system | **+ System**, or double-click empty canvas |
| Connect two systems | Drag the ● on a system's right edge onto another system, or **+ Connection** |
| Pick the relationship | *Data flow* (one way), *Reconciles with* (compare/tie-out), *Two-way sync* |
| Document a process | Open a connection → **Add a step**. Each step has a type (Export, Transform, Check, Import, Other) and an optional tool or file. <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> adds the next step. |
| Reorder or remove steps | Hover a step → ↑ ↓ ✕ (deleting offers Undo) |
| Move things around | Drag systems; **⋯ → Tidy layout** arranges them left → right by data flow |
| Find anything | <kbd>/</kbd> searches systems, connections and step text |
| Navigate | Scroll or pinch to zoom, drag to pan, <kbd>F</kbd> fits everything, <kbd>Esc</kbd> closes the panel |
| Back up | **⋯ → Export as JSON** |

A connection's badge shows how well it's documented: *Needs documentation* (no steps),
*Partially documented* (1–2), *Documented* (3+).

## Data

Three collections, all declared in `vibes.json`:

| Collection | One record per | Notes |
| --- | --- | --- |
| `systems` | piece of software / spreadsheet | name, category, description, owner, link, map position |
| `flows` | connection between two systems | `refs.from` / `refs.to` → `systems/<key>`; kind, name, description, frequency, owner, ordered `steps` |
| `meta` | — | `seeded` marker, so the starter map from the original runbook is written only once |
| `presence` | open browser tab | cursor trail, what's open, what's being edited; ephemeral |

All four are `"access": "shared"`, which means **anyone signed in at BibleProject** can read and
edit the map. To limit it to the finance team, change each to `"group:<finance group name>"` in
`vibes.json` and redeploy.

If two people edit the same record at once, the app re-reads the newer version and replays your
edit on top of it, so neither person's change is lost. Unsaved edits are also kept in the browser
until they reach the server, so a sign-in reload doesn't lose typing.

Opened straight from disk (no platform), the app runs in **local preview** mode and saves to
this browser only.

## Deploying

Zip `index.html` and `vibes.json` (both at the top level) and upload the zip on the app's
page in HAL:

```sh
zip finance-data-flows.zip index.html vibes.json
```
