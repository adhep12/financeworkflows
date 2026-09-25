import { createHub } from './hub.js';

/* =====================================================================================
   Constants
   ===================================================================================== */
// Always admins, so the app can never lock everyone out of Settings. Add more admins in the app.
const BOOTSTRAP_ADMINS = ['alex.hepburn@bibleproject.com'];
const NODE_W = 212, NODE_H = 68;
const FONT = getComputedStyle(document.body).fontFamily;

const CATEGORIES = [
  { id: 'spend',       label: 'Spend & AP',            color: '#C0632A' },
  { id: 'payroll',     label: 'Payroll & contractors', color: '#7B55B5' },
  { id: 'erp',         label: 'ERP / general ledger',  color: '#3569B0' },
  { id: 'budget',      label: 'Budgeting & planning',  color: '#12876A' },
  { id: 'reporting',   label: 'Reporting & BI',        color: '#C2417A' },
  { id: 'banking',     label: 'Banking & payments',    color: '#8C7A14' },
  { id: 'spreadsheet', label: 'Spreadsheet / manual',  color: '#6E7681' },
  { id: 'other',       label: 'Other',                 color: '#9A7458' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const catOf = (s) => CAT[s?.category] || CAT.other;

const STEP_KINDS = [
  { id: 'export',    label: 'Export / pull',   color: '#3569B0' },
  { id: 'transform', label: 'Transform / map', color: '#7B55B5' },
  { id: 'check',     label: 'Check / review',  color: '#C0632A' },
  { id: 'import',    label: 'Import / post',   color: '#12876A' },
  { id: 'other',     label: 'Other',           color: '#6E7681' },
];
const SK = Object.fromEntries(STEP_KINDS.map(k => [k.id, k]));
const kindOfStep = (s) => SK[s?.kind] || SK.other;

const LINK_KINDS = {
  flow:      { label: 'Data flow',       short: 'Sends data', arrow: '→' },
  reconcile: { label: 'Reconciles with', short: 'Reconciles', arrow: '⇢⇠' },
  sync:      { label: 'Two-way sync',    short: 'Syncs',      arrow: '⇄' },
};
const FREQUENCIES = ['', 'Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Annually', 'Ad hoc'];

/* The map as it stood in the original runbook. Written once, the first time anyone opens the
   app, then it's everyone's to edit. */
const SEED_SYSTEMS = [
  { key: 'sys-bill',      name: 'Bill / Divvy',   category: 'spend',     description: 'Credit card transactions.', x: 0,   y: 0 },
  { key: 'sys-plane',     name: 'Plane',          category: 'payroll',   description: 'Contractor payroll.', x: 0,   y: 190 },
  { key: 'sys-budgyt',    name: 'Budgyt',         category: 'budget',    description: 'Budgets by fiscal year and scenario.', x: 0,   y: 400 },
  { key: 'sys-acumatica', name: 'Acumatica',      category: 'erp',       description: 'General ledger: journal entries, AP, vendors, subaccounts, grants and departments.', x: 440, y: 95 },
  { key: 'sys-tapestry',  name: 'Tapestry Vibes', category: 'reporting', description: 'Business reviews — budget and actuals side by side.', x: 880, y: 250 },
];
const S = (kind, text, tool = '') => ({ kind, text, tool });
const SEED_FLOWS = [
  {
    key: 'flow-bill-acumatica', from: 'sys-bill', to: 'sys-acumatica', kind: 'flow',
    name: 'Card transactions → JEs',
    description: 'Credit card transactions mapped and posted as journal entries.',
    steps: [
      S('export', 'Pull transactions from Bill', 'Bill'),
      S('transform', 'Paste into the Input tab in Excel', 'Excel'),
      S('check', 'Confirm vendor names — check whether each is already in Acumatica under a different name, or needs to be added (either add the name to the list tied to that vendor ID, or add a new vendor in Acumatica)', 'Acumatica'),
      S('export', 'Export the Acumatica vendor list', 'Acumatica'),
      S('check', 'Scan for accidental credit card purchases (7676), or missing info — confirm the account is active under department + grant, and the subaccount exists in Acumatica; if not, add it or reclass', 'Excel'),
      S('import', 'Import creates ~23 JREs in Acumatica — attach the Excel file to the journal entry as support', 'Acumatica'),
    ],
  },
  {
    key: 'flow-plane-acumatica', from: 'sys-plane', to: 'sys-acumatica', kind: 'flow',
    name: 'Contractor payroll → AP',
    description: 'Contractor payroll cross-referenced against timesheets and posted via an existing AP Import Scenario.',
    steps: [
      S('export', 'Pull the Plane report and paste into the spreadsheet', 'Plane'),
      S('transform', 'Go to the Contractor Breakdown Google Sheet: copy/paste the contractor breakdown and the default contractor info into the respective tabs in the spreadsheet', 'Contractor Breakdown Google Sheet'),
      S('check', 'Confirm invoices are unique for that contractor and not already matched in Acumatica', 'Acumatica'),
      S('check', 'Confirm breakdown totals match the Plane report payment total'),
      S('check', 'Confirm subaccount, grant, and department are active and work together (same check as Bill import)', 'Acumatica'),
      S('import', 'Perform the import in Acumatica — attach the spreadsheet as support', 'AP Import Scenario'),
    ],
  },
  {
    key: 'flow-budgyt-tapestry', from: 'sys-budgyt', to: 'sys-tapestry', kind: 'flow',
    name: 'Budget',
    description: 'Budget data pushed into Tapestry Vibes for business reviews.',
    steps: [
      S('export', 'Export Budgyt as rows, excluding zeros', 'Budgyt'),
      S('transform', 'Convert the file to CSV'),
      S('import', 'Direct import into Tapestry, replacing the fiscal year and budget scenario exported', 'Tapestry Vibes'),
    ],
  },
  {
    key: 'flow-acumatica-tapestry', from: 'sys-acumatica', to: 'sys-tapestry', kind: 'flow',
    name: 'GL actuals',
    description: 'Acumatica actuals pushed into Tapestry Vibes for business reviews.',
    steps: [
      S('export', 'Export the GL Register Detailed report', 'Acumatica'),
      S('transform', 'Convert the file to CSV'),
      S('import', "Direct import into Tapestry for the period covered in the file (auto-detected) — adds new data, doesn't replace all", 'Tapestry Vibes'),
    ],
  },
];

/* How the data actually gets from one system to the other. This is what the map leads with:
   the line's colour and its label. */
const METHODS = {
  api:    { label: 'API / automatic', short: 'API · automatic', color: '#12876A', pulse: 0.9,
            icon: 'M13 2 4 14h7l-1 8 9-12h-7z', hint: 'Systems talk to each other; nobody touches it' },
  import: { label: 'File import', short: 'File import', color: '#3569B0', pulse: 1.8,
            icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 18v-6M9 15l3-3 3 3', hint: 'Someone exports a file and uploads it' },
  manual: { label: 'Manual entry', short: 'Manual entry', color: '#C0632A', pulse: 3.2,
            icon: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', hint: 'Someone reads it and types it in' },
  other:  { label: 'Other', short: 'Other', color: '#7B55B5', pulse: 2.4,
            icon: 'M5 12h.01M12 12h.01M19 12h.01', hint: 'Email, report, a mix…' },
};
const METHOD_UNSET = { label: 'Not set yet', short: 'How? Not set', color: '#9AA1AC', pulse: 0,
  icon: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01', hint: 'Pick how this data moves' };
const methodOf = (f) => METHODS[f?.method] || METHOD_UNSET;
const methodIcon = (m, size = 14, stroke = 'currentColor') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${m.icon}"/></svg>`;
// Every flow in the original runbook is a file export + import.
const SEED_METHOD = { 'flow-bill-acumatica': 'import', 'flow-plane-acumatica': 'import', 'flow-budgyt-tapestry': 'import', 'flow-acumatica-tapestry': 'import' };

const SEED_FUNCTIONS = [
  { key: 'fn-ap',       name: 'Accounts payable',       color: '#C0632A', order: 1 },
  { key: 'fn-gl',       name: 'General ledger & close', color: '#3569B0', order: 2 },
  { key: 'fn-payroll',  name: 'Payroll & contractors',  color: '#7B55B5', order: 3 },
  { key: 'fn-fpa',      name: 'Budget & FP&A',          color: '#12876A', order: 4 },
  { key: 'fn-treasury', name: 'Treasury & banking',     color: '#8C7A14', order: 5 },
  { key: 'fn-grants',   name: 'Grants & reporting',     color: '#C2417A', order: 6 },
];
const SEED_PROCESSES = [
  { key: 'proc-cc-jes', name: 'Credit card transactions → journal entries', functionId: 'fn-ap', flowId: 'flow-bill-acumatica', frequency: 'Monthly', description: 'Credit card transactions mapped and posted as journal entries.' },
  { key: 'proc-contractor-ap', name: 'Contractor payroll → AP', functionId: 'fn-payroll', flowId: 'flow-plane-acumatica', frequency: '', description: 'Contractor payroll cross-referenced against timesheets and posted via an existing AP Import Scenario.' },
  { key: 'proc-budget-tapestry', name: 'Budget → Tapestry', functionId: 'fn-fpa', flowId: 'flow-budgyt-tapestry', frequency: '', description: 'Budget data pushed into Tapestry Vibes for business reviews.' },
  { key: 'proc-gl-tapestry', name: 'GL actuals → Tapestry', functionId: 'fn-fpa', flowId: 'flow-acumatica-tapestry', frequency: 'Monthly', description: 'Acumatica actuals pushed into Tapestry Vibes for business reviews.' },
];

/* =====================================================================================
   Small helpers
   ===================================================================================== */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

function initials(name) {
  const words = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return (words[0][0].toUpperCase() + (words[0][1] || '').toLowerCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

const measureCtx = document.createElement('canvas').getContext('2d');
function fitText(text, font, max) {
  text = String(text || '');
  if (!measureCtx) return text.length > 24 ? text.slice(0, 23) + '…' : text;
  measureCtx.font = font;
  if (measureCtx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && measureCtx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
function textWidth(text, font) {
  if (!measureCtx) return String(text).length * 6.5;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function statusOf(flow) {
  const n = (flow.steps || []).filter(s => (s.text || '').trim()).length;
  if (n === 0) return { cls: 'empty', label: 'Needs documentation' };
  if (n < 3) return { cls: 'partial', label: 'Partially documented' };
  return { cls: 'documented', label: 'Documented' };
}

/* =====================================================================================
   Toasts, banner, save indicator
   ===================================================================================== */
function toast(msg, { action, error = false, ms = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

function banner(html, { error = false, retry } = {}) {
  const b = $('#banner');
  if (!html) { b.hidden = true; return; }
  b.className = 'banner' + (error ? ' error' : '');
  b.innerHTML = `<span>${html}</span>`;
  if (retry) {
    const btn = document.createElement('button');
    btn.className = 'btn sm'; btn.textContent = 'Try again'; btn.onclick = retry;
    b.append(btn);
  }
  b.hidden = false;
}

const saveUI = { inflight: 0, failed: false };
function renderSaveState() {
  const el = $('#saveState');
  const txt = $('.txt', el);
  el.className = 'save-state';
  if (store.mode === 'local') {
    el.classList.add('local');
    txt.textContent = 'Local preview — saved in this browser only';
  } else if (saveUI.failed) {
    el.classList.add('error');
    txt.innerHTML = `Couldn't save your last change · <button id="retrySave">Retry</button>`;
    $('#retrySave').onclick = retryFailed;
  } else if (saveUI.inflight > 0) {
    el.classList.add('saving');
    txt.textContent = 'Saving…';
  } else {
    const n = typeof activePeople === 'function' ? activePeople().length : 0;
    txt.textContent = n ? `All changes saved · live with ${n} other${n > 1 ? 's' : ''}` : 'All changes saved · shared with the BibleProject team';
  }
}

function explain(err) {
  if (err?.signedOut) return 'Signing you in again…';
  if (err?.full) return 'This app is out of storage space — ask the app owner to free some up.';
  if (err?.conflict) return 'Someone else changed this at the same time.';
  return err?.message ? `Couldn't save: ${err.message}` : "Couldn't save — check your connection.";
}

/* =====================================================================================
   Storage: the platform records store, or localStorage when the platform isn't here
   ===================================================================================== */
const LOCAL_DB = 'finflow:local-db';
const store = {
  mode: null,
  rec: null,
  db: null,
  async init() {
    try {
      const m = await import('/_shared/data.js');
      this.rec = m.records;
      this.mode = 'remote';
    } catch {
      this.mode = 'local';
      try { this.db = JSON.parse(ls.get(LOCAL_DB)) || null; } catch { this.db = null; }
      this.db ||= { systems: {}, flows: {}, meta: {} };
    }
  },
  persistLocal() { ls.set(LOCAL_DB, JSON.stringify(this.db)); },
  async listAll(coll) {
    if (this.mode === 'local') return Object.entries(this.db[coll] || {}).map(([key, r]) => ({ key, ...clone(r) }));
    const out = [];
    for (let offset = 0; ; offset += 500) {
      const res = await this.rec.list(coll, { limit: 500, offset });
      const page = Array.isArray(res) ? res : (res?.records || res?.items || []);
      out.push(...page);
      if (page.length < 500) break;
    }
    return out;
  },
  async get(coll, key) {
    if (this.mode === 'local') { const r = this.db[coll]?.[key]; return r ? { key, ...clone(r) } : null; }
    return this.rec.get(coll, key);
  },
  async put(coll, key, record) {
    if (this.mode === 'local') { (this.db[coll] ||= {})[key] = clone(record); this.persistLocal(); return; }
    return this.rec.put(coll, key, record);
  },
  async remove(coll, key) {
    if (this.mode === 'local') { delete this.db[coll]?.[key]; this.persistLocal(); return; }
    return this.rec.remove(coll, key);
  },
};

/* ---- Entities <-> records ----
   Map collections: systems, flows. Hub collections: people (one per person who has opened the
   app), access (what each person may see), functions, roles, processes. meta holds seed markers
   and the app-wide settings record. */
const MAP_COLLS = ['systems', 'flows'];
const HUB_COLLS = ['people', 'access', 'functions', 'roles', 'processes', 'meta'];
const ALL_COLLS = [...MAP_COLLS, ...HUB_COLLS];
const state = Object.fromEntries(ALL_COLLS.map(c => [c, new Map()]));
const collOf = (type) => type === 'system' ? 'systems' : 'flows';
const mapOf = (coll) => state[coll];
const refKey = (ref) => typeof ref === 'string' ? ref.split('/').pop() : null;
const arr = (v) => Array.isArray(v) ? v : [];
const str = (v) => typeof v === 'string' ? v : '';

/* Every hub record gets the same shape back whatever an older or newer version saved. */
function normalize(coll, d) {
  const base = { updatedAt: d.updatedAt || 0, updatedBy: str(d.updatedBy) };
  switch (coll) {
    case 'people': return { ...base, email: str(d.email).toLowerCase(), name: str(d.name) || str(d.email), first: str(d.first), avatar: str(d.avatar), dept: str(d.dept), firstSeen: d.firstSeen || 0, lastSeen: d.lastSeen || 0, home: str(d.home), added: !!d.added };
    case 'access': return { ...base, email: str(d.email).toLowerCase(), admin: !!d.admin, pages: { myrole: !!d.pages?.myrole, team: !!d.pages?.team }, functions: arr(d.functions).filter(x => typeof x === 'string'), processes: arr(d.processes).filter(x => typeof x === 'string') };
    case 'functions': return { ...base, name: str(d.name) || 'Untitled', color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#6E7681', order: Number.isFinite(d.order) ? d.order : 0 };
    case 'roles': return { ...base, title: str(d.title), holder: str(d.holder).toLowerCase(), purpose: str(d.purpose), duties: arr(d.duties).map(str), decides: arr(d.decides).map(str), reportsTo: str(d.reportsTo), backup: str(d.backup).toLowerCase(), systems: str(d.systems) };
    case 'processes': return {
      ...base, name: str(d.name) || 'Untitled process', functionId: str(d.functionId), flowId: str(d.flowId),
      owner: str(d.owner).toLowerCase(), backup: str(d.backup).toLowerCase(), signoff: str(d.signoff).toLowerCase(),
      frequency: str(d.frequency), when: str(d.when), duration: str(d.duration), description: str(d.description),
      steps: arr(d.steps).map(s => ({ id: str(s?.id) || rid('st'), kind: str(s?.kind) || 'other', text: str(s?.text), tool: str(s?.tool), who: str(s?.who).toLowerCase(), minutes: Number.isFinite(s?.minutes) ? s.minutes : null, checklist: arr(s?.checklist).map(c => ({ id: str(c?.id) || rid('ck'), text: str(c?.text) })) })),
    };
    default: return { ...d };
  }
}

function fromRecord(coll, r) {
  const d = r?.data || {};
  if (coll === 'systems') {
    return {
      key: r.key, name: d.name || 'Untitled', category: d.category || 'other',
      description: d.description || '', owner: d.owner || '', url: d.url || '',
      x: Number.isFinite(d.x) ? d.x : 0, y: Number.isFinite(d.y) ? d.y : 0,
      updatedAt: d.updatedAt || 0, updatedBy: d.updatedBy || '',
    };
  }
  if (coll !== 'flows') return { key: r.key, ...normalize(coll, d) };
  return {
    key: r.key,
    from: refKey(r.refs?.from) || d.from, to: refKey(r.refs?.to) || d.to,
    kind: LINK_KINDS[d.kind] ? d.kind : 'flow',
    method: METHODS[d.method] ? d.method : (SEED_METHOD[r.key] || ''),
    name: d.name || '', description: d.description || '', frequency: d.frequency || '', owner: d.owner || '',
    steps: (Array.isArray(d.steps) ? d.steps : []).map(s => ({ id: s.id || rid('st'), kind: s.kind || 'other', text: s.text || '', tool: s.tool || '' })),
    updatedAt: d.updatedAt || 0, updatedBy: d.updatedBy || '',
  };
}
function toRecord(coll, e) {
  const { key, ...data } = e;
  if (coll !== 'flows') return { data };
  return { data, refs: { from: `systems/${e.from}`, to: `systems/${e.to}` } };
}

/* ---- Saving: one queue per record, edits replayed onto fresh data on conflict ----------
   Every edit is a small `mutate(entity)` function. It's applied to what's on screen right
   away, then queued. If the server says someone else changed the record first, we re-read
   it and replay just *our* pending edits onto their version — a merge, not an overwrite. */
const queues = new Map();
const debounced = new Map();
const STASH = 'finflow:stash';

function stash(coll, key, entity) {
  if (store.mode !== 'remote') return;
  let s = {}; try { s = JSON.parse(ls.get(STASH)) || {}; } catch { }
  if (entity) s[`${coll}/${key}`] = { coll, key, entity }; else delete s[`${coll}/${key}`];
  ls.set(STASH, JSON.stringify(s));
}

function stamp(e) { e.updatedAt = Date.now(); e.updatedBy = user.name || ''; }

function edit(coll, key, mutate, { debounce, render: doRender = true } = {}) {
  const e = mapOf(coll).get(key);
  if (!e) return;
  mutate(e); stamp(e);
  if (doRender && MAP_COLLS.includes(coll)) renderCanvas();
  if (debounce) {
    const dk = `${coll}/${key}/${debounce}`;
    const prev = debounced.get(dk);
    if (prev) clearTimeout(prev.t);
    const fire = () => { debounced.delete(dk); queueSave(coll, key, mutate); };
    debounced.set(dk, { t: setTimeout(fire, 650), fire });
    stash(coll, key, e);
  } else {
    queueSave(coll, key, mutate);
  }
}
function flushDebounced() { for (const d of [...debounced.values()]) { clearTimeout(d.t); d.fire(); } }

function queueSave(coll, key, mutate) {
  const id = `${coll}/${key}`;
  let q = queues.get(id);
  if (!q) { q = { coll, key, mutates: [], running: false, failed: false }; queues.set(id, q); }
  if (mutate) q.mutates.push(mutate);
  const e = mapOf(coll).get(key);
  if (e) stash(coll, key, e);
  if (!q.running) runQueue(q);
}

async function runQueue(q) {
  q.running = true; q.failed = false;
  saveUI.inflight++; renderSaveState();
  try {
    while (q.mutates.length || q.create) {
      const batch = q.mutates.splice(0);
      q.create = false;
      const e = mapOf(q.coll).get(q.key);
      if (!e) break;
      try {
        await store.put(q.coll, q.key, toRecord(q.coll, e));
      } catch (err) {
        if (!err?.conflict) { q.mutates.unshift(...batch); throw err; }
        // Someone else saved first: take their version and replay our edits onto it.
        const fresh = await store.get(q.coll, q.key);
        const merged = fresh ? fromRecord(q.coll, fresh) : clone(e);
        for (const m of batch) m(merged);
        stamp(merged);
        mapOf(q.coll).set(q.key, merged);
        renderCanvas();
        if (!drawerHasFocus()) renderDrawer();
        if (!MAP_COLLS.includes(q.coll)) hubRefresh();
        try { await store.put(q.coll, q.key, toRecord(q.coll, merged)); }
        catch (err2) { q.mutates.unshift(...batch); throw err2; }
        toast('Merged your edit with a change a teammate just made.');
      }
    }
    stash(q.coll, q.key, null);
    queues.delete(`${q.coll}/${q.key}`);
    presenceRev();
  } catch (err) {
    q.failed = true;
    saveUI.failed = true;
    toast(explain(err), { error: true, action: err?.full ? null : { label: 'Retry', fn: retryFailed } });
  } finally {
    q.running = false;
    saveUI.inflight--;
    if (![...queues.values()].some(x => x.failed)) saveUI.failed = false;
    renderSaveState();
  }
}
function retryFailed() {
  saveUI.failed = false;
  for (const q of queues.values()) if (q.failed && !q.running) runQueue(q);
  renderSaveState();
}
const hasPendingSaves = () => debounced.size > 0 || [...queues.values()].some(q => q.running || q.mutates.length);

async function createEntity(coll, entity) {
  stamp(entity);
  mapOf(coll).set(entity.key, entity);
  const q = { coll, key: entity.key, mutates: [], running: false, failed: false, create: true };
  queues.set(`${coll}/${entity.key}`, q);
  stash(coll, entity.key, entity);
  runQueue(q);
}

async function deleteEntity(coll, key) {
  const id = `${coll}/${key}`;
  for (const [dk, d] of debounced) if (dk.startsWith(id + '/')) { clearTimeout(d.t); debounced.delete(dk); }
  queues.delete(id);
  stash(coll, key, null);
  mapOf(coll).delete(key);
  try { await store.remove(coll, key); presenceRev(); }
  catch (err) { toast(explain(err), { error: true }); await reload(); }
}

addEventListener('pagehide', flushDebounced);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDebounced(); });

/* =====================================================================================
   Loading, seeding, refreshing
   ===================================================================================== */
async function fetchAll() {
  const lists = await Promise.all(ALL_COLLS.map(c => store.listAll(c).catch(err => { if (MAP_COLLS.includes(c)) throw err; return []; })));
  return Object.fromEntries(ALL_COLLS.map((c, i) => [c, lists[i]]));
}

async function seedIfNeeded(data) {
  const hub = await seedHubIfNeeded(data);
  if (data.systems.length || data.flows.length) return hub;
  let marker = null;
  try { marker = await store.get('meta', 'seeded'); } catch { }
  if (marker) return false;
  const who = user.name || '';
  const now = Date.now();
  try {
    for (const s of SEED_SYSTEMS) {
      const { key, ...data } = s;
      await store.put('systems', key, { data: { ...data, owner: '', url: '', updatedAt: now, updatedBy: who } });
    }
    for (const f of SEED_FLOWS) {
      const e = { ...f, frequency: '', owner: '', updatedAt: now, updatedBy: who,
        steps: f.steps.map(s => ({ id: rid('st'), ...s })) };
      await store.put('flows', f.key, toRecord('flows', e));
    }
    await store.put('meta', 'seeded', { data: { at: now, by: who } });
  } catch (err) {
    if (!err?.conflict) throw err; // a teammate seeded at the same moment — fine, just load theirs
  }
  await seedHubIfNeeded({ ...data, flows: SEED_FLOWS.map(f => ({ key: f.key })) }, true);
  return true;
}

/* The hub starts with Finance's functions and one process per runbook flow, its steps copied
   from the flow so there's something real to assign people to. Written once. */
async function seedHubIfNeeded(data, force) {
  if (data.functions.length || data.meta.some(r => r.key === 'seeded-hub')) return false;
  const who = user.name || '', now = Date.now();
  try {
    for (const f of SEED_FUNCTIONS) await store.put('functions', f.key, { data: { name: f.name, color: f.color, order: f.order, updatedAt: now, updatedBy: who } });
    const flowKeys = new Set(data.flows.map(r => r.key));
    for (const p of SEED_PROCESSES) {
      if (!force && !flowKeys.has(p.flowId)) continue;
      const flow = data.flows.find(r => r.key === p.flowId);
      const src = SEED_FLOWS.find(f => f.key === p.flowId);
      const steps = arr(flow?.data?.steps).length ? flow.data.steps : (src?.steps || []);
      await store.put('processes', p.key, { data: { ...p, key: undefined, owner: '', backup: '', signoff: '', when: '', duration: '', updatedAt: now, updatedBy: who,
        steps: steps.map(s => ({ id: rid('st'), kind: s.kind || 'other', text: s.text || '', tool: s.tool || '', who: '', minutes: null, checklist: [] })) } });
    }
    await store.put('meta', 'seeded-hub', { data: { at: now, by: who } });
  } catch (err) {
    if (!err?.conflict) throw err;
  }
  return true;
}

function applyFetched(data) {
  const pendingIds = new Set([...queues.keys(), ...[...debounced.keys()].map(k => k.split('/').slice(0, 2).join('/'))]);
  const next = Object.fromEntries(ALL_COLLS.map(c => [c, new Map()]));
  for (const c of ALL_COLLS) {
    for (const r of data[c] || []) next[c].set(r.key, pendingIds.has(`${c}/${r.key}`) && state[c].get(r.key) || fromRecord(c, r));
  }
  // Things we created that haven't reached the server yet
  for (const id of pendingIds) {
    const [coll, key] = id.split('/');
    if (next[coll] && !next[coll].has(key) && state[coll].get(key)) next[coll].set(key, state[coll].get(key));
  }
  for (const c of ALL_COLLS) state[c] = next[c];
}

async function restoreStash() {
  if (store.mode !== 'remote') return;
  let s = {}; try { s = JSON.parse(ls.get(STASH)) || {}; } catch { }
  let n = 0;
  for (const { coll, key, entity } of Object.values(s)) {
    const cur = mapOf(coll).get(key);
    if (!entity || (cur && (cur.updatedAt || 0) >= (entity.updatedAt || 0))) { stash(coll, key, null); continue; }
    mapOf(coll).set(key, entity);
    queueSave(coll, key, (x) => Object.assign(x, entity));
    n++;
  }
  if (n) toast(`Restored ${n} unsaved change${n > 1 ? 's' : ''} from your last visit.`);
}

async function load() {
  banner(null);
  try {
    let data = await fetchAll();
    if (await seedIfNeeded(data)) data = await fetchAll();
    applyFetched(data);
    await restoreStash();
  } catch (err) {
    $('#loading').textContent = '';
    if (err?.signedOut) banner('Signing you in again…');
    else banner(`Couldn't load the map. ${esc(err?.message || '')}`, { error: true, retry: () => load().then(() => fitAll(false)) });
    return false;
  }
  renderCanvas();
  renderSaveState();
  return true;
}

let lastRefresh = 0, needsReload = false, drawerStale = false;
const snapshot = () => {
  const m = new Map();
  for (const c of ALL_COLLS) for (const [k, v] of state[c]) m.set(`${c}/${k}`, JSON.stringify(v));
  return m;
};
/* Pull in teammates' edits. Runs when someone else saves (their presence says so), on a slow
   timer as a backstop, and when the window regains focus. Never interrupts a drag, an open
   dialog or an edit of ours that hasn't saved yet — it just tries again a moment later. */
async function reload() {
  if (dialogOpen() || drag || hasPendingSaves()) { needsReload = true; return; }
  needsReload = false;
  lastRefresh = Date.now();
  try {
    const before = snapshot();
    applyFetched(await fetchAll());
    const after = snapshot();
    const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
    const removed = [...before.keys()].filter(k => !after.has(k));
    if (!changed.length && !removed.length) return;
    if (sel && !mapOf(collOf(sel.type)).has(sel.id)) { closeDrawer(); toast('A teammate just deleted what you had open.'); }
    renderCanvas();
    applyAccessToChrome();
    for (const k of changed) {
      const [coll, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
      const els = coll === 'systems' ? $$(`.node[data-node="${CSS.escape(id)}"]`) : coll === 'flows' ? $$(`[data-edge="${CSS.escape(id)}"]`) : [];
      els.forEach(el => { el.classList.add('remote-flash'); setTimeout(() => el.classList.remove('remote-flash'), 1900); });
    }
    if (sel) {
      if (drawerHasFocus()) drawerStale = true; else renderDrawer();
    }
    if ([...changed, ...removed].some(k => !k.startsWith('systems/') && !k.startsWith('flows/'))) hubRefresh();
  } catch { /* offline — keep what's on screen */ }
}
addEventListener('focus', () => { if (Date.now() - lastRefresh > 15000) reload(); });

/* =====================================================================================
   Camera: pan & zoom
   ===================================================================================== */
const svg = $('#canvas');
const viewportG = $('#viewport');
const gridPattern = $('#grid');
const stage = $('#stage');
let view = { x: 0, y: 0, k: 1 };
let animId = 0;
const K_MIN = 0.05, K_MAX = 3;

function setView(v) {
  cancelWheelZoom.skip || cancelWheelZoom();
  view = { x: v.x, y: v.y, k: clamp(v.k, K_MIN, K_MAX) };
  const t = `translate(${view.x},${view.y}) scale(${view.k})`;
  viewportG.setAttribute('transform', t);
  gridPattern.setAttribute('patternTransform', t);
  svg.dataset.zoom = view.k < 0.55 ? 'far' : view.k < 1.3 ? 'mid' : 'near';
  $('#zoomPct').textContent = Math.round(view.k * 100) + '%';
}

function stageSize() {
  const r = svg.getBoundingClientRect();
  return { w: r.width, h: r.height, left: r.left, top: r.top };
}
function visibleArea() {
  const { w, h } = stageSize();
  const open = $('#drawer').classList.contains('open');
  if (!open) return { x: 0, y: 0, w, h };
  if (matchMedia('(max-width: 760px)').matches) return { x: 0, y: 0, w, h: h * 0.32 };
  return { x: 0, y: 0, w: Math.max(200, w - 440), h };
}
const toWorld = (sx, sy) => ({ x: (sx - view.x) / view.k, y: (sy - view.y) / view.k });

function animateTo(target, ms = 560) {
  cancelAnimationFrame(animId);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || ms <= 0) { setView(target); return; }
  const from = { ...view };
  const { w, h } = stageSize();
  const px = w / 2, py = h / 2;
  const c0 = { x: (px - from.x) / from.k, y: (py - from.y) / from.k };
  const c1 = { x: (px - target.x) / target.k, y: (py - target.y) / target.k };
  const l0 = Math.log(from.k), l1 = Math.log(target.k);
  const t0 = performance.now();
  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms), e = ease(t);
    const k = Math.exp(l0 + (l1 - l0) * e);
    const cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e;
    setView({ x: px - cx * k, y: py - cy * k, k });
    if (t < 1) animId = requestAnimationFrame(step);
  };
  animId = requestAnimationFrame(step);
}

function fitBounds(b, { pad = 70, maxK = 1.4, animate = true } = {}) {
  const a = visibleArea();
  pad = Math.min(pad, a.w * 0.06, a.h * 0.08);
  const bw = Math.max(1, b.x2 - b.x1), bh = Math.max(1, b.y2 - b.y1);
  const k = clamp(Math.min((a.w - pad * 2) / bw, (a.h - pad * 2) / bh), K_MIN, maxK);
  const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
  const target = { x: a.x + a.w / 2 - cx * k, y: a.y + a.h / 2 - cy * k, k };
  animate ? animateTo(target) : setView(target);
}
function boundsOf(systems) {
  if (!systems.length) return null;
  const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const s of systems) {
    b.x1 = Math.min(b.x1, s.x - NODE_W / 2); b.x2 = Math.max(b.x2, s.x + NODE_W / 2);
    b.y1 = Math.min(b.y1, s.y - NODE_H / 2); b.y2 = Math.max(b.y2, s.y + NODE_H / 2 + 40);
  }
  return b;
}
function fitAll(animate = true) {
  const b = boundsOf([...state.systems.values()]);
  if (!b) { const { w, h } = stageSize(); setView({ x: w / 2, y: h / 2, k: 1 }); return; }
  fitBounds(b, { animate, maxK: 1.2 });
}
/* How far someone can zoom depends on the map, not a fixed number: zooming out stops a little
   past the point where everything fits, so a small map never shrinks to a speck. */
function zoomLimits() {
  const b = boundsOf([...state.systems.values()]);
  if (!b) return { min: 0.5, max: K_MAX };
  const { w, h } = stageSize();
  const fit = Math.min((w - 40) / (b.x2 - b.x1), (h - 40) / (b.y2 - b.y1));
  return { min: clamp(fit * 0.8, 0.08, 0.9), max: K_MAX };
}

/* Keep at least a corner of the map on screen, so you can't pan off into empty space. */
function clampPan(v) {
  const b = boundsOf([...state.systems.values()]);
  if (!b) return v;
  const { w, h } = stageSize();
  const m = 120;
  const x1 = b.x1 * v.k + v.x, x2 = b.x2 * v.k + v.x, y1 = b.y1 * v.k + v.y, y2 = b.y2 * v.k + v.y;
  let { x, y } = v;
  if (x2 < m) x += m - x2; else if (x1 > w - m) x -= x1 - (w - m);
  if (y2 < m) y += m - y2; else if (y1 > h - m) y -= y1 - (h - m);
  return { x, y, k: v.k };
}

function zoomAround(k, sx, sy) {
  const wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k;
  return clampPan({ x: sx - wx * k, y: sy - wy * k, k });
}
function zoomBy(f, sx, sy) {
  cancelAnimationFrame(animId);
  const { w, h } = stageSize();
  sx ??= w / 2; sy ??= h / 2;
  setView(zoomAround(clamp(view.k * f, zoomLimits().min, K_MAX), sx, sy));
}
function zoomAnimated(f) {
  const { w, h } = stageSize();
  const { min, max } = zoomLimits();
  const base = wheelZoom ? wheelZoom.k : view.k;
  const k = clamp(base * f, min, max);
  const a = visibleArea();
  animateTo(zoomAround(k, a.x + a.w / 2, a.y + a.h / 2), 320);
}

/* Wheel zoom glides: each wheel event nudges a target zoom level, and the view eases toward it
   every frame, anchored on the cursor. Fast scrolling just moves the target further, smoothly,
   and it can't overshoot the limits above. */
let wheelZoom = null;
function cancelWheelZoom() {
  if (wheelZoom) { cancelAnimationFrame(wheelZoom.raf); wheelZoom = null; }
}
function wheelZoomBy(f, sx, sy) {
  cancelAnimationFrame(animId);
  const { min, max } = zoomLimits();
  const base = wheelZoom ? wheelZoom.k : view.k;
  const k = clamp(base * f, Math.min(min, view.k), max);
  if (!wheelZoom) wheelZoom = { raf: 0 };
  Object.assign(wheelZoom, { k, sx, sy });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(zoomAround(k, sx, sy)); return; }
  if (!wheelZoom.raf) wheelZoom.raf = requestAnimationFrame(wheelTick);
}
function wheelTick() {
  const z = wheelZoom;
  if (!z) return;
  const lk = Math.log(view.k), lt = Math.log(z.k);
  const done = Math.abs(lt - lk) < 0.003;
  const k = done ? z.k : Math.exp(lk + (lt - lk) * 0.22);
  cancelWheelZoom.skip = true;
  setView(zoomAround(k, z.sx, z.sy));
  cancelWheelZoom.skip = false;
  if (done) wheelZoom = null;
  else z.raf = requestAnimationFrame(wheelTick);
}

/* =====================================================================================
   Rendering the map
   ===================================================================================== */
const sysOf = (key) => state.systems.get(key);

function sideOf(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) * NODE_H * 1.6 >= Math.abs(dy) * NODE_W) return dx >= 0 ? 'r' : 'l';
  return dy >= 0 ? 'b' : 't';
}
function anchorPoint(s, side, off) {
  switch (side) {
    case 'r': return { x: s.x + NODE_W / 2, y: s.y + off, nx: 1, ny: 0 };
    case 'l': return { x: s.x - NODE_W / 2, y: s.y + off, nx: -1, ny: 0 };
    case 'b': return { x: s.x + off, y: s.y + NODE_H / 2, nx: 0, ny: 1 };
    default:  return { x: s.x + off, y: s.y - NODE_H / 2, nx: 0, ny: -1 };
  }
}

/* Where each connection attaches: connections sharing a side of a system are spread out
   along it, ordered by where their other end sits so the lines don't cross. */
function edgeGeometry() {
  const slots = new Map(), geo = new Map();
  for (const f of state.flows.values()) {
    const a = sysOf(f.from), b = sysOf(f.to);
    if (!a || !b || a === b) continue;
    const sa = sideOf(a, b), sb = sideOf(b, a);
    const g = { f, a, b, sa, sb, oa: 0, ob: 0 };
    geo.set(f.key, g);
    const push = (k, v) => (slots.get(k) || slots.set(k, []).get(k)).push(v);
    push(`${a.key}|${sa}`, { g, end: 'a', other: b, side: sa });
    push(`${b.key}|${sb}`, { g, end: 'b', other: a, side: sb });
  }
  for (const list of slots.values()) {
    const horiz = list[0].side === 'l' || list[0].side === 'r';
    list.sort((p, q) => (horiz ? p.other.y - q.other.y : p.other.x - q.other.x) || p.g.f.key.localeCompare(q.g.f.key));
    const span = horiz ? NODE_H - 22 : NODE_W - 60;
    const n = list.length, stepPx = n > 1 ? Math.min(20, span / (n - 1)) : 0;
    list.forEach((it, i) => { it.g[it.end === 'a' ? 'oa' : 'ob'] = (i - (n - 1) / 2) * stepPx; });
  }
  for (const g of geo.values()) {
    const p0 = anchorPoint(g.a, g.sa, g.oa), p3 = anchorPoint(g.b, g.sb, g.ob);
    const d = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const c = clamp(d * 0.42, 36, 240);
    const p1 = { x: p0.x + p0.nx * c, y: p0.y + p0.ny * c };
    const p2 = { x: p3.x + p3.nx * c, y: p3.y + p3.ny * c };
    g.d = `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
    g.mid = {
      x: .125 * p0.x + .375 * p1.x + .375 * p2.x + .125 * p3.x,
      y: .125 * p0.y + .375 * p1.y + .375 * p2.y + .125 * p3.y,
    };
  }
  return geo;
}

function renderNodes() {
  const counts = new Map();
  for (const f of state.flows.values()) for (const k of [f.from, f.to]) counts.set(k, (counts.get(k) || 0) + 1);
  const nameFont = `600 14px ${FONT}`, metaFont = `11.5px ${FONT}`;
  $('#nodes').innerHTML = [...state.systems.values()].map(s => {
    const c = catOf(s), n = counts.get(s.key) || 0;
    const meta = n ? c.label : `${c.label} · not connected`;
    return `<g class="node" data-node="${esc(s.key)}" transform="translate(${s.x - NODE_W / 2},${s.y - NODE_H / 2})" tabindex="0" role="button" aria-label="${esc(s.name)}, ${esc(c.label)}">
      <title>${esc(s.name)}${s.description ? ' — ' + esc(s.description) : ''}</title>
      <rect class="node-card" width="${NODE_W}" height="${NODE_H}" rx="14"/>
      <rect x="14" y="16" width="36" height="36" rx="10" fill="${c.color}"/>
      <text class="node-ini" x="32" y="38.5">${esc(initials(s.name))}</text>
      <text class="node-name" x="62" y="31">${esc(fitText(s.name, nameFont, NODE_W - 76))}</text>
      <text class="node-meta" x="62" y="49">${esc(fitText(meta, metaFont, NODE_W - 76))}</text>
      <circle class="node-handle" cx="${NODE_W}" cy="${NODE_H / 2}" r="7"><title>Drag to connect ${esc(s.name)} to another system</title></circle>
    </g>`;
  }).join('');
}

function renderEdges() {
  const geo = edgeGeometry();
  const lines = [], labels = [];
  const labelFont = `500 11.5px ${FONT}`;
  const nameFont = `11px ${FONT}`;
  for (const g of geo.values()) {
    const f = g.f, k = f.kind, m = methodOf(f), mk = METHODS[f.method] ? f.method : 'unset';
    const markers = k === 'flow' ? `marker-end="url(#m-arrow-${mk})"`
      : k === 'sync' ? `marker-end="url(#m-arrow-${mk})" marker-start="url(#m-arrow-${mk})"`
      : `marker-end="url(#m-circ-${mk})" marker-start="url(#m-circ-${mk})"`;
    const pulse = k === 'reconcile' || !m.pulse ? '' :
      `<path class="edge-pulse" d="${g.d}" style="animation-duration:${m.pulse}s${k === 'sync' ? ';animation-direction:alternate' : ''}"/>`;
    lines.push(`<g class="edge k-${k} m-${mk}" data-edge="${esc(f.key)}">
      <path class="edge-hit" d="${g.d}"/>
      <path class="edge-line" d="${g.d}" stroke="${m.color}" ${markers}/>
      ${pulse}
    </g>`);

    const st = statusOf(f);
    // The label leads with HOW the data moves; the connection's name shows when zoomed in.
    const text = m.short + (f.frequency ? ' · ' + f.frequency : '');
    const w = Math.ceil(textWidth(text, labelFont)) + 50;
    g.labelW = w;
    const name = f.name ? fitText(f.name, nameFont, 190) : '';
    const steps = f.steps || [];
    const dotGap = 22, dotsW = (steps.length - 1) * dotGap;
    const dots = steps.map((s, i) => `<g class="step-dot" data-step="${i}" transform="translate(${-dotsW / 2 + i * dotGap},0)">
        <circle r="9" fill="${kindOfStep(s).color}"/><text y="3.5">${i + 1}</text>
        <title>${i + 1}. ${esc(kindOfStep(s).label)}: ${esc(s.text)}</title></g>`).join('');
    labels.push(`<g class="edge-label" data-edge="${esc(f.key)}" transform="translate(${g.mid.x},${g.mid.y})">
      <title>${esc(f.name || LINK_KINDS[k].label)} — ${esc(m.label)}${f.frequency ? ', ' + esc(f.frequency) : ''}. ${esc(st.label)}, ${steps.length} step${steps.length === 1 ? '' : 's'}</title>
      <rect class="pill" x="${-w / 2}" y="-12" width="${w}" height="24" rx="12" style="stroke:${m.color}"/>
      <circle cx="${-w / 2 + 12}" cy="0" r="9" fill="${m.color}"/>
      <g transform="translate(${-w / 2 + 6.5},-5.5) scale(.46)" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${m.icon}"/></g>
      <text x="${-w / 2 + 26}" y="4">${esc(text)}</text>
      <circle class="st-${st.cls}" cx="${w / 2 - 11}" cy="0" r="3.5"><title>${esc(st.label)}</title></circle>
      ${name ? `<text class="edge-name" x="0" y="26" text-anchor="middle">${esc(name)}</text>` : ''}
      ${steps.length ? `<g class="edge-steps" transform="translate(0,${name ? 44 : 28})">${dots}</g>` : ''}
    </g>`);
  }
  $('#edges').innerHTML = lines.join('');
  $('#labels').innerHTML = labels.join('');
  edgeGeo = geo;
}

let edgeGeo = null;
function renderCanvas() {
  renderNodes();
  renderEdges();
  renderLegend();
  applyHighlight();
  renderPeerMarks();
  const empty = state.systems.size === 0;
  $('#loading').hidden = true;
  $('#emptyCard').hidden = !empty;
  $('#empty').hidden = !empty;
}

/* ---- Highlighting: selection wins, otherwise hover ---- */
let hover = null;
function relatedTo(target) {
  if (!target) return null;
  const n = new Set(), e = new Set();
  if (target.type === 'system') {
    n.add(target.id);
    for (const f of state.flows.values()) if (f.from === target.id || f.to === target.id) { e.add(f.key); n.add(f.from); n.add(f.to); }
  } else {
    const f = state.flows.get(target.id);
    if (f) { e.add(f.key); n.add(f.from); n.add(f.to); }
  }
  return { n, e };
}
let methodFilter = null;
function relatedToMethod(mk) {
  const n = new Set(), e = new Set();
  for (const f of state.flows.values()) {
    if ((METHODS[f.method] ? f.method : 'unset') !== mk) continue;
    e.add(f.key); n.add(f.from); n.add(f.to);
  }
  return { n, e };
}
function applyHighlight() {
  const focus = relatedTo(sel || hover) || (methodFilter ? relatedToMethod(methodFilter) : null);
  svg.classList.toggle('has-focus', !!focus);
  for (const el of $$('.node', svg)) {
    const id = el.dataset.node;
    el.classList.toggle('hl', !!focus?.n.has(id));
    el.classList.toggle('sel', sel?.type === 'system' && sel.id === id);
  }
  for (const el of $$('[data-edge]', svg)) {
    const id = el.dataset.edge;
    el.classList.toggle('hl', !!focus?.e.has(id));
    el.classList.toggle('sel', sel?.type === 'flow' && sel.id === id);
  }
}

/* =====================================================================================
   Pointer interaction: pan, drag systems, drag-to-connect, pinch
   ===================================================================================== */
let drag = null;
const pointers = new Map();
const ghost = $('#ghost');
const svgPoint = (e) => { const { left, top } = stageSize(); return { x: e.clientX - left, y: e.clientY - top }; };

svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  cancelAnimationFrame(animId);
  pointers.set(e.pointerId, svgPoint(e));
  try { svg.setPointerCapture(e.pointerId); } catch { }

  if (pointers.size === 2) {
    const [p, q] = [...pointers.values()];
    drag = { type: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y), m0: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, v0: { ...view } };
    return;
  }
  if (pointers.size > 2) return;

  const t = e.target;
  const start = svgPoint(e);
  const nodeEl = t.closest?.('.node');
  const edgeEl = t.closest?.('[data-edge]');
  if (t.closest?.('.node-handle') && nodeEl) {
    drag = { type: 'link', from: nodeEl.dataset.node, start, moved: false };
  } else if (nodeEl) {
    const s = sysOf(nodeEl.dataset.node);
    drag = { type: 'node', id: s.key, el: nodeEl, start, orig: { x: s.x, y: s.y }, moved: false };
  } else if (edgeEl) {
    const dot = t.closest('.step-dot');
    drag = { type: 'edge', id: edgeEl.dataset.edge, step: dot ? +dot.dataset.step : null, start, v0: { ...view }, moved: false };
  } else {
    drag = { type: 'pan', start, v0: { ...view }, moved: false };
  }
});

svg.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, svgPoint(e));
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') { const sp = svgPoint(e); presencePointer(toWorld(sp.x, sp.y)); }
  if (!drag) { updateHover(e.target); return; }
  if (drag.type === 'pinch') {
    if (pointers.size < 2) return;
    const [p, q] = [...pointers.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const k = clamp(drag.v0.k * d / drag.d0, Math.min(zoomLimits().min, drag.v0.k), K_MAX);
    const wx = (drag.m0.x - drag.v0.x) / drag.v0.k, wy = (drag.m0.y - drag.v0.y) / drag.v0.k;
    setView({ x: m.x - wx * k, y: m.y - wy * k, k });
    return;
  }
  const p = svgPoint(e);
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    if (drag.type === 'pan' || drag.type === 'edge') svg.classList.add('panning');
    if (drag.type === 'node') drag.el.classList.add('dragging');
  }
  if (drag.type === 'pan' || drag.type === 'edge') {
    setView(clampPan({ x: drag.v0.x + dx, y: drag.v0.y + dy, k: view.k }));
  } else if (drag.type === 'node') {
    const s = sysOf(drag.id);
    s.x = drag.orig.x + dx / view.k; s.y = drag.orig.y + dy / view.k;
    drag.el.setAttribute('transform', `translate(${s.x - NODE_W / 2},${s.y - NODE_H / 2})`);
    renderEdges(); applyHighlight(); renderPeerMarks();
  } else if (drag.type === 'link') {
    const a = sysOf(drag.from), w = toWorld(p.x, p.y);
    const x0 = a.x + NODE_W / 2, y0 = a.y;
    const c = Math.max(40, Math.abs(w.x - x0) * .45);
    ghost.setAttribute('d', `M${x0},${y0} C${x0 + c},${y0} ${w.x - c},${w.y} ${w.x},${w.y}`);
    ghost.hidden = false;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node');
    for (const n of $$('.node.drop')) if (n !== over) n.classList.remove('drop');
    if (over && over.dataset.node !== drag.from) over.classList.add('drop');
    drag.over = over && over.dataset.node !== drag.from ? over.dataset.node : null;
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.type === 'pinch') { if (pointers.size === 0) drag = null; return; }
  const d = drag; drag = null;
  svg.classList.remove('panning');
  if (e.type === 'pointercancel') { ghost.hidden = true; return; }
  if (d.type === 'node') {
    d.el.classList.remove('dragging');
    if (d.moved) {
      const s = sysOf(d.id);
      const x = Math.round(s.x / 10) * 10, y = Math.round(s.y / 10) * 10;
      s.x = d.orig.x; s.y = d.orig.y;
      edit('systems', d.id, (e2) => { e2.x = x; e2.y = y; });
    } else select('system', d.id);
  } else if (d.type === 'edge') {
    if (!d.moved) select('flow', d.id, { step: d.step });
  } else if (d.type === 'pan') {
    if (!d.moved && sel) closeDrawer();
  } else if (d.type === 'link') {
    ghost.hidden = true;
    $$('.node.drop').forEach(n => n.classList.remove('drop'));
    if (d.over) newConnection({ from: d.from, to: d.over });
    else if (!d.moved) newConnection({ from: d.from });
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

function updateHover(t) {
  if (sel) { if (hover) { hover = null; } return; }
  const nodeEl = t.closest?.('.node'), edgeEl = t.closest?.('[data-edge]');
  const h = nodeEl ? { type: 'system', id: nodeEl.dataset.node } : edgeEl ? { type: 'flow', id: edgeEl.dataset.edge } : null;
  if (h?.type === hover?.type && h?.id === hover?.id) return;
  hover = h; applyHighlight();
}
svg.addEventListener('pointerleave', () => { presencePointer(null); if (hover) { hover = null; applyHighlight(); } });

/* Wheel: a mouse wheel (and vertical scrolling generally) zooms toward the cursor; trackpad
   pinch zooms 1:1 with the fingers; a trackpad two-finger swipe that moves sideways, or
   Shift+wheel, pans. Each gesture decides once, so it doesn't flip modes halfway through. */
const gesture = { t: 0, mode: null };
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  cancelAnimationFrame(animId);
  const p = svgPoint(e);
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  const now = performance.now();
  if (now - gesture.t > 220) gesture.mode = null;
  gesture.t = now;

  if (e.ctrlKey) {
    // Trackpad pinch (browsers report it as ctrl+wheel): follow the fingers directly.
    cancelWheelZoom();
    const { min } = zoomLimits();
    const k = clamp(view.k * Math.exp(-clamp(dy, -30, 30) * 0.01), Math.min(min, view.k), K_MAX);
    setView(zoomAround(k, p.x, p.y));
    return;
  }
  if (!gesture.mode || (gesture.mode === 'zoom' && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 1)) {
    gesture.mode = e.shiftKey || (Math.abs(dx) > 1 && Math.abs(dx) >= Math.abs(dy) * 0.5) ? 'pan' : 'zoom';
  }
  if (gesture.mode === 'pan') {
    cancelWheelZoom();
    const [px, py] = e.shiftKey && !dx ? [dy, 0] : [dx, dy];
    setView(clampPan({ x: view.x - px, y: view.y - py, k: view.k }));
    return;
  }
  // One wheel "click" is ~100px on most mice; treat it as a fixed 15% step, and scale smaller
  // smooth-scroll deltas proportionally so high-resolution wheels feel the same.
  const notch = clamp(Math.abs(dy) / 100, 0.02, 1);
  wheelZoomBy(Math.pow(1.15, dy < 0 ? notch : -notch), p.x, p.y);
}, { passive: false });

svg.addEventListener('dblclick', (e) => {
  if (e.target.closest('.node, [data-edge]')) return;
  const p = svgPoint(e);
  newSystem(toWorld(p.x, p.y));
});

svg.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const n = e.target.closest?.('.node');
  if (n) { e.preventDefault(); select('system', n.dataset.node); }
});

/* =====================================================================================
   Selection & the detail drawer
   ===================================================================================== */
let sel = null;
const drawer = $('#drawer');
const drScroll = $('#drScroll');
const drFoot = $('#drFoot');
const drawerHasFocus = () => drawer.contains(document.activeElement) && document.activeElement !== document.body;

function select(type, id, { focus = true, step = null } = {}) {
  if (!mapOf(collOf(type)).has(id)) return;
  flushDebounced();
  const same = sel?.type === type && sel.id === id;
  sel = { type, id };
  hover = null;
  applyHighlight();
  if (!same) { renderDrawer(); drScroll.scrollTop = 0; }
  drawer.classList.add('open');
  stage.classList.add('drawer-open');
  if (focus) focusSelection();
  if (step != null) flashStep(step);
  if (!same) schedulePush(true);
}

function focusSelection() {
  if (!sel) return;
  if (sel.type === 'system') {
    const s = sysOf(sel.id);
    const others = [...state.flows.values()].filter(f => f.from === s.key || f.to === s.key)
      .map(f => sysOf(f.from === s.key ? f.to : f.from)).filter(Boolean);
    fitBounds(boundsOf([s, ...others]), { maxK: 1.25, pad: 60 });
  } else {
    const f = state.flows.get(sel.id);
    const a = sysOf(f.from), b = sysOf(f.to);
    if (a && b) fitBounds(boundsOf([a, b]), { maxK: 1.7, pad: 80 });
  }
}

function closeDrawer() {
  flushDebounced();
  sel = null;
  me.editing = null;
  schedulePush(true);
  drawer.classList.remove('open');
  stage.classList.remove('drawer-open');
  applyHighlight();
}

function flashStep(i) {
  const el = $$('.tl-step', drScroll)[i];
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1400);
}

const iniChip = (s, cls = 'ini') => `<span class="${cls}" style="background:${catOf(s).color}">${esc(initials(s?.name))}</span>`;
const footText = (e) => e.updatedAt ? `Edited${e.updatedBy ? ' by ' + esc(e.updatedBy) : ''} · ${ago(e.updatedAt)}` : '';

function renderDrawer() {
  if (!sel) return;
  const top = drScroll.scrollTop;
  if (sel.type === 'system') renderSystemDrawer(sysOf(sel.id));
  else renderFlowDrawer(state.flows.get(sel.id));
  drScroll.scrollTop = top;
  $$('textarea', drawer).forEach(autosize);
  drawerStale = false;
  renderDrawerPresence();
}

function renderSystemDrawer(s) {
  if (!s) return closeDrawer();
  const flows = [...state.flows.values()];
  const out = flows.filter(f => f.kind === 'flow' && f.from === s.key);
  const inc = flows.filter(f => f.kind === 'flow' && f.to === s.key);
  const rec = flows.filter(f => f.kind !== 'flow' && (f.from === s.key || f.to === s.key));
  const row = (f, otherKey) => {
    const o = sysOf(otherKey), st = statusOf(f), n = f.steps.length;
    return `<button class="conn-row" data-act="open-flow" data-id="${esc(f.key)}">
      ${iniChip(o)}
      <span class="c-main"><span class="c-name">${esc(o?.name || 'Missing system')}</span>
      <span class="c-sub">${esc(f.name || LINK_KINDS[f.kind].label)}${f.frequency ? ' · ' + esc(f.frequency) : ''}</span></span>
      <span class="badge ${st.cls}">${n} step${n === 1 ? '' : 's'}</span></button>`;
  };
  const group = (title, list, otherOf) => list.length ? `<div class="conn-group"><h4>${title}</h4>${list.map(f => row(f, otherOf(f))).join('')}</div>` : '';
  const url = /^https?:\/\//i.test(s.url) ? s.url : '';
  drScroll.innerHTML = `
    <div class="dr-top">
      <span class="kicker"><span class="sw" style="background:${catOf(s).color}"></span>
        <select class="ghost-select" data-field="category" aria-label="Category">
          ${CATEGORIES.map(c => `<option value="${c.id}" ${c.id === s.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select></span>
      <button class="icon-btn" data-act="close" aria-label="Close">✕</button>
    </div>
    <div class="here" id="drHere" hidden></div>
    <input class="dr-title" data-field="name" value="${esc(s.name)}" placeholder="System name" aria-label="System name">
    <label class="fld"><span>What it's used for</span>
      <textarea data-field="description" rows="2" placeholder="What data lives here, and what the team uses it for">${esc(s.description)}</textarea></label>
    <div class="fld-row">
      <label class="fld"><span>Owner</span><input data-field="owner" value="${esc(s.owner)}" placeholder="Who looks after it"></label>
      <label class="fld"><span>Link</span><span class="url-wrap"><input data-field="url" value="${esc(s.url)}" placeholder="https://…">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="Open">↗</a>` : ''}</span></label>
    </div>
    <section class="sec">
      <div class="sec-head"><h3>Connections<span class="count">${out.length + inc.length + rec.length}</span></h3><span class="spacer"></span>
        <button class="btn sm" data-act="connect">+ Connect</button></div>
      ${out.length + inc.length + rec.length === 0 ? `<div class="none">Not connected to anything yet. Use <b>+ Connect</b>, or drag the ● on the right edge of this system onto another one.</div>` : ''}
      ${group('Sends data to', out, f => f.to)}
      ${group('Receives data from', inc, f => f.from)}
      ${group('Reconciles or syncs with', rec, f => f.from === s.key ? f.to : f.from)}
    </section>`;
  drFoot.innerHTML = `<span>${footText(s)}</span><button class="btn sm danger" data-act="delete-system">Delete system</button>`;
}

function renderFlowDrawer(f) {
  if (!f) return closeDrawer();
  const a = sysOf(f.from), b = sysOf(f.to), st = statusOf(f), lk = LINK_KINDS[f.kind];
  const isFlow = f.kind === 'flow';
  const tools = [...new Set(f.steps.map(s => s.tool.trim()).filter(Boolean))];
  const steps = f.steps.map((s, i) => {
    const k = kindOfStep(s);
    return `<li class="tl-step" data-sid="${esc(s.id)}" style="--c:${k.color}">
      <span class="tl-num">${i + 1}</span>
      <div class="tl-card">
        <span class="tl-peer"></span>
        <textarea class="tl-text" data-sfield="text" rows="1" placeholder="Describe this step…" aria-label="Step ${i + 1}">${esc(s.text)}</textarea>
        <div class="tl-meta">
          <select class="kind-select" data-sfield="kind" aria-label="Step type">
            ${STEP_KINDS.map(x => `<option value="${x.id}" ${x.id === k.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
          </select>
          <input class="tool-input" data-sfield="tool" value="${esc(s.tool)}" placeholder="Tool or file (e.g. Excel)" aria-label="Tool or file">
          <span class="tl-ctrl">
            <button data-act="step-up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button data-act="step-down" aria-label="Move down" ${i === f.steps.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="del" data-act="step-del" aria-label="Delete step">✕</button>
          </span>
        </div>
      </div>
    </li>`;
  }).join('');
  const end = (s, cap) => `<li class="tl-end">${iniChip(s)}<span><span class="t-name">${esc(s?.name || 'Missing system')}</span><br><span class="t-cap">${cap}</span></span></li>`;
  drScroll.innerHTML = `
    <div class="dr-top">
      <span class="kicker">
        <select class="ghost-select" data-field="kind" aria-label="Connection type">
          ${Object.entries(LINK_KINDS).map(([id, x]) => `<option value="${id}" ${id === f.kind ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select></span>
      <span class="badge ${st.cls}">${esc(st.label)}</span>
      <button class="icon-btn" data-act="close" aria-label="Close">✕</button>
    </div>
    <div class="here" id="drHere" hidden></div>
    <div class="route">
      <button class="sys-chip" data-act="open-sys" data-id="${esc(f.from)}">${iniChip(a)}${esc(a?.name || '?')}</button>
      <span class="route-arrow">${isFlow ? '→' : '⇄'}</span>
      <button class="sys-chip" data-act="open-sys" data-id="${esc(f.to)}">${iniChip(b)}${esc(b?.name || '?')}</button>
      ${isFlow ? `<button class="icon-btn" data-act="swap" title="Reverse direction" aria-label="Reverse direction" style="width:28px;height:28px">⇆</button>` : ''}
    </div>
    <input class="dr-title" data-field="name" value="${esc(f.name)}" placeholder="Name this ${isFlow ? 'flow' : 'connection'}" aria-label="Name">
    <div class="fld"><span>${isFlow ? 'How does the data move?' : 'How is it done?'}</span>
      <div class="method-pick" role="radiogroup" aria-label="How the data moves">
        ${Object.entries(METHODS).map(([id, m]) => `<button type="button" role="radio" aria-checked="${f.method === id}" class="${f.method === id ? 'on' : ''}" data-act="method" data-m="${id}" title="${esc(m.hint)}" style="--mc:${m.color}">${methodIcon(m, 15)}<span>${esc(m.label)}</span></button>`).join('')}
      </div>
    </div>
    <label class="fld"><span>${isFlow ? 'What moves, and why' : 'What gets compared, and why'}</span>
      <textarea data-field="description" rows="2" placeholder="${isFlow ? 'e.g. Credit card transactions mapped and posted as journal entries' : 'e.g. Bank balance tied out to the GL cash account'}">${esc(f.description)}</textarea></label>
    ${hubFlowCard(f)}
    <div class="fld-row">
      <label class="fld"><span>How often</span><select data-field="frequency">
        ${FREQUENCIES.map(q => `<option value="${esc(q)}" ${q === f.frequency ? 'selected' : ''}>${q || 'Not set'}</option>`).join('')}
      </select></label>
      <label class="fld"><span>Owner</span><input data-field="owner" value="${esc(f.owner)}" placeholder="Who runs it"></label>
    </div>
    <section class="sec">
      <div class="sec-head"><h3>${isFlow ? 'How the data moves' : 'How it’s done'}<span class="count">${f.steps.length} step${f.steps.length === 1 ? '' : 's'}</span></h3></div>
      <ol class="timeline">
        ${end(a, isFlow ? 'Data starts here' : lk.label)}
        ${steps}
        <li class="tl-add"><span class="plus">+</span><button class="add" data-act="step-add">${f.steps.length ? 'Add a step' : 'Add the first step'}</button></li>
        ${end(b, isFlow ? 'Data lands here' : lk.label)}
      </ol>
      ${tools.length ? `<div class="tools"><span class="lbl">Tools & files touched</span>${tools.map(t => `<span class="tool-chip">${esc(t)}</span>`).join('')}</div>` : ''}
    </section>`;
  drFoot.innerHTML = `<span>${footText(f)}</span><button class="btn sm danger" data-act="delete-flow">Delete connection</button>`;
}

function autosize(el) {
  if (el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ---- Drawer editing ---- */
drawer.addEventListener('input', (e) => {
  const el = e.target;
  if (el.tagName === 'SELECT' || !sel) return;
  autosize(el);
  const coll = collOf(sel.type), key = sel.id, v = el.value;
  if (el.dataset.field) {
    const field = el.dataset.field;
    edit(coll, key, (x) => { x[field] = v; }, { debounce: field, render: field === 'name' });
  } else if (el.dataset.sfield) {
    const sid = el.closest('[data-sid]').dataset.sid, field = el.dataset.sfield;
    edit('flows', key, (x) => { const s = x.steps.find(s => s.id === sid); if (s) s[field] = v; }, { debounce: sid + field, render: field === 'text' });
  }
});
drawer.addEventListener('change', (e) => {
  const el = e.target;
  if (el.tagName !== 'SELECT' || !sel) return;
  const coll = collOf(sel.type), key = sel.id, v = el.value;
  if (el.dataset.field) {
    const field = el.dataset.field;
    edit(coll, key, (x) => { x[field] = v; });
  } else if (el.dataset.sfield) {
    const sid = el.closest('[data-sid]').dataset.sid, field = el.dataset.sfield;
    edit('flows', key, (x) => { const s = x.steps.find(s => s.id === sid); if (s) s[field] = v; });
  }
  renderDrawer();
});
drawer.addEventListener('focusin', (e) => {
  const el = e.target;
  const sid = el.closest?.('[data-sid]')?.dataset.sid;
  const field = el.dataset?.sfield || el.dataset?.field;
  if (!field) return;
  me.editing = sid ? { sid, field } : { field };
  schedulePush(true);
});
drawer.addEventListener('focusout', (e) => {
  if (!drawer.contains(e.relatedTarget)) {
    me.editing = null;
    schedulePush(true);
    if (drawerStale) setTimeout(() => { if (!drawerHasFocus()) renderDrawer(); }, 0);
  }
  if (e.target.matches('input, textarea')) flushDebounced();
  if (e.target.dataset.field === 'url' || e.target.dataset.sfield === 'tool') setTimeout(() => { if (!drawerHasFocus()) renderDrawer(); }, 0);
});
drawer.addEventListener('keydown', (e) => {
  // Cmd/Ctrl+Enter in a step adds the next one right after it
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.closest('[data-sid]')) {
    e.preventDefault();
    addStep(e.target.closest('[data-sid]').dataset.sid);
  } else if (e.key === 'Enter' && e.target.matches('input.dr-title')) {
    e.target.blur();
  }
});

drawer.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !sel) return;
  const act = btn.dataset.act, key = sel.id;
  const sid = btn.closest('[data-sid]')?.dataset.sid;
  switch (act) {
    case 'close': closeDrawer(); break;
    case 'open-flow': select('flow', btn.dataset.id); break;
    case 'open-sys': select('system', btn.dataset.id); break;
    case 'connect': newConnection({ from: key }); break;
    case 'swap': edit('flows', key, (x) => { [x.from, x.to] = [x.to, x.from]; }); renderDrawer(); break;
    case 'method': { const m = btn.dataset.m; edit('flows', key, (x) => { x.method = x.method === m ? '' : m; }); renderDrawer(); break; }
    case 'open-process': go(`#/process/${btn.dataset.id}`); break;
    case 'create-process': hubCreateProcessForFlow(key); break;
    case 'step-add': addStep(null); break;
    case 'step-up':
    case 'step-down': {
      const dir = act === 'step-up' ? -1 : 1;
      edit('flows', key, (x) => {
        const i = x.steps.findIndex(s => s.id === sid), j = i + dir;
        if (i < 0 || j < 0 || j >= x.steps.length) return;
        [x.steps[i], x.steps[j]] = [x.steps[j], x.steps[i]];
      });
      renderDrawer();
      $(`[data-sid="${CSS.escape(sid)}"] [data-act="${act}"]`, drawer)?.focus();
      break;
    }
    case 'step-del': {
      const f = state.flows.get(key);
      const idx = f.steps.findIndex(s => s.id === sid);
      const removed = clone(f.steps[idx]);
      edit('flows', key, (x) => { x.steps = x.steps.filter(s => s.id !== sid); });
      renderDrawer();
      toast(`Step ${idx + 1} deleted.`, { action: { label: 'Undo', fn: () => {
        edit('flows', key, (x) => { if (!x.steps.some(s => s.id === removed.id)) x.steps.splice(Math.min(idx, x.steps.length), 0, removed); });
        if (sel?.id === key) renderDrawer();
      } } });
      break;
    }
    case 'delete-system': {
      const s = sysOf(key);
      const linked = [...state.flows.values()].filter(f => f.from === key || f.to === key);
      const ok = await confirmDialog({
        title: `Delete ${s.name}?`,
        body: linked.length
          ? `This also deletes its ${linked.length} connection${linked.length > 1 ? 's' : ''} and every documented step in ${linked.length > 1 ? 'them' : 'it'}. Everyone at BibleProject will lose ${linked.length > 1 ? 'them' : 'it'}.`
          : 'It will be removed from the map for everyone.',
        confirm: 'Delete system',
      });
      if (!ok) return;
      closeDrawer();
      for (const f of linked) await deleteEntity('flows', f.key);
      await deleteEntity('systems', key);
      renderCanvas();
      toast(`${s.name} deleted.`);
      break;
    }
    case 'delete-flow': {
      const f = state.flows.get(key);
      const ok = await confirmDialog({
        title: 'Delete this connection?',
        body: `${sysOf(f.from)?.name} ${f.kind === 'flow' ? '→' : '⇄'} ${sysOf(f.to)?.name}${f.steps.length ? ` and its ${f.steps.length} documented step${f.steps.length > 1 ? 's' : ''}` : ''} will be removed for everyone.`,
        confirm: 'Delete connection',
      });
      if (!ok) return;
      closeDrawer();
      await deleteEntity('flows', key);
      renderCanvas();
      break;
    }
  }
});

function addStep(afterSid) {
  const key = sel.id;
  const step = { id: rid('st'), kind: 'other', text: '', tool: '' };
  const f = state.flows.get(key);
  // Guess a sensible type from position: first step is usually an export, last an import
  if (!f.steps.length) step.kind = 'export';
  edit('flows', key, (x) => {
    if (x.steps.some(s => s.id === step.id)) return;
    const i = afterSid ? x.steps.findIndex(s => s.id === afterSid) : -1;
    if (i >= 0) x.steps.splice(i + 1, 0, { ...step }); else x.steps.push({ ...step });
  });
  renderDrawer();
  const ta = $(`[data-sid="${CSS.escape(step.id)}"] textarea`, drawer);
  ta?.focus();
  ta?.closest('.tl-step')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* =====================================================================================
   Dialogs: add system, add connection, confirm
   ===================================================================================== */
const dlg = $('#dialog');
const dialogOpen = () => dlg.open;

function openDialog(html, onSubmit) {
  return new Promise((resolve) => {
    dlg.innerHTML = html;
    const form = $('form', dlg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.submitter?.value === 'cancel') { dlg.close(); return; }
      const result = onSubmit(new FormData(form), form);
      if (result === false) return;
      dlg.close();
      resolve(result);
    });
    dlg.addEventListener('close', () => resolve(null), { once: true });
    dlg.showModal();
    $('[autofocus]', dlg)?.focus();
  });
}

function confirmDialog({ title, body, confirm }) {
  return openDialog(`<form method="dialog">
    <h2>${esc(title)}</h2><p class="d-sub">${esc(body)}</p>
    <div class="d-actions"><button class="btn" value="cancel" formnovalidate autofocus>Cancel</button>
    <button class="btn danger" value="ok">${esc(confirm)}</button></div></form>`, () => true);
}

async function newSystem(at) {
  const values = await openDialog(`<form method="dialog">
    <h2>Add a system</h2>
    <p class="d-sub">A piece of software, a spreadsheet, or anywhere finance data lives.</p>
    <label class="fld"><span>Name</span><input name="name" required autofocus maxlength="80" placeholder="e.g. Chase, Expensify, Payroll workbook"></label>
    <label class="fld"><span>Category</span><select name="category">
      ${CATEGORIES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
    <label class="fld"><span>What it's used for <span style="font-weight:400">(optional)</span></span><textarea name="description" rows="2"></textarea></label>
    <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add system</button></div>
  </form>`, (fd) => ({ name: String(fd.get('name')).trim(), category: fd.get('category'), description: String(fd.get('description')).trim() }));
  if (!values?.name) return;
  const pos = at || openSpot();
  const s = { key: rid('sys'), ...values, owner: '', url: '', x: Math.round(pos.x / 10) * 10, y: Math.round(pos.y / 10) * 10 };
  createEntity('systems', s);
  renderCanvas();
  select('system', s.key);
}

/* Somewhere near the middle of the view that doesn't sit on top of another system. */
function openSpot() {
  const a = visibleArea();
  const c = toWorld(a.x + a.w / 2, a.y + a.h / 2);
  const hits = (p) => [...state.systems.values()].some(s => Math.abs(s.x - p.x) < NODE_W + 20 && Math.abs(s.y - p.y) < NODE_H + 30);
  for (let r = 0; r < 12; r++) {
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const p = { x: c.x + dx * r * (NODE_W + 40), y: c.y + dy * r * (NODE_H + 50) };
      if (!hits(p)) return p;
    }
  }
  return c;
}

async function newConnection({ from = '', to = '' } = {}) {
  const systems = [...state.systems.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (systems.length < 2) { toast('Add at least two systems first.'); return; }
  const opts = (v) => `<option value="">Choose a system…</option>` + systems.map(s => `<option value="${esc(s.key)}" ${s.key === v ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const kindIcon = {
    flow: `<svg width="46" height="14"><path d="M2 7h38" stroke="var(--edge-flow)" stroke-width="2"/><path d="M36 2l8 5-8 5z" fill="var(--edge-flow)"/></svg>`,
    reconcile: `<svg width="46" height="14"><path d="M6 7h34" stroke="var(--edge-rec)" stroke-width="2" stroke-dasharray="5 4"/><circle cx="5" cy="7" r="3.5" fill="var(--panel)" stroke="var(--edge-rec)" stroke-width="2"/><circle cx="41" cy="7" r="3.5" fill="var(--panel)" stroke="var(--edge-rec)" stroke-width="2"/></svg>`,
    sync: `<svg width="46" height="14"><path d="M8 7h30" stroke="var(--edge-sync)" stroke-width="2"/><path d="M36 2l8 5-8 5z" fill="var(--edge-sync)"/><path d="M10 2l-8 5 8 5z" fill="var(--edge-sync)"/></svg>`,
  };
  const values = await openDialog(`<form method="dialog">
    <h2>Add a connection</h2>
    <p class="d-sub">How two systems relate. You'll document the steps next.</p>
    <div class="fld"><span>Type</span><div class="kind-pick">
      ${Object.entries(LINK_KINDS).map(([id, k], i) => `<label><input type="radio" name="kind" value="${id}" ${i === 0 ? 'checked' : ''}>${kindIcon[id]}${esc(k.label)}</label>`).join('')}
    </div></div>
    <div class="fld-row">
      <label class="fld"><span id="fromLbl">From</span><select name="from" required ${from ? '' : 'autofocus'}>${opts(from)}</select></label>
      <label class="fld"><span id="toLbl">To</span><select name="to" required ${from && !to ? 'autofocus' : ''}>${opts(to)}</select></label>
    </div>
    <div class="fld"><span>How does the data move?</span><div class="kind-pick method-radio">
      ${Object.entries(METHODS).map(([id, m]) => `<label style="--mc:${m.color}"><input type="radio" name="method" value="${id}">${methodIcon(m, 16, m.color)}${esc(m.label)}</label>`).join('')}
    </div></div>
    <label class="fld"><span>Name <span style="font-weight:400">(optional)</span></span><input name="name" maxlength="80" placeholder="e.g. Card transactions, Bank rec" ${from && to ? 'autofocus' : ''}></label>
    <div class="d-err" id="dErr"></div>
    <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add connection</button></div>
  </form>`, (fd, form) => {
    const v = { kind: fd.get('kind'), method: fd.get('method') || '', from: fd.get('from'), to: fd.get('to'), name: String(fd.get('name')).trim() };
    if (v.from === v.to) { $('#dErr', form).textContent = 'Pick two different systems.'; return false; }
    return v;
  });
  if (!values) return;
  const f = { key: rid('flow'), ...values, description: '', frequency: '', owner: '', steps: [] };
  createEntity('flows', f);
  renderCanvas();
  select('flow', f.key);
}
dlg.addEventListener('change', (e) => {
  if (e.target.name !== 'kind') return;
  const flow = e.target.value === 'flow';
  $('#fromLbl', dlg).textContent = flow ? 'From' : 'System';
  $('#toLbl', dlg).textContent = flow ? 'To' : 'With';
});

/* =====================================================================================
   Search
   ===================================================================================== */
const searchInput = $('#search'), resultsEl = $('#results');
let results = [], activeResult = 0;
function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { resultsEl.hidden = true; results = []; return; }
  const hit = (...xs) => xs.some(x => String(x || '').toLowerCase().includes(q));
  results = [];
  for (const s of state.systems.values()) if (hit(s.name, s.description, s.owner, catOf(s).label)) results.push({ type: 'system', id: s.key, title: s.name, sub: catOf(s).label, s });
  for (const f of state.flows.values()) {
    const a = sysOf(f.from), b = sysOf(f.to);
    const stepIdx = f.steps.findIndex(s => hit(s.text, s.tool));
    if (hit(f.name, f.description, f.owner, a?.name, b?.name) || stepIdx >= 0) {
      results.push({ type: 'flow', id: f.key, step: hit(f.name, f.description, f.owner, a?.name, b?.name) ? null : stepIdx,
        title: `${a?.name} ${f.kind === 'flow' ? '→' : '⇄'} ${b?.name}`, sub: stepIdx >= 0 && !hit(f.name) ? `Step ${stepIdx + 1}` : (f.name || LINK_KINDS[f.kind].label), s: a });
    }
  }
  results = results.slice(0, 12);
  activeResult = 0;
  resultsEl.innerHTML = results.length ? results.map((r, i) => `<button data-i="${i}" class="${i === 0 ? 'active' : ''}">${iniChip(r.s, 'ini')}<span>${esc(r.title)}</span><span class="r-sub">${esc(r.sub)}</span></button>`).join('')
    : `<div class="r-empty">Nothing matches “${esc(searchInput.value)}”.</div>`;
  resultsEl.hidden = false;
}
function pickResult(i) {
  const r = results[i]; if (!r) return;
  resultsEl.hidden = true; searchInput.value = ''; searchInput.blur();
  select(r.type, r.id, { step: r.step });
}
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('focus', runSearch);
searchInput.addEventListener('blur', () => setTimeout(() => { resultsEl.hidden = true; }, 150));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeResult = clamp(activeResult + (e.key === 'ArrowDown' ? 1 : -1), 0, results.length - 1);
    $$('button', resultsEl).forEach((b, i) => b.classList.toggle('active', i === activeResult));
  } else if (e.key === 'Enter') { e.preventDefault(); pickResult(activeResult); }
  else if (e.key === 'Escape') { searchInput.value = ''; searchInput.blur(); }
});
resultsEl.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); pickResult(+b.dataset.i); } });

/* =====================================================================================
   Menu actions: tidy layout, export
   ===================================================================================== */
async function tidyLayout() {
  const ok = await confirmDialog({ title: 'Tidy the layout?', body: 'Systems will be arranged left to right in the order data flows through them. This moves them for everyone.', confirm: 'Tidy layout' });
  if (!ok) return;
  const nodes = [...state.systems.values()];
  const layer = new Map(nodes.map(s => [s.key, 0]));
  const directed = [...state.flows.values()].filter(f => f.kind === 'flow' && sysOf(f.from) && sysOf(f.to));
  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    for (const f of directed) {
      const want = layer.get(f.from) + 1;
      if (want > layer.get(f.to) && want < nodes.length) { layer.set(f.to, want); changed = true; }
    }
    if (!changed) break;
  }
  // Pull sources right up next to what they feed, so nothing floats at the far left alone
  for (const s of nodes) {
    const outs = directed.filter(f => f.from === s.key).map(f => layer.get(f.to));
    if (outs.length && !directed.some(f => f.to === s.key)) layer.set(s.key, Math.max(0, Math.min(...outs) - 1));
  }
  // Systems joined only by reconcile/sync links sit beside their partner
  for (const f of state.flows.values()) {
    if (f.kind === 'flow') continue;
    const [a, b] = [f.from, f.to];
    const lone = (k) => !directed.some(d => d.from === k || d.to === k);
    if (lone(b) && !lone(a)) layer.set(b, layer.get(a));
    else if (lone(a) && !lone(b)) layer.set(a, layer.get(b));
  }
  const cols = new Map();
  for (const s of nodes) (cols.get(layer.get(s.key)) || cols.set(layer.get(s.key), []).get(layer.get(s.key))).push(s);
  const target = new Map();
  for (const l of [...cols.keys()].sort((a, b) => a - b)) {
    const list = cols.get(l);
    const bary = (s) => {
      const ps = directed.filter(f => f.to === s.key).map(f => target.get(f.from)?.y).filter(v => v != null);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : s.y;
    };
    list.sort((a, b) => bary(a) - bary(b));
    list.forEach((s, i) => target.set(s.key, { x: l * 420, y: (i - (list.length - 1) / 2) * 170 }));
  }
  for (const s of nodes) {
    const t = target.get(s.key);
    if (t.x !== s.x || t.y !== s.y) edit('systems', s.key, (x) => { x.x = t.x; x.y = t.y; }, { render: false });
  }
  renderCanvas();
  fitAll();
}

function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    systems: [...state.systems.values()],
    connections: [...state.flows.values()].map(f => ({ ...f, fromName: sysOf(f.from)?.name, toName: sysOf(f.to)?.name })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `finance-data-flows-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const menu = $('#menu');
$('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]'); if (!b) return;
  menu.hidden = true;
  ({ fit: () => fitAll(), tidy: tidyLayout, export: exportJSON, refresh: () => reload().then(() => toast('Up to date.')), live: liveStatus })[b.dataset.menu]();
});

/* =====================================================================================
   Wiring
   ===================================================================================== */
$('#addSystemBtn').addEventListener('click', () => newSystem());
$('#emptyAdd').addEventListener('click', () => newSystem());
$('#addFlowBtn').addEventListener('click', () => newConnection(sel?.type === 'system' ? { from: sel.id } : {}));
$('#zoomIn').addEventListener('click', () => zoomAnimated(1.25));
$('#zoomOut').addEventListener('click', () => zoomAnimated(1 / 1.25));
$('#zoomFit').addEventListener('click', () => fitAll());

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape' && !dialogOpen()) {
    if (typing) { e.target.blur(); return; }
    if (sel) closeDrawer();
    return;
  }
  if (typing || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.dataset.route === 'hub') return;   // map shortcuts only on the map
  if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
  else if (e.key === 'f' || e.key === 'F') fitAll();
  else if (e.key === '+' || e.key === '=') zoomAnimated(1.25);
  else if (e.key === '-' || e.key === '_') zoomAnimated(1 / 1.25);
});

/* Arrowheads and end-circles in each method's colour. */
{
  const defs = $('#canvas defs');
  const all = [...Object.entries(METHODS), ['unset', METHOD_UNSET]];
  defs.insertAdjacentHTML('beforeend', all.map(([k, m]) => `
    <marker id="m-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${m.color}"/></marker>
    <marker id="m-circ-${k}" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse"><circle cx="6" cy="6" r="4" class="mk-circ" stroke="${m.color}"/></marker>`).join(''));
}

function renderLegend() {
  const counts = {};
  for (const f of state.flows.values()) { const k = METHODS[f.method] ? f.method : 'unset'; counts[k] = (counts[k] || 0) + 1; }
  // The always-visible filter bar: how data moves, at a glance
  const bar = [...Object.entries(METHODS), ['unset', METHOD_UNSET]].filter(([k]) => k !== 'unset' || counts.unset);
  $('#methodBar').innerHTML = `<span class="mb-lbl">How data moves</span>` + bar.map(([k, m]) => `
    <button type="button" class="mb-chip${methodFilter === k ? ' on' : ''}${counts[k] ? '' : ' zero'}" data-method="${k}" aria-pressed="${methodFilter === k}" title="${esc(m.hint)}${methodFilter === k ? ' · click again to show everything' : ' · click to show only these'}" style="--mc:${m.color}">
      <span class="lm-icon" style="background:${m.color}">${methodIcon(m, 11, '#fff')}</span>${esc(k === 'unset' ? 'Not set' : m.label)}<span class="lm-count">${counts[k] || 0}</span></button>`).join('');
  for (const k in counts) delete counts[k];
  for (const f of state.flows.values()) { const k = METHODS[f.method] ? f.method : 'unset'; counts[k] = (counts[k] || 0) + 1; }
  const methods = [...Object.entries(METHODS), ['unset', METHOD_UNSET]].filter(([k]) => k !== 'unset' || counts.unset);
  $('#legendBody').innerHTML = `
  <div><h4>How data moves <span style="text-transform:none;letter-spacing:0;font-weight:400">· click to filter</span></h4><ul>${methods.map(([k, m]) => `
    <li><button type="button" class="legend-method${methodFilter === k ? ' on' : ''}" data-method="${k}" aria-pressed="${methodFilter === k}" title="${esc(m.hint)}">
      <span class="lm-icon" style="background:${m.color}">${methodIcon(m, 11, '#fff')}</span>${esc(m.label)}<span class="lm-count">${counts[k] || 0}</span></button></li>`).join('')}</ul></div>
  <div><h4>Connections</h4><ul>
    <li><svg width="28" height="10"><path d="M1 5h20" stroke="var(--ink-faint)" stroke-width="2"/><path d="M19 1l7 4-7 4z" fill="var(--ink-faint)"/></svg>One way</li>
    <li><svg width="28" height="10"><path d="M6 5h16" stroke="var(--ink-faint)" stroke-width="2"/><path d="M20 1l7 4-7 4z" fill="var(--ink-faint)"/><path d="M8 1l-7 4 7 4z" fill="var(--ink-faint)"/></svg>Two-way sync</li>
    <li><svg width="28" height="10"><path d="M5 5h18" stroke="var(--ink-faint)" stroke-width="2" stroke-dasharray="4 3"/><circle cx="4" cy="5" r="3" fill="var(--panel)" stroke="var(--ink-faint)" stroke-width="1.6"/><circle cx="24" cy="5" r="3" fill="var(--panel)" stroke="var(--ink-faint)" stroke-width="1.6"/></svg>Reconciles with</li>
  </ul></div>
  <div><h4>Systems</h4><ul>${CATEGORIES.map(c => `<li><span class="sw" style="background:${c.color}"></span>${esc(c.label)}</li>`).join('')}</ul></div>
  <div><h4>Steps <span style="text-transform:none;letter-spacing:0;font-weight:400">(zoom in to see)</span></h4><ul>${STEP_KINDS.map(k => `<li><span class="sw" style="background:${k.color};border-radius:50%"></span>${esc(k.label)}</li>`).join('')}</ul></div>`;
}
const onMethodClick = (e) => {
  const b = e.target.closest('[data-method]');
  if (!b) return;
  methodFilter = methodFilter === b.dataset.method ? null : b.dataset.method;
  if (methodFilter && sel) closeDrawer();
  renderLegend(); applyHighlight();
};
$('#legendBody').addEventListener('click', onMethodClick);
$('#methodBar').addEventListener('click', onMethodClick);
if (matchMedia('(max-width: 760px)').matches) $('#legend').open = false;
else $('#legend').open = ls.get('finflow:legend') === 'open';
$('#legend').addEventListener('toggle', () => ls.set('finflow:legend', $('#legend').open ? 'open' : 'closed'));

if (!ls.get('finflow:hint-dismissed')) $('#hint').hidden = false;
$('#hintClose').addEventListener('click', () => { $('#hint').hidden = true; ls.set('finflow:hint-dismissed', '1'); });

addEventListener('resize', () => { if (sel) focusSelection(); });
setInterval(() => { if (sel && !drawerHasFocus()) { const t = $('span', drFoot); const e = mapOf(collOf(sel.type)).get(sel.id); if (t && e) t.innerHTML = footText(e); } }, 30000);

/* =====================================================================================
   Live presence: who's here, where their cursor is, what they have open
   -------------------------------------------------------------------------------------
   The platform has no live channel, only the records store, so presence is built on it:
   each open tab keeps one record in the `presence` collection and rewrites it about once a
   second while its cursor moves (every 15s otherwise), and every tab lists the collection
   every second. Cursor movement is sent as a short trail of samples taken every 100ms, which
   the other screens replay, so a cursor glides along the path it actually took, about a
   second behind, instead of hopping between snapshots.
   Each record also carries `rev`, bumped whenever that person saves. Seeing a teammate's
   rev change is what triggers pulling their edits in, so edits show up within a second or
   two without everyone re-reading the whole map constantly.
   ===================================================================================== */
const PEER_COLORS = ['#E5484D', '#3E63DD', '#1F9D55', '#F76B15', '#8E4EC6', '#D6409F', '#0891B2', '#B45309'];
const hashColor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return PEER_COLORS[Math.abs(h) % PEER_COLORS.length]; };
const safeColor = (c, fallback) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : fallback;
const TAB = rid('tab');
const SAMPLE_MS = 100, FLUSH_MS = 800, HEARTBEAT_MS = 15000, GONE_MS = 40000, TRAIL = 16;

const me = { seq: 0, ci: 0, samples: [], cursor: null, lastSampled: null, rev: 0, editing: null, writing: false, dirty: false, lastWrite: 0 };
const peers = new Map();
const diag = { pollOk: 0, pollErr: '', writeOk: 0, writeErr: '', records: 0 };

/* What the live connection can see right now, for when cursors don't show up. */
function liveStatus() {
  const all = activePeers(), others = activePeople(), mine = all.filter(p => p.self);
  const t = (ts) => ts ? ago(ts) : 'never';
  const rows = [
    ['Live updates', store.mode !== 'remote' ? 'Off: this is a local preview with no platform' : presenceOn ? 'On' : 'Off: storage is full'],
    ['Signed in as', user.email || 'unknown (no email from sign-in)'],
    ['Last check for others', diag.pollErr ? `failed ${t(diag.pollErrAt)}: ${diag.pollErr}` : t(diag.pollOk)],
    ['Last update sent', diag.writeErr ? `failed ${t(diag.writeErrAt)}: ${diag.writeErr}` : t(diag.writeOk)],
    ['Open windows found', `${diag.records} (including this one)`],
    ['Other people here now', others.length ? others.map(p => `${p.name} — ${whereIs(p)}`).join('; ') : 'none'],
    ['Your other windows', mine.length ? `${mine.length} (their cursors show as “You (other window)”)` : 'none'],
  ];
  openDialog(`<form method="dialog"><h2>Live connection</h2>
    <p class="d-sub">Cursors show when someone else has the Data flows map open and moves their mouse over it. Allow a second or two.</p>
    <dl class="live-status">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="d-actions"><button class="btn primary" value="ok">Close</button></div></form>`, () => true);
}
let presenceOn = false, pushTimer = 0;

function presenceRecord() {
  return { data: {
    name: user.name || 'Someone', first: user.first || '', email: user.email || '', avatar: user.avatar || '',
    color: user.color, seq: ++me.seq, ts: Date.now(),
    cursor: !!me.cursor && !document.hidden, ci: me.ci, samples: me.samples.slice(-TRAIL),
    sel: sel ? { type: sel.type, id: sel.id } : null, editing: me.editing, rev: me.rev, away: document.hidden,
    route: location.hash || '#/map',
  } };
}

async function pushPresence() {
  if (!presenceOn) return;
  if (me.writing) { me.dirty = true; return; }
  me.writing = true; me.dirty = false; me.lastWrite = Date.now();
  try {
    await store.rec.put('presence', TAB, presenceRecord());
    diag.writeOk = Date.now(); diag.writeErr = '';
  } catch (err) {
    diag.writeErr = err?.message || String(err); diag.writeErrAt = Date.now();
    if (err?.full) presenceOn = false;
    else if (err?.conflict) { try { await store.rec.get('presence', TAB); await store.rec.put('presence', TAB, presenceRecord()); } catch { } }
  } finally {
    me.writing = false;
    if (me.dirty) schedulePush(false);
  }
}
/* urgent: selection/editing changes go out right away. Cursor trails are batched. */
function schedulePush(urgent) {
  if (!presenceOn) return;
  if (!urgent && pushTimer) return;
  clearTimeout(pushTimer);
  const wait = urgent ? 60 : Math.max(0, me.lastWrite + FLUSH_MS - Date.now());
  pushTimer = setTimeout(() => { pushTimer = 0; pushPresence(); }, wait);
}
function presenceRev() { me.rev = Date.now(); schedulePush(true); }

function presencePointer(w) {
  const was = !!me.cursor;
  me.cursor = w ? { x: Math.round(w.x), y: Math.round(w.y) } : null;
  if (was && !w && activePeers().length) schedulePush(false);
}
setInterval(() => {
  if (!presenceOn || document.hidden) return;
  const c = me.cursor;
  if (!c || (me.lastSampled && c.x === me.lastSampled.x && c.y === me.lastSampled.y)) return;
  me.samples.push([c.x, c.y]);
  if (me.samples.length > TRAIL) me.samples.shift();
  me.ci++;
  me.lastSampled = c;
  if (activePeers().length) schedulePush(false);   // nobody watching → don't spend writes on it
}, SAMPLE_MS);
setInterval(() => { if (presenceOn && !document.hidden) pushPresence(); }, HEARTBEAT_MS);

/* ---- Reading everyone else ---- */
const activePeers = () => [...peers.values()].filter(p => p.lastChange && Date.now() - p.lastChange < GONE_MS);
/* One entry per OTHER person, even if they have the map open in two tabs (most recently active
   wins). Your own other windows aren't people, but their cursors still show (see activePeers). */
function activePeople() {
  const by = new Map();
  for (const p of activePeers()) {
    if (p.self) continue;
    const k = p.email || p.key;
    const cur = by.get(k);
    if (!cur || (cur.away && !p.away) || (cur.away === p.away && p.lastChange > cur.lastChange)) by.set(k, p);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ingestPresence(list) {
  const now = Date.now(), seen = new Set();
  let theyEdited = false;
  for (const r of list) {
    if (r.key === TAB) continue;
    const d = r.data || {};
    // Tidy up tabs that closed without saying goodbye. Only ever ephemeral presence records.
    if (d.ts && now - d.ts > 2 * 3600e3) { store.rec.remove('presence', r.key).catch(() => { }); continue; }
    const self = !!user.email && d.email === user.email;   // you, in another window
    seen.add(r.key);
    let p = peers.get(r.key);
    if (!p) {
      p = { key: r.key, seq: d.seq, ci: d.ci || 0, rev: d.rev || 0, queue: [], pos: null, seg: null,
        lastChange: Math.abs(now - (d.ts || 0)) < 45000 ? now : 0 };
      peers.set(r.key, p);
    } else if (d.seq !== p.seq) {
      p.seq = d.seq; p.lastChange = now;
    }
    if ((d.rev || 0) > p.rev) { p.rev = d.rev; theyEdited = true; }
    const samples = Array.isArray(d.samples) ? d.samples.filter(s => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1])) : [];
    if (d.cursor && samples.length) {
      const fresh = Math.min((d.ci || 0) - p.ci, samples.length);
      if (!p.pos || !p.onCanvas) { const [x, y] = samples[samples.length - 1]; p.pos = { x, y }; p.queue = []; p.seg = null; }
      else if (fresh > 0) p.queue.push(...samples.slice(-fresh).map(([x, y]) => ({ x, y })));
      p.onCanvas = true;
    } else p.onCanvas = false;
    p.ci = d.ci || 0;
    const name = String(d.name || 'Someone').slice(0, 80);
    Object.assign(p, {
      name, first: String(d.first || name.split(' ')[0]).slice(0, 40),
      email: typeof d.email === 'string' ? d.email : '',
      avatar: /^https?:\/\//i.test(d.avatar || '') ? d.avatar : '',
      color: safeColor(d.color, hashColor(d.email || r.key)),
      sel: d.sel && typeof d.sel.id === 'string' && (d.sel.type === 'system' || d.sel.type === 'flow') ? d.sel : null,
      editing: d.editing && typeof d.editing === 'object' ? d.editing : null,
      route: typeof d.route === 'string' ? d.route.slice(0, 200) : '',
      away: !!d.away, self,
    });
  }
  for (const k of [...peers.keys()]) if (!seen.has(k)) peers.delete(k);
  if (theyEdited) needsReload = true;
  renderPresence();
}

async function pollPresence() {
  if (!presenceOn) return;
  if (!document.hidden) {
    try {
      const list = await store.listAll('presence');
      diag.pollOk = Date.now(); diag.pollErr = ''; diag.records = list.length;
      ingestPresence(list);
    } catch (err) { diag.pollErr = err?.message || String(err); diag.pollErrAt = Date.now(); /* try again next tick */ }
    if (needsReload || Date.now() - lastRefresh > 30000) reload();
  }
  setTimeout(pollPresence, activePeers().length ? 1000 : 3000);
}

function startPresence() {
  if (store.mode !== 'remote' || presenceOn) return;
  presenceOn = true;
  pushPresence();
  pollPresence();
}
document.addEventListener('visibilitychange', () => {
  if (!presenceOn) return;
  if (document.hidden) { me.cursor = null; pushPresence(); }
  else { schedulePush(true); if (Date.now() - lastRefresh > 5000) reload(); }
});
addEventListener('pagehide', () => { if (presenceOn) store.rec.remove('presence', TAB).catch(() => { }); });

/* ---- Showing them ---- */
function whereIs(p) {
  if (p.away) return 'away from the map';
  if (p.route && !p.route.startsWith('#/map') && hub) return hub.describeRoute(p.route);
  if (!p.sel) return 'looking around the map';
  if (p.sel.type === 'system') return `viewing ${sysOf(p.sel.id)?.name || 'a system'}`;
  const f = state.flows.get(p.sel.id);
  return f ? `viewing ${sysOf(f.from)?.name} ${f.kind === 'flow' ? '→' : '⇄'} ${sysOf(f.to)?.name}` : 'viewing a connection';
}

function renderPresence() {
  const people = activePeople();
  const box = $('#peers');
  box.innerHTML = people.slice(0, 5).map(p => `<button class="peer${p.away ? ' away' : ''}" data-peer="${esc(p.key)}" style="--pc:${p.color}" title="${esc(p.name)} — ${esc(whereIs(p))}" aria-label="${esc(p.name)}, ${esc(whereIs(p))}">
      <span>${esc(initials(p.name))}</span>${p.avatar ? `<img src="${esc(p.avatar)}" alt="" onerror="this.remove()">` : ''}</button>`).join('')
    + (people.length > 5 ? `<span class="peer more" title="${esc(people.slice(5).map(p => p.name).join(', '))}">+${people.length - 5}</span>` : '');
  box.hidden = !people.length;
  renderPeerMarks();
  renderDrawerPresence();
  renderSaveState();
  startCursorLoop();
}

$('#peers').addEventListener('click', (e) => {
  const p = peers.get(e.target.closest('[data-peer]')?.dataset.peer);
  if (!p) return;
  if (p.route && !p.route.startsWith('#/map') && hub?.canOpenRoute(p.route)) go(p.route);
  else if (p.sel && mapOf(collOf(p.sel.type)).has(p.sel.id)) { go('#/map'); select(p.sel.type, p.sel.id); }
  else if (p.pos) {
    const a = visibleArea();
    animateTo({ x: a.x + a.w / 2 - p.pos.x * view.k, y: a.y + a.h / 2 - p.pos.y * view.k, k: view.k });
  } else toast(`${p.first || p.name} is ${whereIs(p)}.`);
});

/* Coloured rings and name tags on whatever each person has open. */
function renderPeerMarks() {
  const g = $('#peerMarks');
  if (!g) return;
  const groups = new Map();
  for (const p of activePeople()) {
    if (!p.sel || p.away || (p.route && !p.route.startsWith('#/map'))) continue;
    const k = `${p.sel.type}/${p.sel.id}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(p);
  }
  let out = '';
  for (const ps of groups.values()) {
    const { type, id } = ps[0].sel;
    let box;
    if (type === 'system') {
      const s = sysOf(id); if (!s) continue;
      box = { x: s.x - NODE_W / 2, y: s.y - NODE_H / 2, w: NODE_W, h: NODE_H, r: 14 };
    } else {
      const eg = edgeGeo?.get(id); if (!eg) continue;
      box = { x: eg.mid.x - eg.labelW / 2, y: eg.mid.y - 12, w: eg.labelW, h: 24, r: 12 };
    }
    ps.forEach((p, i) => {
      const pad = 5 + i * 4;
      out += `<rect class="peer-ring" x="${box.x - pad}" y="${box.y - pad}" width="${box.w + pad * 2}" height="${box.h + pad * 2}" rx="${box.r + pad}" stroke="${p.color}"/>`;
    });
    let tx = box.x - 5;
    const ty = box.y - 9 - (ps.length - 1) * 4 - 18;
    for (const p of ps) {
      const name = p.first || p.name;
      const w = Math.ceil(textWidth(name, `600 11px ${FONT}`)) + 14;
      out += `<g class="peer-tag" transform="translate(${tx},${ty})"><rect width="${w}" height="18" rx="5" fill="${p.color}"/><text x="7" y="12.5">${esc(name)}</text></g>`;
      tx += w + 4;
    }
  }
  g.innerHTML = out;
}

/* "Jordan is here too" in the panel, and a highlight on the step they're typing in. */
function renderDrawerPresence() {
  const here = $('#drHere');
  if (!here || !sel) return;
  const ps = activePeople().filter(p => !p.away && p.sel?.type === sel.type && p.sel?.id === sel.id);
  const f = sel.type === 'flow' ? state.flows.get(sel.id) : null;
  here.innerHTML = ps.map(p => {
    let what = ' is here too';
    if (p.editing?.sid && f) { const i = f.steps.findIndex(s => s.id === p.editing.sid); if (i >= 0) what = ` is editing step ${i + 1}`; }
    else if (p.editing) what = ' is editing';
    return `<span class="here-chip" style="--pc:${p.color}"><i></i>${esc(p.first || p.name)}${what}</span>`;
  }).join('');
  here.hidden = !ps.length;
  for (const li of $$('.tl-step', drScroll)) {
    const ed = ps.find(p => p.editing?.sid === li.dataset.sid);
    li.classList.toggle('peer-editing', !!ed);
    if (ed) li.style.setProperty('--peer', ed.color); else li.style.removeProperty('--peer');
    const tag = $('.tl-peer', li);
    if (tag) tag.textContent = ed ? `${ed.first || ed.name} is editing this step` : '';
  }
}

/* ---- Cursors: replay each person's trail, one sample per 100ms ---- */
const cursorsEl = $('#cursors');
const cursorEls = new Map();
let cursorRaf = 0;
function startCursorLoop() { if (!cursorRaf && activePeers().length) cursorRaf = requestAnimationFrame(cursorFrame); }
function cursorFrame(now) {
  cursorRaf = 0;
  const live = activePeers();
  const liveKeys = new Set(live.map(p => p.key));
  for (const [k, el] of cursorEls) if (!liveKeys.has(k)) { el.remove(); cursorEls.delete(k); }
  for (const p of live) {
    let el = cursorEls.get(p.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor hide';
      el.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1.5 1.5v16.2l4.4-4.1 2.9 6.6 3-1.3-2.9-6.5h6z" fill="currentColor" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span></span>`;
      cursorsEl.append(el);
      cursorEls.set(p.key, el);
    }
    el.style.setProperty('--pc', p.color);
    el.style.color = p.color;
    const label = p.self ? 'You (other window)' : (p.first || p.name);
    if (el.lastChild.textContent !== label) el.lastChild.textContent = label;
    advanceCursor(p, now);
    const show = p.onCanvas && !p.away && p.pos;
    el.classList.toggle('hide', !show);
    if (p.pos) el.style.transform = `translate(${p.pos.x * view.k + view.x - 1.5}px, ${p.pos.y * view.k + view.y - 1.5}px)`;
  }
  if (live.length) cursorRaf = requestAnimationFrame(cursorFrame);
}
function advanceCursor(p, now) {
  if (!p.pos) return;
  if (!p.seg) {
    if (!p.queue.length) return;
    p.seg = { from: { ...p.pos }, to: p.queue.shift(), t0: now };
  }
  // Catch up a little faster if we've fallen behind, so the lag never grows.
  const dur = SAMPLE_MS * (p.queue.length > 12 ? 0.35 : p.queue.length > 6 ? 0.7 : 1);
  const t = Math.min(1, (now - p.seg.t0) / dur);
  p.pos = { x: p.seg.from.x + (p.seg.to.x - p.seg.from.x) * t, y: p.seg.from.y + (p.seg.to.y - p.seg.from.y) * t };
  if (t >= 1) { p.seg = null; if (p.queue.length > 40) p.queue.splice(0, p.queue.length - 40); }
}

