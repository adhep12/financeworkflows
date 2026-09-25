# Finance data flows

A zoomable map of BibleProject's finance systems and how data moves between them. It's a
[bp-vibes](CLAUDE.md) app with no build step: `index.html` (markup and styles) and `app.js` (the
map, storage, presence).

- **Zoom out** to see every system and how data moves between them.
- **Click a connection** to open its step-by-step process: source → steps → destination.
- **Zoom in** on the map and each connection shows its steps as numbered dots, colour-coded by
  type. Click a dot to go straight to that step.
- **Click a system** to see its owner, what it's used for, and everything it sends, receives,
  reconciles or syncs with.

Every edit saves automatically and is shared with anyone signed in at BibleProject.

## How data moves

Every connection says **how** the data gets across: **API / automatic**, **File import**,
**Manual entry**, or **Other**. That sets the line's colour and is what its label says, so the
map answers "where are we still re-keying things?" at a glance. The connection's name appears
when you hover or zoom in. The bar at the top-left filters the map to one method (click it
again to show everything).

## Live together

When teammates have the map open at the same time:

- **Who's here** — their avatars sit in the top bar. Hover for what they're looking at; click to
  jump to it.
- **Cursors** — everyone's pointer is drawn on the map with their name, pinned to map positions
  so it lines up whatever your own zoom. Cursors trail about a second behind.
- **What they have open** — a box in their colour, with their initials, around the system or
  connection they're viewing; hover it for who and which step. In the side panel: "Jordan is
  looking at step 2" / "Jordan is editing step 3", with that step outlined in their colour.
- **Edits appear live** — within a second or two, with a brief highlight on what changed.

How it works: the platform has no live channel, so each open tab keeps one small record in the
`presence` collection (cursor trail, what's open, a counter that ticks when they save) and every
tab reads the collection once a second. A tab only writes about once a second while its cursor
moves *and* someone else is watching, every 15 seconds otherwise, and not at all when hidden.
Someone disappears when they close the tab, or 40 seconds after their tab goes quiet.

Your own other windows show too, as "You (other window)", so you can check it's working on your
own. If cursors don't appear, **⋯ → Live connection status** shows what the app can see: when it
last checked for others, whether its own updates are going out, and who's here.

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

All declared in `vibes.json`:

| Collection | One record per | Notes |
| --- | --- | --- |
| `systems` | piece of software / spreadsheet | name, category, description, owner, link, map position |
| `flows` | connection between two systems | `refs.from` / `refs.to` → `systems/<key>`; kind, name, description, frequency, owner, ordered `steps` |
| `meta` | — | `seeded` marker, so the starter map from the original runbook is written only once |
| `presence` | open browser tab | cursor trail, what's open, what's being edited; ephemeral |

All are `"access": "shared"`: **anyone signed in at BibleProject** can read them.

If two people edit the same record at once, the app re-reads the newer version and replays your
edit on top of it, so neither person's change is lost. Unsaved edits are also kept in the browser
until they reach the server, so a sign-in reload doesn't lose typing.

Opened straight from disk (no platform), the app runs in **local preview** mode and saves to
this browser only.

## Deploying

Zip the three app files (all at the top level) and upload the zip on the app's page in HAL:

```sh
zip finance-data-flows.zip index.html app.js vibes.json
```
