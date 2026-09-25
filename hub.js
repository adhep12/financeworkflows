/* =====================================================================================
   The Finance hub: My role, Team, Processes, a process's three views, Settings.

   The data flow map (app.js) stays the front door and is open to everyone who can open the
   app. Everything here is limited by the `access` records an admin manages in Settings:
   someone with no record sees the map and nothing else.

   These limits decide what the app SHOWS. The collections are `shared`, so the data itself is
   readable by anyone signed in at BibleProject who goes looking with developer tools. That
   trade-off was chosen deliberately; truly locked data would need a `group:` collection.
   ===================================================================================== */

export function createHub(ctx) {
  const {
    state, store, user, BOOTSTRAP_ADMINS, METHODS, methodOf, methodIcon, catOf, sysOf, STEP_KINDS, kindOfStep, FREQUENCIES,
    esc, $, $$, rid, initials, ago, hashColor, toast, openDialog, confirmDialog,
    edit, createEntity, deleteEntity, flushDebounced, go, showFlowOnMap, closeDrawer, renderDrawer, schedulePush,
  } = ctx;

  const view = $('#hubView');
  const tabsEl = $('#tabs');
  let current = { name: 'map' };
  let stale = false;

  /* ---------------------------------------------------------------------------------
     Identity and access
     --------------------------------------------------------------------------------- */
  const local = () => store.mode !== 'remote';
  const meEmail = () => (user.email || (local() ? 'you@local' : '')).toLowerCase();
  const personKey = (email) => 'p-' + String(email).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 120);
  const peopleList = () => [...state.people.values()].filter(p => p.email).sort((a, b) => a.name.localeCompare(b.name));
  const personBy = (email) => email ? state.people.get(personKey(email)) : null;
  const nameOf = (email) => {
    if (!email) return 'Unassigned';
    const p = personBy(email);
    if (p?.name) return p.name;
    if (email === meEmail()) return user.name || 'You';
    return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  const firstOf = (email) => personBy(email)?.first || nameOf(email).split(' ')[0];
  const colorOf = (email) => hashColor(email || 'x');
  const avatarOf = (email) => {
    const a = personBy(email)?.avatar || (email === meEmail() ? user.avatar : '');
    return /^https?:\/\//i.test(a || '') ? a : '';
  };

  const accessOf = (email) => email ? state.access.get(personKey(email)) : null;
  const settings = () => ({ defaultHome: 'map', allowPersonalHome: true, ...(state.meta.get('settings') || {}) });
  function isAdmin(email = meEmail()) {
    if (local()) return true;
    if (!email) return false;
    return BOOTSTRAP_ADMINS.includes(email) || !!accessOf(email)?.admin;
  }
  const isOwnerAdmin = (email) => BOOTSTRAP_ADMINS.includes(email);
  function canPage(page, email = meEmail()) {
    if (isAdmin(email)) return true;
    return !!accessOf(email)?.pages?.[page];
  }
  function canProcess(p, email = meEmail()) {
    if (!p) return false;
    if (isAdmin(email)) return true;
    const a = accessOf(email);
    return !!a && (a.functions.includes(p.functionId) || a.processes.includes(p.key));
  }
  const visibleProcesses = (email = meEmail()) => [...state.processes.values()].filter(p => canProcess(p, email));
  const functionsList = () => [...state.functions.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const creatableFunctions = () => isAdmin() ? functionsList() : functionsList().filter(f => accessOf(meEmail())?.functions.includes(f.key));
  const canCreateProcess = () => isAdmin() || creatableFunctions().length > 0;
  const canSeeProcessesTab = () => isAdmin() || visibleProcesses().length > 0;
  const canEditRole = (holder) => isAdmin() || holder === meEmail();

  /* Who can see a process: admins, anyone with its whole function, anyone given it directly. */
  function whoCanSee(p) {
    const out = [];
    for (const person of peopleList()) {
      if (isAdmin(person.email)) continue;
      const a = accessOf(person.email);
      if (!a) continue;
      if (a.functions.includes(p.functionId)) out.push({ email: person.email, via: 'function' });
      else if (a.processes.includes(p.key)) out.push({ email: person.email, via: 'direct' });
    }
    return out;
  }

  /* ---------------------------------------------------------------------------------
     Small rendering helpers
     --------------------------------------------------------------------------------- */
  function photo(email, size = 28, extra = '') {
    const av = avatarOf(email);
    const ini = email ? initials(nameOf(email)) : '?';
    const bg = email ? colorOf(email) : '#C9C4B7';
    return `<span class="ph${extra ? ' ' + extra : ''}" style="--pc:${bg};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px" aria-hidden="true"><span>${esc(ini)}</span>${av ? `<img src="${esc(av)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
  }
  const personOptions = (selected, { none = 'Unassigned' } = {}) =>
    `<option value="">${esc(none)}</option>` + peopleList().map(p => `<option value="${esc(p.email)}" ${p.email === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    + (selected && !personBy(selected) ? `<option value="${esc(selected)}" selected>${esc(nameOf(selected))}</option>` : '');
  const fnOf = (id) => state.functions.get(id);
  const fnDot = (id) => `<span class="fn-dot" style="background:${fnOf(id)?.color || '#9AA1AC'}"></span>`;
  function statusOf(p) {
    const n = p.steps.filter(s => s.text.trim()).length;
    if (!n) return { cls: 'empty', label: 'Needs documentation' };
    if (n < 3 || !p.owner) return { cls: 'partial', label: 'Partially documented' };
    return { cls: 'documented', label: 'Documented' };
  }
  const whenText = (p) => [p.frequency, p.when].filter(Boolean).join(' · ') || 'When? Not set';
  const toolsOf = (p) => [...new Set(p.steps.map(s => s.tool.trim()).filter(Boolean))];
  const flowLabel = (f) => f ? `${sysOf(f.from)?.name || '?'} ${f.kind === 'flow' ? '→' : '⇄'} ${sysOf(f.to)?.name || '?'}${f.name ? ' · ' + f.name : ''}` : '';
  const role = (email) => email ? [...state.roles.values()].find(r => r.holder === email) : null;
  const roleTitle = (email) => role(email)?.title || '';
  const noAccess = (what) => `<div class="hub-page"><div class="hub-empty"><h2>You don't have access to ${esc(what)}</h2><p>Ask a Finance admin if you need it. The data flow map is always open to you.</p><a class="btn primary" href="#/map">Go to the data flow map</a></div></div>`;

  /* People who belong on the Team page: anyone with a role, anything assigned, or Finance access. */
  function teamMembers() {
    const set = new Set();
    for (const r of state.roles.values()) if (r.holder) set.add(r.holder);
    for (const p of state.processes.values()) {
      [p.owner, p.backup, p.signoff, ...p.steps.map(s => s.who)].forEach(e => e && set.add(e));
    }
    for (const person of peopleList()) {
      const a = accessOf(person.email);
      if (a && (a.admin || a.pages.team || a.pages.myrole || a.functions.length)) set.add(person.email);
    }
    return [...set].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }
  function involvement(email) {
    const out = { owns: [], signs: [], backup: [], steps: [] };
    for (const p of visibleProcesses()) {
      if (p.owner === email) out.owns.push(p);
      if (p.signoff === email) out.signs.push(p);
      if (p.backup === email) out.backup.push(p);
      if (p.owner !== email && p.signoff !== email && p.backup !== email && p.steps.some(s => s.who === email)) out.steps.push(p);
    }
    return out;
  }

  /* ---------------------------------------------------------------------------------
     Routing
     --------------------------------------------------------------------------------- */
  function parse(hash) {
    const parts = (hash || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [a, b, c] = parts;
    switch (a) {
      case '': case undefined: return { name: 'home' };
      case 'map': return { name: 'map' };
      case 'me': return { name: 'person', email: meEmail(), mine: true };
      case 'person': return { name: 'person', email: (b || '').toLowerCase() };
      case 'team': return { name: 'team' };
      case 'processes': return { name: 'processes' };
      case 'process': return { name: 'process', id: b, tab: c === 'steps' || c === 'map' ? c : 'lanes' };
      case 'settings': return { name: 'settings', tab: ['functions', 'general'].includes(b) ? b : 'people', email: b && !['functions', 'general', 'people'].includes(b) ? b.toLowerCase() : (c || '').toLowerCase() };
      default: return { name: 'map' };
    }
  }
  function homeHash() {
    const personal = settings().allowPersonalHome ? personBy(meEmail())?.home : '';
    for (const h of [personal, settings().defaultHome, 'map']) {
      if (!h) continue;
      const hash = h.startsWith('#') ? h : '#/' + h.replace(':', '/');
      if (canOpenRoute(hash)) return hash;
    }
    return '#/map';
  }
  function canOpenRoute(hash) {
    const r = parse(hash);
    switch (r.name) {
      case 'map': case 'home': return true;
      case 'person': return r.email === meEmail() ? canPage('myrole') : canPage('team');
      case 'team': return canPage('team');
      case 'processes': return canSeeProcessesTab();
      case 'process': return canProcess(state.processes.get(r.id));
      case 'settings': return isAdmin();
      default: return false;
    }
  }
  function describeRoute(hash) {
    const r = parse(hash);
    switch (r.name) {
      case 'person': return r.email === meEmail() ? 'looking at your role' : `on ${firstOf(r.email)}'s role`;
      case 'team': return 'on the Team page';
      case 'processes': return 'browsing processes';
      case 'process': { const p = state.processes.get(r.id); return p && canProcess(p) ? `reading ${p.name}` : 'reading a process'; }
      case 'settings': return 'in Settings';
      default: return 'looking around the map';
    }
  }

  function route() {
    const r = parse(location.hash);
    if (r.name === 'home') { location.replace(homeHash()); return; }
    flushDebounced();
    current = r;
    const onMap = r.name === 'map';
    document.body.dataset.route = onMap ? 'map' : 'hub';
    view.hidden = onMap;
    if (!onMap) { closeDrawer(); render(); view.scrollTop = 0; }
    applyChrome();
    schedulePush(true);
  }
  function applyChrome() {
    const tabs = [['map', '#/map', 'Data flows', true], ['processes', '#/processes', 'Processes', canSeeProcessesTab()], ['team', '#/team', 'Team', canPage('team')],
      ['person', '#/me', 'My role', canPage('myrole')], ['settings', '#/settings', 'Settings', isAdmin()]].filter(t => t[3]);
    const active = current.name === 'process' ? 'processes' : current.name === 'person' && !current.mine && current.email !== meEmail() ? 'team' : current.name;
    tabsEl.innerHTML = tabs.length > 1 ? tabs.map(([n, h, l]) => `<a href="${h}" class="${n === active ? 'on' : ''}" ${n === active ? 'aria-current="page"' : ''}>${l}</a>`).join('') : '';
    tabsEl.hidden = tabs.length < 2;
    const u = $('#user');
    if (u && (user.name || local())) {
      u.hidden = false;
      if (!user.name) $('#userName').textContent = 'You';
    }
  }

  /* ---------------------------------------------------------------------------------
     Rendering dispatch. A refresh from a teammate's edit never redraws under someone's
     cursor: while they're typing in the page, it waits until they leave the field.
     --------------------------------------------------------------------------------- */
  function render() {
    const top = view.scrollTop;
    let html;
    switch (current.name) {
      case 'person': html = canOpenRoute(location.hash) ? personView(current.email) : noAccess(current.email === meEmail() ? 'My role' : 'Team'); break;
      case 'team': html = canPage('team') ? teamView() : noAccess('the Team page'); break;
      case 'processes': html = canSeeProcessesTab() ? processesView() : noAccess('processes'); break;
      case 'process': {
        const p = state.processes.get(current.id);
        html = !p ? `<div class="hub-page"><div class="hub-empty"><h2>This process doesn't exist any more</h2><a class="btn" href="#/processes">All processes</a></div></div>`
          : canProcess(p) ? processView(p, current.tab) : noAccess('this process');
        break;
      }
      case 'settings': html = isAdmin() ? settingsView() : noAccess('Settings'); break;
      default: html = '';
    }
    view.innerHTML = html;
    view.scrollTop = top;
    stale = false;
    afterRender();
  }
  function refresh() {
    applyChrome();
    if (current.name === 'map') return;
    if (view.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) { stale = true; return; }
    render();
  }
  view.addEventListener('focusout', (e) => {
    if (stale && !view.contains(e.relatedTarget)) setTimeout(() => { if (!view.contains(document.activeElement) || document.activeElement === view) render(); }, 0);
  });
  let flashNext = null;
  function afterRender() {
    $$('textarea.auto', view).forEach(autosize);
    if (current.name === 'process' && current.tab !== 'steps') drawProcessDiagram();
    if (current.name === 'process' && current.tab === 'steps' && flashNext != null) {
      const el = $$('.step-card', view)[flashNext];
      flashNext = null;
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    }
  }
  function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

  /* ---------------------------------------------------------------------------------
     My role / someone's role
     --------------------------------------------------------------------------------- */
  function personView(email) {
    const r = role(email);
    const inv = involvement(email);
    const mine = email === meEmail();
    const members = canPage('team') ? teamMembers() : [];
    if (mine && !members.includes(email)) members.unshift(email);
    const switcher = canPage('team') ? `<div class="person-switch" role="navigation" aria-label="Choose a person">
        <span class="lbl">Viewing</span>
        ${members.map(e => `<a href="${e === meEmail() ? '#/me' : '#/person/' + encodeURIComponent(e)}" class="pchip ${e === email ? 'on' : ''}">${photo(e, 24)}${esc(e === meEmail() ? firstOf(e) + ' (you)' : firstOf(e))}</a>`).join('')}
        <a href="#/team" class="pchip dashed">Whole team</a>
      </div>` : '';
    const group = (title, sub, list) => `<div class="proc-group"><div class="pg-head"><h2>${title}</h2><span>${sub}</span></div>
      ${list.length ? list.map(procRow).join('') : `<div class="none">Nothing here yet.</div>`}</div>`;
    const person = personBy(email);
    return `<div class="hub-page">
      ${switcher}
      <div class="role-grid">
        <section class="card role-card" aria-label="Role">
          <div class="role-head">
            ${photo(email, 64, 'ring')}
            <div class="rh-main">
              <h1 class="person-name">${esc(nameOf(email))}</h1>
              <div class="muted-sm">${esc([r?.title, r?.reportsTo ? 'reports to ' + r.reportsTo : '', person?.dept && !r ? person.dept : ''].filter(Boolean).join(' · ') || (person?.dept || ''))}</div>
            </div>
            ${canEditRole(email) ? `<button class="btn sm" data-act="edit-role" data-email="${esc(email)}">${r ? 'Edit role' : 'Write role'}</button>` : ''}
          </div>
          ${r ? `
            ${r.purpose ? `<p class="purpose">${esc(r.purpose)}</p>` : ''}
            ${r.duties.filter(Boolean).length ? `<h3 class="mini-h">Responsibilities</h3><ul class="duties">${r.duties.filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
            ${r.decides.filter(Boolean).length ? `<h3 class="mini-h">Decides / signs off on</h3><div class="chips">${r.decides.filter(Boolean).map(d => `<span class="chip warm">${esc(d)}</span>`).join('')}</div>` : ''}
            <div class="role-foot">
              <div><span class="muted-sm">Backup</span><span class="rf-val">${r.backup ? `${photo(r.backup, 20)} ${esc(nameOf(r.backup))}` : 'Not set'}</span></div>
              <div><span class="muted-sm">Systems</span><span class="rf-val">${esc(r.systems || '—')}</span></div>
            </div>`
          : `<div class="none">${mine ? 'Your role isn’t written down yet. Add what you’re responsible for so the team knows who to ask.' : `${esc(firstOf(email))}'s role isn't written down yet.`}</div>`}
        </section>
        <section aria-label="Processes">
          ${group('Owns', 'Accountable for these being done and documented', inv.owns)}
          ${group('Signs off', 'Someone else does the work; ' + (mine ? 'you approve' : firstOf(email) + ' approves') + ' it', inv.signs)}
          ${group('Backup for', 'Steps in when the owner is out', inv.backup)}
          ${inv.steps.length ? group('Does steps in', 'Part of the process, not the owner', inv.steps) : ''}
        </section>
      </div>
    </div>`;
  }
  function procRow(p) {
    const st = statusOf(p);
    return `<a class="proc-row" href="#/process/${encodeURIComponent(p.key)}">
      ${fnDot(p.functionId)}
      <span class="pr-main"><span class="pr-name">${esc(p.name)}</span><span class="muted-sm">${esc(fnOf(p.functionId)?.name || 'No function')} · ${p.steps.length} step${p.steps.length === 1 ? '' : 's'}</span></span>
      <span class="pr-when">${esc(whenText(p))}</span>
      <span class="badge ${st.cls}">${st.label}</span>
    </a>`;
  }

  async function editRole(email) {
    const r = role(email);
    const v = await openDialog(`<form method="dialog" class="wide">
      <h2>${r ? 'Edit' : 'Write'} ${email === meEmail() ? 'your' : esc(firstOf(email)) + '’s'} role</h2>
      <p class="d-sub">What this person is responsible for. Keep it short: it's the first thing a teammate reads.</p>
      <div class="fld-row"><label class="fld"><span>Role title</span><input name="title" value="${esc(r?.title || '')}" placeholder="e.g. Controller" autofocus></label>
      <label class="fld"><span>Reports to</span><input name="reportsTo" value="${esc(r?.reportsTo || '')}" placeholder="e.g. Director of Finance"></label></div>
      <label class="fld"><span>Purpose</span><textarea name="purpose" rows="2" placeholder="One or two sentences">${esc(r?.purpose || '')}</textarea></label>
      <label class="fld"><span>Responsibilities <span class="light">(one per line)</span></span><textarea name="duties" rows="4">${esc((r?.duties || []).join('\n'))}</textarea></label>
      <label class="fld"><span>Decides / signs off on <span class="light">(comma separated)</span></span><input name="decides" value="${esc((r?.decides || []).join(', '))}" placeholder="Journal entries, Reconciliations"></label>
      <div class="fld-row"><label class="fld"><span>Backup</span><select name="backup">${personOptions(r?.backup, { none: 'Not set' })}</select></label>
      <label class="fld"><span>Systems used</span><input name="systems" value="${esc(r?.systems || '')}" placeholder="Acumatica, Bill"></label></div>
      <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save role</button></div>
    </form>`, (fd) => ({
      title: String(fd.get('title')).trim(), reportsTo: String(fd.get('reportsTo')).trim(), purpose: String(fd.get('purpose')).trim(),
      duties: String(fd.get('duties')).split('\n').map(s => s.trim()).filter(Boolean),
      decides: String(fd.get('decides')).split(',').map(s => s.trim()).filter(Boolean),
      backup: String(fd.get('backup')).toLowerCase(), systems: String(fd.get('systems')).trim(),
    }));
    if (!v) return;
    if (r) edit('roles', r.key, (x) => Object.assign(x, v), { render: false });
    else createEntity('roles', { key: rid('role'), holder: email, ...v });
    render();
  }

  /* ---------------------------------------------------------------------------------
     Team
     --------------------------------------------------------------------------------- */
  function teamView() {
    const members = teamMembers();
    const procs = visibleProcesses().sort(byFunctionThenName);
    const count = (email, field) => procs.filter(p => p[field] === email).length;
    const cell = (p, email) => p.owner === email ? ['O', 'Owner'] : p.backup === email ? ['B', 'Backup'] : p.signoff === email ? ['S', 'Signs off'] : p.steps.some(s => s.who === email) ? ['•', 'Does steps'] : null;
    return `<div class="hub-page">
      <div class="page-head"><h1>The Finance team</h1><span class="muted-sm">Photos come from each person's BibleProject sign-in</span></div>
      ${members.length ? `<div class="people-grid">${members.map(e => `
        <a class="person-card" href="${e === meEmail() ? '#/me' : '#/person/' + encodeURIComponent(e)}">
          ${photo(e, 72, 'ring')}
          <span class="pc-name">${esc(nameOf(e))}</span>
          <span class="pc-role">${esc(roleTitle(e) || personBy(e)?.dept || '')}</span>
          <span class="pc-stats"><span class="chip dark">Owns ${count(e, 'owner')}</span><span class="chip blue">Backup ${count(e, 'backup')}</span></span>
        </a>`).join('')}</div>`
      : `<div class="hub-empty"><h2>No one on the team yet</h2><p>People show up here once they have a role, are assigned to a process, or are given Finance access in Settings.</p></div>`}
      ${procs.length && members.length ? `<section class="card matrix" aria-label="Who owns each process">
        <div class="mx-head"><h2>Who owns each process</h2>
          <span class="legend-inline"><span class="cell o">O</span>Owner <span class="cell b">B</span>Backup <span class="cell s">S</span>Signs off <span class="cell d">•</span>Does steps <span class="gap-dot"></span>No backup</span></div>
        <div class="mx-scroll"><table>
          <thead><tr><th scope="col">Process</th>${members.map(e => `<th scope="col"><span class="mx-person">${photo(e, 22)}${esc(firstOf(e))}</span></th>`).join('')}</tr></thead>
          <tbody>${procs.map(p => `<tr>
            <th scope="row"><a href="#/process/${encodeURIComponent(p.key)}">${fnDot(p.functionId)}${esc(p.name)}</a>${p.backup ? '' : '<span class="gap-dot" title="No backup"></span>'}</th>
            ${members.map(e => { const c = cell(p, e); return `<td>${c ? `<span class="cell ${{ O: 'o', B: 'b', S: 's', '•': 'd' }[c[0]]}" title="${esc(nameOf(e))}: ${c[1]}">${c[0]}</span>` : ''}</td>`; }).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}
    </div>`;
  }
  function byFunctionThenName(a, b) {
    const fa = fnOf(a.functionId)?.order ?? 99, fb = fnOf(b.functionId)?.order ?? 99;
    return fa - fb || a.name.localeCompare(b.name);
  }

  /* ---------------------------------------------------------------------------------
     Processes list
     --------------------------------------------------------------------------------- */
  let procFilter = { q: '', fn: '' };
  function processesView() {
    const all = visibleProcesses();
    const q = procFilter.q.toLowerCase();
    const shown = all.filter(p => (!procFilter.fn || p.functionId === procFilter.fn) &&
      (!q || [p.name, p.description, nameOf(p.owner), ...p.steps.map(s => s.text + ' ' + s.tool)].join(' ').toLowerCase().includes(q)));
    const groups = [...functionsList(), { key: '', name: 'No function', color: '#9AA1AC' }]
      .map(f => ({ f, list: shown.filter(p => (p.functionId || '') === f.key || (!f.key && !fnOf(p.functionId))).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter(g => g.list.length);
    const fns = functionsList().filter(f => all.some(p => p.functionId === f.key));
    return `<div class="hub-page">
      <div class="page-head"><h1>Processes</h1>
        ${canCreateProcess() ? `<button class="btn primary" data-act="new-process">+ New process</button>` : ''}</div>
      <div class="filter-row">
        <label class="search-inline">${searchIcon}<input type="search" data-filter="q" value="${esc(procFilter.q)}" placeholder="Search processes and steps" aria-label="Search processes"></label>
        <button class="fchip ${procFilter.fn ? '' : 'on'}" data-act="fn-filter" data-fn="">All</button>
        ${fns.map(f => `<button class="fchip ${procFilter.fn === f.key ? 'on' : ''}" data-act="fn-filter" data-fn="${esc(f.key)}"><span class="fn-dot" style="background:${f.color}"></span>${esc(f.name)}</button>`).join('')}
      </div>
      ${groups.length ? `<div class="card table-card">
        <div class="pt-row pt-headrow"><span>Process</span><span>Owner · backup</span><span>When</span><span>Tools</span><span>Steps</span><span>Status</span></div>
        ${groups.map(g => `<div class="pt-group">${fnDot(g.f.key)}${esc(g.f.name)}</div>
          ${g.list.map(p => { const st = statusOf(p); return `<a class="pt-row" href="#/process/${encodeURIComponent(p.key)}">
            <span class="pt-name">${esc(p.name)}</span>
            <span class="pt-owner">${p.owner ? `${photo(p.owner, 28)}<span><span>${esc(nameOf(p.owner))}</span><span class="muted-sm">${p.backup ? 'backup ' + esc(firstOf(p.backup)) : 'no backup'}</span></span>` : '<span class="muted-sm">No owner yet</span>'}</span>
            <span class="muted-sm">${esc(whenText(p))}</span>
            <span class="tools">${toolsOf(p).slice(0, 3).map(t => `<span class="tool-chip">${esc(t)}</span>`).join('')}</span>
            <span>${p.steps.length}</span>
            <span class="badge ${st.cls}">${st.label}</span>
          </a>`; }).join('')}`).join('')}
      </div>` : `<div class="hub-empty"><h2>${all.length ? 'Nothing matches' : 'No processes yet'}</h2>${!all.length && canCreateProcess() ? '<p>Write up how a piece of Finance work gets done, step by step, and who does each step.</p>' : ''}</div>`}
    </div>`;
  }
  const searchIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;

  async function newProcess(prefill = {}) {
    const fns = creatableFunctions();
    const v = await openDialog(`<form method="dialog">
      <h2>New process</h2>
      <p class="d-sub">A piece of Finance work you'll write up step by step.</p>
      <label class="fld"><span>Name</span><input name="name" required autofocus maxlength="120" value="${esc(prefill.name || '')}" placeholder="e.g. Bank reconciliation"></label>
      <label class="fld"><span>Function</span><select name="functionId">${fns.map(f => `<option value="${esc(f.key)}" ${f.key === prefill.functionId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Owner</span><select name="owner">${personOptions(prefill.owner ?? meEmail(), { none: 'Not set' })}</select></label>
      <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Create</button></div>
    </form>`, (fd) => ({ name: String(fd.get('name')).trim(), functionId: String(fd.get('functionId') || ''), owner: String(fd.get('owner')).toLowerCase() }));
    if (!v?.name) return null;
    const p = { key: rid('proc'), name: v.name, functionId: v.functionId, flowId: prefill.flowId || '', owner: v.owner, backup: '', signoff: '',
      frequency: prefill.frequency || '', when: '', duration: '', description: prefill.description || '', steps: prefill.steps || [] };
    createEntity('processes', p);
    go(`#/process/${encodeURIComponent(p.key)}/${p.steps.length ? 'lanes' : 'steps'}`);
    return p;
  }
  function stepsFromFlow(f) {
    return (f?.steps || []).map(s => ({ id: rid('st'), kind: s.kind || 'other', text: s.text || '', tool: s.tool || '', who: '', minutes: null, checklist: [] }));
  }
  function createProcessForFlow(flowKey) {
    const f = state.flows.get(flowKey);
    if (!f) return;
    newProcess({ name: f.name || flowLabel(f), flowId: f.key, frequency: f.frequency, description: f.description, steps: stepsFromFlow(f), functionId: creatableFunctions()[0]?.key });
  }

  /* The card on a map connection: the process behind it, or a lock if it isn't yours to see. */
  function flowCard(f) {
    const procs = [...state.processes.values()].filter(p => p.flowId === f.key);
    if (!procs.length) {
      return canCreateProcess() ? `<button type="button" class="proc-card add" data-act="create-process">+ Write up the process behind this flow<span>Who does each step, checklists and instructions</span></button>` : '';
    }
    return procs.map(p => {
      if (!canProcess(p)) {
        return `<div class="proc-card locked">
          <span class="pc-k"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Full instructions are for the Finance team</span>
          <span class="muted-sm">Step-by-step instructions and who does each step live on the process page.${p.owner ? ' Owner: ' + esc(nameOf(p.owner)) + '.' : ''}</span>
          ${p.owner ? `<a class="btn sm" href="mailto:${esc(p.owner)}?subject=${encodeURIComponent('Access to: ' + p.name)}">Ask ${esc(firstOf(p.owner))} for access</a>` : ''}
        </div>`;
      }
      const line = (email, what) => email ? `<span class="pc-line">${photo(email, 22)}<span><b>${esc(nameOf(email))}</b> · ${what}</span></span>` : '';
      return `<button type="button" class="proc-card" data-act="open-process" data-id="${esc(p.key)}">
        <span class="pc-k">Process behind this flow</span>
        <span class="pcd-name">${esc(p.name)}</span>
        ${line(p.owner, 'owner')}${line(p.backup, 'backup')}${line(p.signoff, 'signs off')}
        ${!p.owner && !p.backup && !p.signoff ? '<span class="muted-sm">No one assigned yet</span>' : ''}
        <span class="pc-open">Open instructions →</span>
      </button>`;
    }).join('');
  }

  /* ---------------------------------------------------------------------------------
     One process: header + Swimlane | Step by step | As a flow map
     --------------------------------------------------------------------------------- */
  function processView(p, tab) {
    const flow = state.flows.get(p.flowId);
    const st = statusOf(p);
    const viewers = whoCanSee(p);
    const direct = viewers.filter(v => v.via === 'direct');
    const enc = encodeURIComponent(p.key);
    const tabs = [['lanes', 'Swimlane by person'], ['steps', 'Step by step'], ['map', 'As a flow map']];
    const flows = [...state.flows.values()].sort((a, b) => flowLabel(a).localeCompare(flowLabel(b)));
    return `<div class="hub-page process-page" data-proc="${esc(p.key)}">
      <div class="crumbs"><a href="#/processes">Processes</a> / ${fnDot(p.functionId)}${esc(fnOf(p.functionId)?.name || 'No function')}</div>
      <div class="proc-head">
        <input class="hub-title" data-pfield="name" value="${esc(p.name)}" aria-label="Process name">
        <span class="badge ${st.cls}">${st.label}</span>
        ${isAdmin() ? `<button class="btn sm" data-act="share">Share…</button>` : ''}
        ${isAdmin() || p.owner === meEmail() ? `<button class="icon-btn" data-act="delete-process" title="Delete process" aria-label="Delete process"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ''}
      </div>
      <div class="proc-meta">
        <label>Owner<select data-pfield="owner">${personOptions(p.owner, { none: 'Not set' })}</select></label>
        <label>Backup<select data-pfield="backup">${personOptions(p.backup, { none: 'Not set' })}</select></label>
        <label>Signs off<select data-pfield="signoff">${personOptions(p.signoff, { none: 'Not set' })}</select></label>
        <label>How often<select data-pfield="frequency">${FREQUENCIES.map(q => `<option value="${esc(q)}" ${q === p.frequency ? 'selected' : ''}>${q || 'Not set'}</option>`).join('')}</select></label>
        <label>When<input data-pfield="when" value="${esc(p.when)}" placeholder="e.g. Business day 3"></label>
        <label>Function<select data-pfield="functionId" ${isAdmin() ? '' : 'disabled'}>${functionsList().map(f => `<option value="${esc(f.key)}" ${f.key === p.functionId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label class="wide">On the data flow map<span class="flow-pick"><select data-pfield="flowId"><option value="">Not linked to a connection</option>${flows.map(f => `<option value="${esc(f.key)}" ${f.key === p.flowId ? 'selected' : ''}>${esc(flowLabel(f))}</option>`).join('')}</select>${flow ? `<button class="btn sm" data-act="show-flow">Show on map</button>` : ''}</span></label>
      </div>
      <textarea class="proc-desc auto" data-pfield="description" rows="1" placeholder="What this process is for, in a sentence or two">${esc(p.description)}</textarea>
      <div class="visible-to">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        Visible to admins${viewers.length - direct.length ? `, ${viewers.length - direct.length} with ${esc(fnOf(p.functionId)?.name || 'this function')}` : ''}${direct.length ? `, and shared with ${direct.map(v => esc(firstOf(v.email))).join(', ')}` : ''}
      </div>
      <div class="ptabs" role="tablist">${tabs.map(([t, l]) => `<a role="tab" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}" href="#/process/${enc}${t === 'lanes' ? '' : '/' + t}">${l}</a>`).join('')}</div>
      ${tab === 'steps' ? stepsEditor(p, flow) : `<div class="diagram-wrap card"><div class="diagram" id="diagram"></div></div>
        ${p.steps.length ? '' : `<div class="none">No steps yet. <a href="#/process/${enc}/steps">Add the first step</a>${flow?.steps.length ? ' or copy them from the data flow' : ''}.</div>`}`}
    </div>`;
  }

  function stepsEditor(p, flow) {
    const people = [...new Set([p.owner, p.backup, p.signoff, ...p.steps.map(s => s.who)].filter(Boolean))];
    const total = p.steps.reduce((n, s) => n + (s.minutes || 0), 0);
    return `<div class="steps-grid">
      <ol class="steps-list">
        ${p.steps.map((s, i) => { const k = kindOfStep(s); return `<li class="step-card" data-sid="${esc(s.id)}" style="--c:${k.color}">
          <span class="sc-num">${i + 1}</span>
          <div class="sc-body">
            <textarea class="sc-text auto" data-sfield="text" rows="1" placeholder="What happens in this step?" aria-label="Step ${i + 1}">${esc(s.text)}</textarea>
            <div class="sc-meta">
              <select class="kind-select" data-sfield="kind" aria-label="Step type">${STEP_KINDS.map(x => `<option value="${x.id}" ${x.id === k.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
              <label class="sc-who">${photo(s.who, 20)}<select data-sfield="who" aria-label="Who does this step">${personOptions(s.who, { none: 'Who?' })}</select></label>
              <input class="sc-tool" data-sfield="tool" value="${esc(s.tool)}" placeholder="Tool or file" aria-label="Tool or file">
              <label class="sc-min"><input type="number" min="0" step="5" data-sfield="minutes" value="${s.minutes ?? ''}" placeholder="–" aria-label="Minutes">min</label>
              <span class="sc-ctrl">
                <button data-act="step-up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button data-act="step-down" aria-label="Move down" ${i === p.steps.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="del" data-act="step-del" aria-label="Delete step">✕</button>
              </span>
            </div>
            <div class="checklist">
              ${s.checklist.map(c => `<div class="ck" data-cid="${esc(c.id)}"><span class="ck-box" aria-hidden="true"></span><input data-cfield="text" value="${esc(c.text)}" placeholder="Checklist item" aria-label="Checklist item"><button data-act="ck-del" aria-label="Remove item">✕</button></div>`).join('')}
              <button class="ck-add" data-act="ck-add">+ Checklist item</button>
            </div>
          </div>
        </li>`; }).join('')}
        <li class="step-add">
          <button class="btn" data-act="step-add">+ Add a step</button>
          ${!p.steps.length && flow?.steps.length ? `<button class="btn" data-act="copy-flow-steps">Copy the ${flow.steps.length} steps from the data flow</button>` : ''}
        </li>
      </ol>
      <aside class="steps-side">
        <section class="card side-card"><h3>People on this process</h3>
          ${people.length ? people.map(e => {
            const nums = p.steps.map((s, i) => s.who === e ? i + 1 : 0).filter(Boolean);
            const roles = [p.owner === e && 'owner', p.backup === e && 'backup', p.signoff === e && 'signs off'].filter(Boolean);
            return `<div class="side-person">${photo(e, 34)}<span><b>${esc(nameOf(e))}</b><span class="muted-sm">${esc([...roles, nums.length ? 'step' + (nums.length > 1 ? 's ' : ' ') + nums.join(', ') : ''].filter(Boolean).join(' · '))}</span></span></div>`;
          }).join('') : '<div class="muted-sm">Assign an owner and who does each step.</div>'}
        </section>
        <section class="card side-card"><h3>At a glance</h3>
          <div class="muted-sm">When · ${esc(whenText(p))}</div>
          <div class="muted-sm">Takes · ${total ? (total >= 60 ? `${Math.floor(total / 60)}h ${total % 60 ? (total % 60) + 'm' : ''}` : total + ' min') : 'not estimated'}</div>
          <div class="muted-sm">Tools · ${esc(toolsOf(p).join(', ') || 'none listed')}</div>
        </section>
      </aside>
    </div>`;
  }

  /* ---- Diagrams: swimlane by person, and the process as its own little flow map ---- */
  function drawProcessDiagram() {
    const el = $('#diagram', view);
    const p = state.processes.get(current.id);
    if (!el || !p || !p.steps.length) return;
    el.innerHTML = current.tab === 'map' ? processMapSVG(p) : swimlaneSVG(p);
  }
  const trunc = (t, n) => (t = String(t || '').trim()) && t.length > n ? t.slice(0, n - 1) + '…' : t;
  function wrap(text, max, lines) {
    const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > max) { out.push(line); line = w; if (out.length === lines) break; }
      else line = (line + ' ' + w).trim();
    }
    if (out.length < lines && line) out.push(line);
    if (out.join(' ').length < words.join(' ').length) {
      let l = out[out.length - 1].replace(/[\s.,;:—-]+$/, '');
      if (l.length > max - 1) l = l.slice(0, max - 1).trimEnd();
      out[out.length - 1] = l + '…';
    }
    return out;
  }
  function svgPhoto(email, x, y, r) {
    const av = avatarOf(email);
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${email ? colorOf(email) : '#C9C4B7'}"/>
      <text x="${x}" y="${y + r * 0.36}" text-anchor="middle" font-size="${r * 0.9}" font-weight="700" fill="#fff">${esc(email ? initials(nameOf(email)) : '?')}</text>
      ${av ? `<clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><image href="${esc(av)}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>` : ''}</g>`;
  }

  function swimlaneSVG(p) {
    const lanes = [];
    for (const s of p.steps) if (!lanes.includes(s.who)) lanes.push(s.who);
    const LW = 170, CW = 170, BW = 146, BH = 104, LH = 132, PAD = 12;
    const W = LW + p.steps.length * CW + PAD, H = lanes.length * LH;
    const pos = p.steps.map((s, i) => ({ x: LW + i * CW + (CW - BW) / 2, y: lanes.indexOf(s.who) * LH + (LH - BH) / 2 }));
    const arrows = p.steps.slice(1).map((s, i) => {
      const a = pos[i], b = pos[i + 1];
      const x1 = a.x + BW, y1 = a.y + BH / 2, x2 = b.x, y2 = b.y + BH / 2;
      if (y1 === y2) return `<path d="M${x1} ${y1} H${x2 - 2}" class="sl-arrow" marker-end="url(#sl-ar)"/>`;
      const mx = (x1 + x2) / 2;
      return `<path d="M${x1} ${y1} H${mx - 8} Q${mx} ${y1} ${mx} ${y1 + Math.sign(y2 - y1) * 8} V${y2 - Math.sign(y2 - y1) * 8} Q${mx} ${y2} ${mx + 8} ${y2} H${x2 - 2}" class="sl-arrow" marker-end="url(#sl-ar)"/>`;
    }).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="swimlane" role="img" aria-label="Swimlane: ${esc(p.name)}">
      <defs><marker id="sl-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--ink-faint)"/></marker></defs>
      ${lanes.map((e, i) => `<g>
        <rect x="0" y="${i * LH}" width="${W}" height="${LH}" class="${i % 2 ? 'lane alt' : 'lane'}"/>
        <rect x="0" y="${i * LH}" width="${LW - 10}" height="${LH}" class="lane-head"/>
        ${svgPhoto(e, 34, i * LH + 40, 17)}
        <text x="14" y="${i * LH + 80}" class="lane-name">${esc(trunc(e ? nameOf(e) : 'Unassigned', 18))}</text>
        <text x="14" y="${i * LH + 97}" class="lane-role">${esc(trunc(e ? roleTitle(e) : 'Pick who does these', 22))}</text>
      </g>`).join('')}
      ${arrows}
      ${p.steps.map((s, i) => { const k = kindOfStep(s), q = pos[i]; const lines = wrap(s.text || 'No description yet', 20, 3); return `<a href="#/process/${encodeURIComponent(p.key)}/steps" data-step="${i}" class="sl-step">
        <rect x="${q.x}" y="${q.y}" width="${BW}" height="${BH}" rx="10" class="sl-box" style="stroke:${k.color}"/>
        <rect x="${q.x}" y="${q.y}" width="4" height="${BH}" rx="2" fill="${k.color}"/>
        <circle cx="${q.x + 18}" cy="${q.y + 17}" r="9" fill="${k.color}"/><text x="${q.x + 18}" y="${q.y + 20.5}" text-anchor="middle" class="sl-num">${i + 1}</text>
        <text x="${q.x + 32}" y="${q.y + 21}" class="sl-kind">${esc(k.label.split(' ')[0].toUpperCase())}</text>
        ${lines.map((l, j) => `<text x="${q.x + 12}" y="${q.y + 44 + j * 15}" class="sl-text">${esc(l)}</text>`).join('')}
        ${s.tool ? `<text x="${q.x + 12}" y="${q.y + BH - 10}" class="sl-tool">${esc(trunc(s.tool, 22))}</text>` : ''}
        <title>${i + 1}. ${esc(s.text)}</title>
      </a>`; }).join('')}
    </svg>`;
  }

  /* The process as a flow between the tools it touches, each step on the hop where it happens. */
  function processMapSVG(p) {
    const tools = [];
    let last = '';
    const hops = p.steps.map((s, i) => {
      const t = (s.tool || '').trim() || last || 'Start';
      if (!tools.includes(t)) tools.push(t);
      const h = { i, s, from: last || null, to: t };
      last = t;
      return h;
    });
    const NW = 190, NH = 58, GAP = 240, PW = 220;
    const nx = (t) => 30 + tools.indexOf(t) * (NW + GAP);
    const edges = new Map(), below = new Map();
    for (const h of hops) {
      if (!h.from || h.from === h.to) (below.get(h.to) || below.set(h.to, []).get(h.to)).push(h);
      else { const k = h.from + '→' + h.to; (edges.get(k) || edges.set(k, []).get(k)).push(h); }
    }
    const fwd = [...edges].filter(([k]) => { const [a, b] = k.split('→'); return tools.indexOf(b) > tools.indexOf(a); });
    const back = [...edges].filter(([k]) => { const [a, b] = k.split('→'); return tools.indexOf(b) < tools.indexOf(a); });
    const maxUp = Math.max(0, ...fwd.map(([, l]) => l.length));
    const maxBelow = Math.max(0, ...[...below.values()].map(l => l.length));
    // Forward hops sit above the line, steps inside one tool hang below it, and hops that go
    // back to an earlier tool loop underneath everything.
    const TOP = 30 + maxUp * 34;
    const belowY = TOP + NH + 34;
    const backY = belowY + maxBelow * 38 + 26;
    const maxBack = Math.max(0, ...back.map(([, l]) => l.length));
    const W = 30 + tools.length * NW + (tools.length - 1) * GAP + 30;
    const H = (back.length ? backY + maxBack * 34 + 24 : belowY + maxBelow * 38 + 10);
    const sysColor = (t) => { const s = [...state.systems.values()].find(x => t.toLowerCase().includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(t.toLowerCase())); return s ? catOf(s).color : '#6E7681'; };
    const pill = (h, cx, y) => {
      const k = kindOfStep(h.s), text = trunc(h.s.text || 'Step', 26);
      const w = Math.min(PW, Math.max(120, text.length * 6.6 + 64)), x0 = cx - w / 2;
      return `<a href="#/process/${encodeURIComponent(p.key)}/steps" class="pm-pill" data-step="${h.i}"><rect x="${x0}" y="${y - 14}" width="${w}" height="28" rx="14" class="pm-pill-bg"/>
        <circle cx="${x0 + 14}" cy="${y}" r="10" fill="${k.color}"/><text x="${x0 + 14}" y="${y + 3.5}" text-anchor="middle" class="sl-num">${h.i + 1}</text>
        <text x="${x0 + 30}" y="${y + 4}" class="pm-text">${esc(text)}</text>${svgPhoto(h.s.who, x0 + w - 16, y, 10)}<title>${h.i + 1}. ${esc(h.s.text)}${h.s.who ? ' — ' + esc(nameOf(h.s.who)) : ''}</title></a>`;
    };
    let edgeSvg = '', pills = '';
    const lineY = TOP + NH / 2;
    for (const [k, list] of fwd) {
      const [a, b] = k.split('→');
      const x1 = nx(a) + NW, x2 = nx(b);
      edgeSvg += `<path d="M${x1} ${lineY} H${x2 - 3}" class="pm-edge" marker-end="url(#pm-ar)"/>`;
      const cx = tools.indexOf(b) - tools.indexOf(a) === 1 ? (x1 + x2) / 2 : x1 + GAP / 2;
      list.forEach((h, j) => { pills += pill(h, cx, lineY - 30 - j * 34); });
    }
    for (const [k, list] of back) {
      const [a, b] = k.split('→');
      const x1 = nx(a) + NW - 22, x2 = nx(b) + 22;
      edgeSvg += `<path d="M${x1} ${TOP + NH} V${backY - 12} Q${x1} ${backY} ${x1 - 12} ${backY} H${x2 + 12} Q${x2} ${backY} ${x2} ${backY - 12} V${TOP + NH + 3}" class="pm-edge back" marker-end="url(#pm-ar)"/>`;
      list.forEach((h, j) => { pills += pill(h, (x1 + x2) / 2, backY + j * 34); });
    }
    for (const [t, list] of below) {
      const cx = nx(t) + NW / 2;
      edgeSvg += `<path d="M${cx} ${TOP + NH} V${belowY - 14}" class="pm-stub"/>`;
      list.forEach((h, j) => { pills += pill(h, cx, belowY + j * 38); });
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="procmap" role="img" aria-label="${esc(p.name)} as a flow map">
      <defs><marker id="pm-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--edge-flow)"/></marker></defs>
      ${edgeSvg}
      ${tools.map(t => `<g><rect x="${nx(t)}" y="${TOP}" width="${NW}" height="${NH}" rx="13" class="pm-node"/>
        <rect x="${nx(t) + 12}" y="${TOP + 13}" width="32" height="32" rx="9" fill="${sysColor(t)}"/>
        <text x="${nx(t) + 28}" y="${TOP + 34}" text-anchor="middle" class="pm-ini">${esc(initials(t))}</text>
        <text x="${nx(t) + 54}" y="${TOP + 34}" class="pm-name">${esc(trunc(t, 18))}</text></g>`).join('')}
      ${pills}
    </svg>`;
  }

  /* ---- Process editing ---- */
  function procEdit(key, mutate, opts = {}) { edit('processes', key, mutate, { render: false, ...opts }); }
  function stepEdit(key, sid, mutate, opts) { procEdit(key, (x) => { const s = x.steps.find(s => s.id === sid); if (s) mutate(s, x); }, opts); }

  async function share(p) {
    const people = peopleList().filter(x => !isAdmin(x.email));
    const v = await openDialog(`<form method="dialog">
      <h2>Share “${esc(p.name)}”</h2>
      <p class="d-sub">Pick people who should see this process even without access to all of ${esc(fnOf(p.functionId)?.name || 'its function')}.</p>
      <div class="share-list">${people.length ? people.map(x => { const a = accessOf(x.email); const viaFn = a?.functions.includes(p.functionId); return `
        <label class="share-row">${photo(x.email, 28)}<span class="grow"><b>${esc(x.name)}</b><span class="muted-sm">${esc(x.dept || x.email)}</span></span>
        <input type="checkbox" name="p" value="${esc(x.email)}" ${viaFn || a?.processes.includes(p.key) ? 'checked' : ''} ${viaFn ? 'disabled title="Already sees the whole function"' : ''}></label>`; }).join('')
        : '<div class="none">No one else has opened the app yet.</div>'}</div>
      <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save</button></div>
    </form>`, (fd) => new Set(fd.getAll('p')));
    if (!v) return;
    for (const x of people) {
      const a = accessOf(x.email);
      if (a?.functions.includes(p.functionId)) continue;
      const want = v.has(x.email), has = !!a?.processes.includes(p.key);
      if (want === has) continue;
      setAccess(x.email, (acc) => { acc.processes = want ? [...new Set([...acc.processes, p.key])] : acc.processes.filter(k => k !== p.key); });
    }
    render();
    toast('Sharing updated.');
  }

  /* ---------------------------------------------------------------------------------
     Settings (admins)
     --------------------------------------------------------------------------------- */
  let settingsQ = '';
  function accessSummary(email) {
    if (isAdmin(email)) return ['Admin', 'admin'];
    const a = accessOf(email);
    if (!a || (!a.pages.myrole && !a.pages.team && !a.functions.length && !a.processes.length)) return ['Map only', 'map'];
    const allFns = functionsList().every(f => a.functions.includes(f.key));
    if (allFns && a.pages.myrole && a.pages.team && !a.processes.length) return ['Finance team', 'finance'];
    return ['Custom', 'custom'];
  }
  function setAccess(email, mutate) {
    const key = personKey(email);
    if (state.access.has(key)) edit('access', key, mutate, { render: false });
    else {
      const acc = { key, email, admin: false, pages: { myrole: false, team: false }, functions: [], processes: [] };
      mutate(acc);
      createEntity('access', acc);
    }
  }
  function settingsView() {
    const tab = current.tab;
    const tabs = [['people', 'People & access'], ['functions', 'Functions'], ['general', 'General']];
    return `<div class="hub-page settings-page">
      <div class="page-head"><h1>Settings</h1></div>
      <div class="ptabs">${tabs.map(([t, l]) => `<a class="${t === tab ? 'on' : ''}" href="#/settings/${t}">${l}</a>`).join('')}</div>
      ${tab === 'functions' ? functionsSettings() : tab === 'general' ? generalSettings() : peopleSettings()}
    </div>`;
  }
  function peopleSettings() {
    const all = peopleList();
    const q = settingsQ.toLowerCase();
    const list = all.filter(p => !q || (p.name + ' ' + p.email + ' ' + p.dept).toLowerCase().includes(q));
    const selEmail = current.email && personBy(current.email) ? current.email : (list[0]?.email || '');
    return `<div class="access-grid">
      <section class="people-col" aria-label="People">
        <div class="info-note">New people see <b>the data flow map only</b> until you give them more.</div>
        <label class="search-inline">${searchIcon}<input type="search" data-filter="settingsQ" value="${esc(settingsQ)}" placeholder="Search everyone who's opened the app" aria-label="Search people"></label>
        <div class="people-list">${list.map(p => { const [label, cls] = accessSummary(p.email); return `
          <a class="plist-row ${p.email === selEmail ? 'on' : ''}" href="#/settings/people/${encodeURIComponent(p.email)}">
            ${photo(p.email, 34)}<span class="grow"><b>${esc(p.name)}${p.email === meEmail() ? ' (you)' : ''}</b><span class="muted-sm">${esc([p.dept, p.lastSeen ? 'seen ' + ago(p.lastSeen) : p.added ? 'hasn’t opened it yet' : ''].filter(Boolean).join(' · '))}</span></span>
            <span class="acc-chip ${cls}">${label}</span></a>`; }).join('') || '<div class="none">No one yet.</div>'}</div>
        <button class="btn sm" data-act="add-person">+ Add someone who hasn’t opened it yet</button>
      </section>
      ${selEmail ? accessEditor(selEmail) : '<section></section>'}
    </div>`;
  }
  function accessEditor(email) {
    const p = personBy(email);
    const a = accessOf(email) || { admin: false, pages: {}, functions: [], processes: [] };
    const admin = isAdmin(email), owner = isOwnerAdmin(email);
    const procs = [...state.processes.values()];
    const sees = [];
    if (admin) sees.push('everything');
    else {
      sees.push('the data flow map');
      if (a.pages.myrole) sees.push('their role');
      if (a.pages.team) sees.push('the Team page');
      const fnNames = a.functions.map(k => fnOf(k)?.name).filter(Boolean);
      if (fnNames.length) sees.push(fnNames.join(', '));
      const direct = a.processes.map(k => state.processes.get(k)?.name).filter(Boolean);
      if (direct.length) sees.push(direct.join(', '));
    }
    const home = p?.home || '';
    const dis = admin ? 'disabled' : '';
    return `<section class="acc-editor" data-email="${esc(email)}" aria-label="Access for ${esc(nameOf(email))}">
      <div class="acc-head">${photo(email, 56, 'ring')}<div class="grow"><h2 class="person-name">${esc(nameOf(email))}</h2>
        <div class="muted-sm">${esc([p?.dept, p?.firstSeen ? 'first opened ' + new Date(p.firstSeen).toLocaleDateString() : '', p?.lastSeen ? 'last seen ' + ago(p.lastSeen) : ''].filter(Boolean).join(' · '))}</div></div>
        <label class="toggle"><input type="checkbox" data-acc="admin" ${admin ? 'checked' : ''} ${owner || email === meEmail() ? 'disabled' : ''}> Admin${owner ? ' (app owner)' : ''}</label>
      </div>
      ${admin ? `<div class="info-note">Admins see and edit everything, including Settings.</div>` : `
      <div class="preset-row"><span class="muted-sm">Start from</span>
        <button class="fchip" data-act="preset" data-preset="map">Map only</button>
        <button class="fchip" data-act="preset" data-preset="finance">Whole Finance team</button>
        <label class="fchip copy-from">Copy from<select data-act-change="copy-from"><option value="">someone…</option>${peopleList().filter(x => x.email !== email).map(x => `<option value="${esc(x.email)}">${esc(x.name)}</option>`).join('')}</select></label>
      </div>`}
      <div class="acc-cols">
        <div class="card acc-card"><h3>Pages</h3>
          <label class="acc-row muted"><input type="checkbox" checked disabled> <span class="grow"><b>Data flow map</b><span class="muted-sm">Everyone gets this</span></span></label>
          <label class="acc-row"><input type="checkbox" data-acc="page" data-page="myrole" ${admin || a.pages.myrole ? 'checked' : ''} ${dis}> <span class="grow"><b>My role</b><span class="muted-sm">Their own role and processes</span></span></label>
          <label class="acc-row"><input type="checkbox" data-acc="page" data-page="team" ${admin || a.pages.team ? 'checked' : ''} ${dis}> <span class="grow"><b>Team</b><span class="muted-sm">Everyone's roles and who owns what</span></span></label>
          <label class="acc-row muted"><input type="checkbox" ${admin ? 'checked' : ''} disabled> <span class="grow"><b>Settings</b><span class="muted-sm">Admins only</span></span></label>
        </div>
        <div class="card acc-card"><h3>Processes</h3>
          ${functionsList().map(f => { const fnOn = admin || a.functions.includes(f.key); const inFn = procs.filter(x => x.functionId === f.key).sort((x, y) => x.name.localeCompare(y.name)); return `
            <div class="acc-fn">
              <label class="acc-row"><input type="checkbox" data-acc="fn" data-fn="${esc(f.key)}" ${fnOn ? 'checked' : ''} ${dis}> <span class="fn-dot" style="background:${f.color}"></span><span class="grow"><b>${esc(f.name)}</b></span><span class="muted-sm">${fnOn ? 'all' : inFn.filter(x => a.processes.includes(x.key)).length + ' of'} ${inFn.length}</span></label>
              ${inFn.map(x => `<label class="acc-row sub"><input type="checkbox" data-acc="proc" data-proc="${esc(x.key)}" ${fnOn || a.processes.includes(x.key) ? 'checked' : ''} ${fnOn || admin ? 'disabled' : ''}> ${esc(x.name)}</label>`).join('')}
            </div>`; }).join('') || '<div class="none">No functions yet.</div>'}
        </div>
      </div>
      <div class="acc-foot card"><span class="grow"><b>${esc(firstOf(email))} sees:</b> ${esc(sees.join(' + '))}</span>
        <label class="muted-sm">Home screen <select data-acc="home">${homeOptions(email).map(([v, l]) => `<option value="${esc(v)}" ${v === home ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      </div>
    </section>`;
  }
  function homeOptions(email) {
    const out = [['', `Default (${homeLabel(settings().defaultHome)})`], ['map', 'Data flow map']];
    if (canPage('myrole', email)) out.push(['me', 'My role']);
    if (canPage('team', email)) out.push(['team', 'Team']);
    if (isAdmin(email) || visibleProcesses(email).length) out.push(['processes', 'Processes']);
    for (const p of visibleProcesses(email).sort((a, b) => a.name.localeCompare(b.name))) out.push([`process:${p.key}/map`, `Process map: ${p.name}`]);
    return out;
  }
  function homeLabel(h) { return { map: 'Data flow map', me: 'My role', team: 'Team', processes: 'Processes' }[h] || 'Data flow map'; }

  function functionsSettings() {
    const fns = functionsList();
    return `<div class="card fn-settings">
      <p class="muted-sm">Functions group processes, and are the main unit you grant access by.</p>
      ${fns.map(f => { const n = [...state.processes.values()].filter(p => p.functionId === f.key).length; return `<div class="fn-row" data-fn="${esc(f.key)}">
        <input type="color" data-ffield="color" value="${esc(f.color)}" aria-label="Colour">
        <input data-ffield="name" value="${esc(f.name)}" aria-label="Function name">
        <span class="muted-sm">${n} process${n === 1 ? '' : 'es'}</span>
        <button class="icon-btn" data-act="fn-del" ${n ? 'disabled title="Move its processes first"' : ''} aria-label="Delete function">✕</button>
      </div>`; }).join('')}
      <button class="btn sm" data-act="fn-add">+ Add a function</button>
    </div>`;
  }
  function generalSettings() {
    const s = settings();
    return `<div class="card general-settings">
      <label class="fld"><span>Default home screen</span><select data-sfield-g="defaultHome">
        ${['map', 'me', 'team', 'processes'].map(h => `<option value="${h}" ${h === s.defaultHome ? 'selected' : ''}>${homeLabel(h)}</option>`).join('')}
      </select><span class="muted-sm">People without access to that page land on the data flow map.</span></label>
      <label class="acc-row"><input type="checkbox" data-sfield-g="allowPersonalHome" ${s.allowPersonalHome ? 'checked' : ''}> <span class="grow"><b>People can choose their own home screen</b><span class="muted-sm">From the menu under their name, out of the pages they can see</span></span></label>
      <div class="muted-sm">Always admins (set in the app's code): ${BOOTSTRAP_ADMINS.map(esc).join(', ')}</div>
    </div>`;
  }
  function setSetting(field, value) {
    if (state.meta.has('settings')) edit('meta', 'settings', (x) => { x[field] = value; }, { render: false });
    else createEntity('meta', { key: 'settings', defaultHome: 'map', allowPersonalHome: true, [field]: value });
  }

  async function addPerson() {
    const v = await openDialog(`<form method="dialog">
      <h2>Add someone</h2><p class="d-sub">So you can assign them to processes or give them access before they've opened the app. Their photo appears once they sign in.</p>
      <label class="fld"><span>Name</span><input name="name" required autofocus></label>
      <label class="fld"><span>Email</span><input name="email" type="email" required placeholder="name@bibleproject.com"></label>
      <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Add</button></div>
    </form>`, (fd) => ({ name: String(fd.get('name')).trim(), email: String(fd.get('email')).trim().toLowerCase() }));
    if (!v?.email) return;
    const key = personKey(v.email);
    if (!state.people.has(key)) createEntity('people', { key, email: v.email, name: v.name, first: v.name.split(' ')[0], avatar: '', dept: '', firstSeen: 0, lastSeen: 0, home: '', added: true });
    go('#/settings/people/' + encodeURIComponent(v.email));
  }

  /* ---------------------------------------------------------------------------------
     Your own person record: name, photo and team from the sign-in, saved so teammates see them
     --------------------------------------------------------------------------------- */
  function upsertMe() {
    if (local() || !user.email) return;
    const key = personKey(user.email), now = Date.now(), cur = state.people.get(key);
    const data = { email: user.email, name: user.name || user.email, first: user.first || '', avatar: user.avatar || '', dept: user.dept || '' };
    if (!cur) createEntity('people', { key, ...data, firstSeen: now, lastSeen: now, home: '' });
    else if (Object.keys(data).some(k => (data[k] || '') !== (cur[k] || '')) || now - cur.lastSeen > 6 * 3600e3 || cur.added) {
      edit('people', key, (x) => { Object.assign(x, data, { lastSeen: now, added: false }); if (!x.firstSeen) x.firstSeen = now; }, { render: false });
    }
  }

  async function openHomePicker() {
    if (!settings().allowPersonalHome) { toast('Your admin has set everyone’s home screen.'); return; }
    const me = meEmail();
    const cur = personBy(me)?.home || '';
    const opts = homeOptions(me);
    const v = await openDialog(`<form method="dialog">
      <div class="hp-me">${photo(me, 40)}<span><b>${esc(nameOf(me))}</b><span class="muted-sm">${esc(roleTitle(me) || user.dept || '')}</span></span></div>
      <h2>Your home screen</h2><p class="d-sub">What opens first when you visit. Only pages you can see are listed.</p>
      <div class="home-opts">${opts.map(([val, l]) => `<label class="home-opt"><input type="radio" name="home" value="${esc(val)}" ${val === cur ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <div class="d-actions"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Save</button></div>
    </form>`, (fd) => ({ home: String(fd.get('home') ?? '') }));
    if (!v) return;
    const key = personKey(me);
    if (state.people.has(key)) edit('people', key, (x) => { x.home = v.home; }, { render: false });
    else createEntity('people', { key, email: me, name: user.name || 'You', first: user.first || '', avatar: user.avatar || '', dept: user.dept || '', firstSeen: Date.now(), lastSeen: Date.now(), home: v.home });
    toast('Home screen saved.');
  }

  /* ---------------------------------------------------------------------------------
     Events (one set of delegated listeners for every hub page)
     --------------------------------------------------------------------------------- */
  const procKey = () => current.name === 'process' ? current.id : null;

  view.addEventListener('input', (e) => {
    const el = e.target;
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color') return;
    if (el.matches('textarea.auto')) autosize(el);
    const key = procKey();
    if (el.dataset.filter) {
      if (el.dataset.filter === 'q') procFilter.q = el.value; else settingsQ = el.value;
      const pos = el.selectionStart; render();
      const again = $(`[data-filter="${el.dataset.filter}"]`, view); again?.focus(); again?.setSelectionRange(pos, pos);
      return;
    }
    if (key && el.dataset.pfield) { const f = el.dataset.pfield, v = el.value; procEdit(key, (x) => { x[f] = v; }, { debounce: f }); return; }
    const sid = el.closest('[data-sid]')?.dataset.sid;
    if (key && sid && el.dataset.sfield) {
      const f = el.dataset.sfield, v = f === 'minutes' ? (el.value === '' ? null : Math.max(0, Number(el.value) || 0)) : el.value;
      stepEdit(key, sid, (s) => { s[f] = v; }, { debounce: sid + f });
      return;
    }
    const cid = el.closest('[data-cid]')?.dataset.cid;
    if (key && sid && cid) { const v = el.value; stepEdit(key, sid, (s) => { const c = s.checklist.find(c => c.id === cid); if (c) c.text = v; }, { debounce: cid }); return; }
    const fk = el.closest('[data-fn]')?.dataset.fn;
    if (fk && el.dataset.ffield === 'name') { const v = el.value; edit('functions', fk, (x) => { x.name = v; }, { debounce: 'name', render: false }); }
  });

  view.addEventListener('change', (e) => {
    const el = e.target;
    const key = procKey();
    if (el.tagName === 'SELECT' && key && el.dataset.pfield) {
      const f = el.dataset.pfield, v = el.value;
      procEdit(key, (x) => { x[f] = v; });
      render();
      return;
    }
    const sid = el.closest('[data-sid]')?.dataset.sid;
    if (el.tagName === 'SELECT' && key && sid && el.dataset.sfield) { const f = el.dataset.sfield, v = el.value; stepEdit(key, sid, (s) => { s[f] = v; }); render(); return; }
    const fk = el.closest('[data-fn]')?.dataset.fn;
    if (el.type === 'color' && fk) { const v = el.value; edit('functions', fk, (x) => { x.color = v; }, { render: false }); return; }
    if (el.dataset.sfieldG) { setSetting(el.dataset.sfieldG, el.type === 'checkbox' ? el.checked : el.value); render(); return; }

    const ed = el.closest('.acc-editor');
    if (ed) {
      const email = ed.dataset.email;
      if (el.dataset.acc === 'admin') setAccess(email, (a) => { a.admin = el.checked; });
      else if (el.dataset.acc === 'page') setAccess(email, (a) => { a.pages = { ...a.pages, [el.dataset.page]: el.checked }; });
      else if (el.dataset.acc === 'fn') setAccess(email, (a) => { a.functions = el.checked ? [...new Set([...a.functions, el.dataset.fn])] : a.functions.filter(k => k !== el.dataset.fn); });
      else if (el.dataset.acc === 'proc') setAccess(email, (a) => { a.processes = el.checked ? [...new Set([...a.processes, el.dataset.proc])] : a.processes.filter(k => k !== el.dataset.proc); });
      else if (el.dataset.acc === 'home') {
        const k = personKey(email), v = el.value;
        if (state.people.has(k)) edit('people', k, (x) => { x.home = v; }, { render: false });
      } else if (el.dataset.actChange === 'copy-from' && el.value) {
        const src = accessOf(el.value) || { pages: {}, functions: [], processes: [] };
        setAccess(email, (a) => { a.pages = { ...src.pages }; a.functions = [...src.functions]; a.processes = [...src.processes]; });
        toast(`Copied ${firstOf(el.value)}'s access.`);
      }
      render();
    }
  });

  view.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) {
      const st = e.target.closest('.sl-step, .pm-pill');
      if (st && st.dataset.step) flashNext = +st.dataset.step;
      return;
    }
    const act = btn.dataset.act, key = procKey();
    const p = key ? state.processes.get(key) : null;
    const sid = btn.closest('[data-sid]')?.dataset.sid;
    switch (act) {
      case 'edit-role': editRole(btn.dataset.email); break;
      case 'new-process': newProcess(); break;
      case 'fn-filter': procFilter.fn = btn.dataset.fn; render(); break;
      case 'share': if (p) share(p); break;
      case 'show-flow': if (p?.flowId) showFlowOnMap(p.flowId); break;
      case 'delete-process': {
        if (!p) return;
        const ok = await confirmDialog({ title: `Delete “${p.name}”?`, body: `Its ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} and instructions will be removed for everyone.`, confirm: 'Delete process' });
        if (!ok) return;
        await deleteEntity('processes', p.key);
        go('#/processes');
        break;
      }
      case 'copy-flow-steps': { const f = state.flows.get(p?.flowId); if (f) { procEdit(key, (x) => { if (!x.steps.length) x.steps = stepsFromFlow(f); }); render(); } break; }
      case 'step-add': {
        const id = rid('st');
        procEdit(key, (x) => { if (!x.steps.some(s => s.id === id)) x.steps.push({ id, kind: x.steps.length ? 'other' : 'export', text: '', tool: '', who: '', minutes: null, checklist: [] }); });
        render();
        $(`[data-sid="${CSS.escape(id)}"] textarea`, view)?.focus();
        break;
      }
      case 'step-up': case 'step-down': {
        const dir = act === 'step-up' ? -1 : 1;
        procEdit(key, (x) => { const i = x.steps.findIndex(s => s.id === sid), j = i + dir; if (i >= 0 && j >= 0 && j < x.steps.length) [x.steps[i], x.steps[j]] = [x.steps[j], x.steps[i]]; });
        render();
        break;
      }
      case 'step-del': {
        const idx = p.steps.findIndex(s => s.id === sid), removed = JSON.parse(JSON.stringify(p.steps[idx]));
        procEdit(key, (x) => { x.steps = x.steps.filter(s => s.id !== sid); });
        render();
        toast(`Step ${idx + 1} deleted.`, { action: { label: 'Undo', fn: () => { procEdit(key, (x) => { if (!x.steps.some(s => s.id === removed.id)) x.steps.splice(Math.min(idx, x.steps.length), 0, removed); }); render(); } } });
        break;
      }
      case 'ck-add': { const cid = rid('ck'); stepEdit(key, sid, (s) => { if (!s.checklist.some(c => c.id === cid)) s.checklist.push({ id: cid, text: '' }); }); render(); $(`[data-cid="${CSS.escape(cid)}"] input`, view)?.focus(); break; }
      case 'ck-del': { const cid = btn.closest('[data-cid]')?.dataset.cid; stepEdit(key, sid, (s) => { s.checklist = s.checklist.filter(c => c.id !== cid); }); render(); break; }
      case 'preset': {
        const email = btn.closest('.acc-editor').dataset.email;
        if (btn.dataset.preset === 'map') setAccess(email, (a) => { a.pages = { myrole: false, team: false }; a.functions = []; a.processes = []; });
        else setAccess(email, (a) => { a.pages = { myrole: true, team: true }; a.functions = functionsList().map(f => f.key); a.processes = []; });
        render();
        break;
      }
      case 'add-person': addPerson(); break;
      case 'fn-add': {
        const order = Math.max(0, ...functionsList().map(f => f.order)) + 1;
        createEntity('functions', { key: rid('fn'), name: 'New function', color: '#6E7681', order });
        render();
        $$('.fn-row input[data-ffield="name"]', view).pop()?.select();
        break;
      }
      case 'fn-del': { const fk = btn.closest('[data-fn]').dataset.fn; await deleteEntity('functions', fk); render(); break; }
    }
  });

  $('#user')?.addEventListener('click', openHomePicker);
  addEventListener('hashchange', route);

  function start() {
    if (!location.hash || location.hash === '#' || location.hash === '#/') location.replace(homeHash());
    route();
  }

  return { start, route, refresh, applyChrome, flowCard, createProcessForFlow, upsertMe, describeRoute, canOpenRoute, openHomePicker };
}
