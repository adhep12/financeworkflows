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

All three are `"access": "shared"`, which means **anyone signed in at BibleProject** can read and
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
