# Importing processes

Written process instructions (Word docs, checklists, runbooks) become import files here. Each
file adds **processes** (step-by-step instructions), the **systems** they happen in, and the
**connections** (data flows) between those systems to the map.

## How a file gets into the app

- **Shipped with the app.** List the file in `index.json`, then deploy. The first person to open
  the app afterwards imports it automatically, once. A `meta` record named `import-<file name>`
  remembers that it's done, so deleting something it added doesn't bring it back.
- **By hand.** **Processes → Import from a file…** (or **⋯ → Import processes…**) shows exactly
  what a file would add before anything is saved.

Either way, nothing already on the map is overwritten:

- A system matches an existing one by `key`, `name`, or any name in `match`, ignoring case.
- A connection matches by `key`, or by the same two systems and kind plus the same name (or no
  name on either side). If the existing connection has no steps yet, it gets the imported steps
  and any empty fields. Otherwise it's left alone.
- A process matches by `key` or name. A match is skipped unless the person importing by hand
  ticks **Replace**.

New systems are placed beside a system they connect to. Drag them anywhere afterwards.

## Format

```json
{
  "format": "finflow-import",
  "version": 1,
  "name": "Shown in the import message",
  "systems": [
    { "key": "sys-salesforce", "name": "Salesforce", "category": "giving",
      "match": ["Salesforce NPSP"], "description": "…", "owner": "", "url": "" }
  ],
  "connections": [
    { "key": "c-eft-tieout", "from": "sys-cass", "to": "sys-salesforce",
      "kind": "reconcile", "method": "manual", "name": "Weekly EFT & Misc batch tie-out",
      "frequency": "Weekly", "description": "…", "owner": "",
      "steps": [ { "kind": "export", "text": "…", "tool": "Cass online banking" } ] }
  ],
  "processes": [
    { "key": "proc-eft-donations", "name": "EFT donations", "area": "Gifts & donations",
      "frequency": "Daily", "owner": "Alex Hepburn", "status": "documented", "purpose": "…",
      "source": "EFT_Process_Guide.docx", "docUrl": "https://docs.google.com/…",
      "sections": [
        { "title": "Daily: find and enter new gifts",
          "steps": [ { "text": "…", "who": "Alex Hepburn",
                       "system": "sys-cass", "connection": "c-eft-tieout" } ] }
      ],
      "reference": [
        { "title": "EFT source table", "note": "…",
          "columns": ["Bank display name", "Portal"], "rows": [["NCF/", "https://…"]] }
      ] }
  ]
}
```

- `from`, `to` and a step's `system` take a system key **or name**. These can be systems already
  on the map (`sys-acumatica`, `sys-budgyt`, `sys-bill`, `sys-plane`, `sys-tapestry`) or ones in
  this file. A step's `connection` takes a connection key from this file or the map.
- `category`: `spend`, `payroll`, `erp`, `budget`, `reporting`, `banking`, `giving`,
  `spreadsheet`, `other`.
- `kind`: `flow` (one way), `reconcile` (compare / tie-out), `sync` (two-way).
- `method`: `api`, `import` (file import), `manual` (manual entry), `other`.
- Connection step `kind`: `export`, `transform`, `check`, `import`, `other`.
- `frequency`: `Daily`, `Weekly`, `Bi-weekly`, `Semi-monthly`, `Monthly`, `Quarterly`,
  `Annually`, `As received`, `Ad hoc`.
- A process's `owner` is accountable for the whole process. A step's `who` is that step's
  owner; leave it out when the process owner does it. Several people: `"Alex Hepburn / Joel Paul"`.
- `status`: `undocumented`, `documented`, `review`. Left out, it's `documented` once there are
  steps. A process with only a name, owner and `docUrl` is fine: it lists a process that hasn't
  been written up yet.
- `reference` tables are read-only in the app. They suit lookup tables (portals, keyword lists,
  links). Web addresses in them become links.

## Rules when converting a document

- **No secrets.** Leave out passwords, access codes, API keys and default logins, even if the
  source document has them. Say where a credential lives (“Bitwarden, Shared-Financial”), never
  what it is. Everything here is readable by anyone signed in at BibleProject, and the deploy is
  scanned for secrets.
- **A connection is data moving between two systems.** If a step only happens inside one system
  (releasing a JRE in Acumatica), it's a process step with that `system`, not a connection.
- **Keep the author's instructions; drop the meeting notes.** Feature requests, one-off fixes and
  history don't belong in a process.
- Keys are permanent: once a file has been deployed, don't rename its keys.
