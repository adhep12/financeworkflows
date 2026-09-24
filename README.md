# Finance data flows

A zoomable map of BibleProject's finance systems and how data moves between them, plus a Finance
hub of roles, process instructions and who owns what. It's a [bp-vibes](CLAUDE.md) app with no
build step: `index.html` (markup and styles), `app.js` (the map, storage, presence) and `hub.js`
(My role, Team, Processes, Settings).

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

## The Finance hub

The data flow map is everyone's home screen. Finance people also get:

- **My role**: your role definition (purpose, responsibilities, what you sign off on, backup,
  systems), and every process you own, sign off, back up or do steps in. Switch to any teammate.
- **Team**: everyone's photo and name (from their BibleProject sign-in), and a grid of who owns,
  backs up and signs off each process. Processes with no backup are flagged.
- **Processes**: every process you can see, grouped by function. Each process has an owner,
  backup, sign-off, schedule and a link to its connection on the map, and three views:
  **Swimlane by person**, **Step by step** (the editor: who does each step, tool, time,
  checklist) and **As a flow map** (the tools the data passes through, with each step on the hop
  where it happens).
- **Settings** (admins): everyone who has opened the app, with exactly what each person can see:
  My role, Team, whole functions or single processes. New people see only the data flow map.
  Also functions, the default home screen, and whether people can pick their own.

Anyone can pick their own home screen from the menu under their name.

**Admins**: `alex.hepburn@bibleproject.com` is always an admin (`BOOTSTRAP_ADMINS` in `app.js`),
so Settings can never be locked out. More admins are added in Settings.

**What access really means**: the pages and processes a person can't see are hidden in the app.
The data is in `shared` collections, so someone determined could still read it with developer
tools. That was a deliberate choice. Anything that must be truly locked belongs in a
`group:<name>` collection instead.

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
| `people` | person who has opened the app | name, email, photo URL and team from the sign-in; first/last seen; chosen home screen |
| `access` | person | admin flag, pages (My role, Team), functions and individual processes they can see |
| `functions` | Finance function | name, colour, order; processes are grouped and shared by function |
| `roles` | role | holder, title, purpose, responsibilities, sign-offs, backup, systems |
| `processes` | process | function, linked connection, owner/backup/sign-off, schedule, steps (who, tool, minutes, checklist) |

All are `"access": "shared"` (**anyone signed in at BibleProject** can read them); what each person
*sees* is decided by the access records above.

If two people edit the same record at once, the app re-reads the newer version and replays your
edit on top of it, so neither person's change is lost. Unsaved edits are also kept in the browser
until they reach the server, so a sign-in reload doesn't lose typing.

Opened straight from disk (no platform), the app runs in **local preview** mode and saves to
this browser only.

## Deploying

Zip the four app files (all at the top level) and upload the zip on the app's page in HAL:

```sh
zip finance-data-flows.zip index.html app.js hub.js vibes.json
```