/* =====================================================================================
   Start
   ===================================================================================== */
const user = { name: null, first: null, email: null, avatar: null, dept: null, color: PEER_COLORS[0] };
setView({ x: 0, y: 0, k: 1 });

/* ---- The hub (My role, Team, Processes, Settings) lives in hub.js ---- */
let hub = null;
function hubRefresh() { hub?.refresh(); }
function hubFlowCard(f) { return hub ? hub.flowCard(f) : ''; }
function hubCreateProcessForFlow(key) { hub?.createProcessForFlow(key); }
function applyAccessToChrome() { hub?.applyChrome(); }
function go(hash) { if (location.hash === hash) hub?.route(); else location.hash = hash; }
function showFlowOnMap(flowId) {
  go('#/map');
  setTimeout(() => { if (state.flows.has(flowId)) select('flow', flowId); }, 30);
}

(async () => {
  // Who's here — used for "Edited by". The page works fine without it.
  try {
    const auth = await import('/_shared/auth.js');
    await auth.loadPermissions();
    user.name = auth.getFullName() || auth.getFirstName() || null;
    const first = auth.getFirstName();
    user.first = first;
    user.email = auth.getEmail();
    user.avatar = auth.getAvatarSm();
    user.dept = auth.getDepartment?.() || null;
    user.email = user.email ? String(user.email).toLowerCase() : null;
    user.color = hashColor(user.email || TAB);
    if (first) { $('#userName').textContent = first; $('#user').hidden = false; }
    const avatar = auth.getAvatarSm();
    if (avatar) { const img = $('#avatar'); img.onload = () => { img.hidden = false; $('#user').hidden = false; }; img.src = avatar; }
  } catch { /* no platform — local preview */ }

  await store.init();
  if (store.mode === 'local') banner('Local preview: the platform isn’t available here, so changes are saved in this browser only. Deploy to bp-vibes to share the map with the team.');
  renderSaveState();
  const loaded = await load();
  hub = createHub({
    state, store, user, BOOTSTRAP_ADMINS, METHODS, methodOf, methodIcon, CATEGORIES, catOf, sysOf, STEP_KINDS, kindOfStep, FREQUENCIES,
    esc, $, $$, rid, clone, initials, ago, hashColor, toast, openDialog, confirmDialog,
    edit, createEntity, deleteEntity, flushDebounced, go, showFlowOnMap, closeDrawer, renderDrawer, schedulePush: (u) => schedulePush(u),
  });
  if (loaded) { fitAll(false); hub.upsertMe(); }
  hub.start();
  startPresence();
})();
