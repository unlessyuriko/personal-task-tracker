'use strict';
/* ==========================================================
   Lavo - personal task tracker (plain JS, data in localStorage)
   ========================================================== */

const KEY = 'lavo.v1';
const PW = { high: 0, medium: 1, low: 2 };
const PRI_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const PALETTE = [
  { dot: '#8B7CF6', fg: '#5B47C8', bg: '#EAE5FF' },
  { dot: '#F08BB4', fg: '#B0396F', bg: '#FFE9F2' },
  { dot: '#5CC8A8', fg: '#1F8A6A', bg: '#E0F7EF' },
  { dot: '#F0B955', fg: '#8A5E0B', bg: '#FFF2D9' },
  { dot: '#6FA8E8', fg: '#2F6FB5', bg: '#E3EFFC' }
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diffDays = (from, to) => Math.round((parseYmd(to) - parseYmd(from)) / 864e5);
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dayOf = (ts) => ymd(new Date(ts));
const fmtDate = (s) => parseYmd(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/* ---------- state ---------- */
const defaults = () => ({
  name: '',
  projects: [
    { name: 'Work', color: 0 },
    { name: 'Personal', color: 1 },
    { name: 'Learning', color: 2 }
  ],
  tasks: [],
  ui: { view: 'today', sort: 'grouped' }
});
let state = defaults();
let search = '';
let focusSkip = 0;
let storageOk = true;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = { ...defaults(), ...p, ui: { ...defaults().ui, ...(p.ui || {}) } };
    }
  } catch (e) { storageOk = false; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) {
    if (storageOk) { storageOk = false; toast('Could not save to this browser. Changes will be lost on reload.'); }
  }
}
function commit() { save(); render(); }

/* ---------- task helpers ---------- */
const projectOf = (t) => state.projects.find((p) => p.name === t.project);
const colorOf = (name) => PALETTE[(state.projects.find((p) => p.name === name) || { color: 0 }).color % PALETTE.length];

/** Priority shown for a task: manual choice wins, otherwise derived from the due date. */
function effPri(t) {
  if (t.manualPriority || !t.due) return t.priority || 'medium';
  const left = diffDays(todayStr(), t.due);
  return left <= 1 ? 'high' : left <= 3 ? 'medium' : 'low';
}
const cmpPri = (a, b) => PW[effPri(a)] - PW[effPri(b)];
const cmpDue = (a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0;

function dueLabel(t) {
  if (!t.due) return { text: 'No date', cls: 'none' };
  if (t.done) return { text: fmtDate(t.due), cls: '' };
  const d = diffDays(todayStr(), t.due);
  if (d < -1) return { text: `${-d}d overdue`, cls: 'over' };
  if (d === -1) return { text: '1d overdue', cls: 'over' };
  if (d === 0) return { text: 'Today', cls: '' };
  if (d === 1) return { text: 'Tomorrow', cls: '' };
  return { text: fmtDate(t.due), cls: '' };
}

/* ---------- views ---------- */
function viewTitle(v) {
  if (v === 'inbox') return 'Inbox';
  if (v === 'today') return 'Today';
  if (v === 'upcoming') return 'Upcoming';
  if (v === 'completed') return 'Completed';
  return v.slice(2);
}
function inScope(t, v, today) {
  if (v === 'completed') return t.done;
  if (v === 'inbox') return !t.project;
  if (v === 'today') return t.done ? !!t.completedAt && dayOf(t.completedAt) === today : !!t.due && t.due <= today;
  if (v === 'upcoming') return !!t.due && t.due > today;
  return t.project === v.slice(2);
}
function countOpen(v) {
  const today = todayStr();
  return state.tasks.filter((t) => !t.done && inScope(t, v, today)).length;
}

function sortOpen(list, mode) {
  const a = [...list];
  if (mode === 'priority') a.sort((x, y) => cmpPri(x, y) || cmpDue(x, y));
  else if (mode === 'date') a.sort((x, y) => cmpDue(x, y) || cmpPri(x, y));
  else if (mode === 'grouped') a.sort((x, y) => cmpPri(x, y));
  return a; // manual: array order
}

function buildGroups() {
  const today = todayStr();
  const v = state.ui.view;
  const mode = state.ui.sort;
  const q = search.trim().toLowerCase();
  let pool = state.tasks;
  if (q) pool = pool.filter((t) => t.title.toLowerCase().includes(q) || (t.project || '').toLowerCase().includes(q));
  else pool = pool.filter((t) => inScope(t, v, today));

  const open = pool.filter((t) => !t.done);
  const done = pool.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const groups = [];
  const dotGrey = '#9A94B8';

  if (v === 'completed' && !q) {
    if (done.length) groups.push({ label: 'Completed', dot: dotGrey, tasks: done, count: done.length });
    return groups;
  }
  if (!q && mode === 'grouped' && v === 'today') {
    const over = sortOpen(open.filter((t) => t.due < today), 'grouped');
    const now = sortOpen(open.filter((t) => t.due === today), 'grouped');
    if (over.length) groups.push({ label: 'Overdue', dot: 'var(--high)', tasks: over });
    if (now.length) groups.push({ label: 'Today', dot: 'var(--primary)', tasks: now });
  } else if (!q && mode === 'grouped' && v === 'upcoming') {
    const byDate = new Map();
    sortOpen(open, 'date').forEach((t) => { if (!byDate.has(t.due)) byDate.set(t.due, []); byDate.get(t.due).push(t); });
    byDate.forEach((tasks, d) => {
      const n = diffDays(today, d);
      groups.push({ label: n === 1 ? 'Tomorrow' : fmtDate(d), dot: 'var(--primary)', tasks });
    });
  } else if (open.length) {
    groups.push({ label: q ? 'Results' : 'To do', dot: 'var(--primary)', tasks: sortOpen(open, mode) });
  }
  if (done.length) groups.push({ label: 'Completed', dot: dotGrey, tasks: done });
  groups.forEach((g) => { g.count = g.tasks.length; });
  return groups;
}

/* ---------- rendering ---------- */
function greeting() {
  const h = new Date().getHours();
  const g = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  return state.name ? `${g}, ${state.name}` : g;
}

function render() {
  renderNav();
  renderHead();
  renderList();
  renderAside();
}

function renderNav() {
  const v = state.ui.view;
  $$('.nav[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v && !search));
  ['inbox', 'today', 'upcoming'].forEach((k) => {
    const c = countOpen(k);
    $(`[data-count="${k}"]`).textContent = c || '';
  });
  $('#projects').innerHTML = state.projects.map((p) => {
    const view = 'p:' + p.name;
    const c = countOpen(view);
    return `<button class="nav${v === view && !search ? ' active' : ''}" type="button" data-view="${esc(view)}"><span class="dot" style="background:${PALETTE[p.color % PALETTE.length].dot}"></span><span class="grow">${esc(p.name)}</span>${c ? `<span class="n">${c}</span>` : ''}</button>`;
  }).join('');
  $('#me-name').textContent = state.name || 'Set your name';
  $('#avatar').textContent = (state.name || '?').trim().charAt(0).toUpperCase() || '?';
}

function renderHead() {
  const v = state.ui.view;
  const now = new Date();
  $('#eyebrow').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) +
    ' · ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  $('#title').textContent = search ? `Results for "${search.trim()}"` : v === 'today' ? greeting() : viewTitle(v);
  $$('#sort-tabs .tab').forEach((b) => {
    const on = b.dataset.sort === state.ui.sort;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  const today = todayStr();
  $('#clear-completed').hidden = !(v === 'completed' && !search && state.tasks.some((t) => t.done));
  $('#delete-project').hidden = !(v.startsWith('p:') && !search);
  $('#list').classList.toggle('manual', state.ui.sort === 'manual');
  void today;
}

function rowHtml(t) {
  const pri = effPri(t);
  const due = dueLabel(t);
  const total = (t.subtasks || []).length;
  const doneSub = (t.subtasks || []).filter((s) => s.done).length;
  const proj = t.project ? `<span class="tag" style="color:${colorOf(t.project).fg};background:${colorOf(t.project).bg}">${esc(t.project)}</span>` : '';
  const draggable = state.ui.sort === 'manual' && !t.done && !search;
  return `<div class="task${t.done ? ' d' : ''}" data-id="${t.id}" tabindex="0"${draggable ? ' draggable="true"' : ''}>
    <span class="grip">${icon('grip')}</span>
    <button class="cb ${t.done ? 'done' : pri}" type="button" role="checkbox" aria-checked="${t.done}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}: ${esc(t.title)}">${icon('check')}</button>
    <div class="tt"><span class="title">${esc(t.title)}</span>${total ? `<small>${doneSub} of ${total} subtasks</small>` : ''}</div>
    <div class="c-proj">${proj}</div>
    <div class="due ${due.cls}">${t.due ? icon('cal') : ''}${esc(due.text)}</div>
    <div class="c-pri">${t.done ? '' : `<button class="pill p-${pri}" type="button" aria-label="Priority ${PRI_LABEL[pri]}, change">${PRI_LABEL[pri]}</button>`}</div>
    <button class="rowdel" type="button" aria-label="Delete: ${esc(t.title)}">${icon('trash')}</button>
  </div>`;
}

function renderList() {
  const groups = buildGroups();
  const list = $('#list');
  if (!groups.length) {
    const v = state.ui.view;
    let b = 'Nothing here yet', s = 'Add a task above to get started.';
    if (search) { b = 'No matches'; s = 'Try a different search.'; }
    else if (v === 'today') { b = 'You are all clear'; s = 'No tasks due today. Add one, or enjoy the calm.'; }
    else if (v === 'completed') { b = 'Nothing completed yet'; s = 'Finished tasks will show up here.'; }
    else if (v === 'upcoming') { b = 'Nothing scheduled'; s = 'Give a task a future date and it will appear here.'; }
    list.innerHTML = `<div class="empty"><div class="badge">${icon('sparkle')}</div><b>${b}</b><span>${s}</span></div>`;
    return;
  }
  list.innerHTML = groups.map((g) =>
    `<div class="gt"><span style="color:${g.dot};display:inline-flex">${icon('dot')}</span><b>${esc(g.label)}</b> &middot; ${g.count}</div>` +
    g.tasks.map(rowHtml).join('')
  ).join('');
}

/* ---------- aside: focus, progress, week ---------- */
/** Once the user has dragged tasks into their own order, the top open task is the focus; until then it is picked by priority and due date. */
function focusCandidates() {
  const open = state.tasks.filter((t) => !t.done);
  return state.ui.arranged ? open : open.sort((a, b) => cmpPri(a, b) || cmpDue(a, b));
}
function renderAside() {
  const cands = focusCandidates();
  const ft = cands.length ? cands[focusSkip % cands.length] : null;
  $('#focus-title').textContent = ft ? ft.title : state.tasks.length ? 'All done. Great work!' : 'Add a task to get started';
  $('#focus-label').textContent = !ft ? 'Main focus' : focusSkip % cands.length ? 'Up next' : state.ui.arranged ? 'Your top task - focus on this' : 'Focus now';
  if (ft) {
    const pri = effPri(ft), due = dueLabel(ft);
    $('#focus-meta').innerHTML = `<span class="pill p-${pri}">${PRI_LABEL[pri]}</span>` +
      (ft.project ? `<span class="hm">${esc(ft.project)}</span>` : '') +
      (ft.due ? `<span class="hm">${icon('cal')}${esc(due.text)}</span>` : '');
  } else $('#focus-meta').innerHTML = '';
  $('#hero').classList.toggle('empty', !ft);
  $('#focus-done').hidden = !ft;
  $('#focus-skip').disabled = cands.length < 2;

  const today = todayStr();
  const scope = state.tasks.filter((t) => inScope(t, 'today', today));
  const doneN = scope.filter((t) => t.done).length;
  const pct = scope.length ? Math.round((doneN / scope.length) * 100) : 0;
  $('#ring').style.setProperty('--p', pct);
  $('#ring-pct').textContent = pct + '%';
  $('#stat-text').textContent = scope.length ? `${doneN} of ${scope.length} tasks done today` : 'No tasks planned for today';

  const days = new Set(state.tasks.filter((t) => t.done && t.completedAt).map((t) => dayOf(t.completedAt)));
  let cur = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cur)) { streak++; cur = addDays(cur, -1); }
  $('#streak').innerHTML = streak ? `${icon('flame')} ${streak}-day streak` : '';

  const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - dow));
  const counts = week.map((d) => state.tasks.filter((t) => t.done && t.completedAt && dayOf(t.completedAt) === d).length);
  const max = Math.max(1, ...counts);
  $('#bars').innerHTML = counts.map((c, i) =>
    `<div class="${i === dow ? 't' : ''}${c === 0 ? ' z' : ''}" style="height:${Math.max(8, Math.round((c / max) * 100))}%" title="${fmtDate(week[i])}: ${c} completed"></div>`).join('');
  $('#bar-labels').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<span class="${i === dow ? 't' : ''}">${l}</span>`).join('');
}

/* ---------- focus timer ---------- */
const timer = { total: 1500, left: 1500, running: false, end: 0, id: null };
function paintTimer() {
  const m = pad(Math.floor(timer.left / 60)), s = pad(timer.left % 60);
  $('#timer').textContent = `${m}:${s}`;
  $('#timer-toggle').innerHTML = timer.running ? `${icon('pause')} Pause` : `${icon('play')} ${timer.left < timer.total && timer.left > 0 ? 'Resume' : 'Start focus'}`;
  document.title = timer.running ? `${m}:${s} - Lavo` : 'Lavo - Personal Task Tracker';
}
function tick() {
  timer.left = Math.max(0, Math.round((timer.end - Date.now()) / 1000));
  if (timer.left === 0) {
    stopTimer();
    timer.left = timer.total;
    toast('Focus session complete. Time for a short break.');
  }
  paintTimer();
}
function stopTimer() { timer.running = false; clearInterval(timer.id); }
function toggleTimer() {
  if (timer.running) { stopTimer(); }
  else {
    timer.end = Date.now() + timer.left * 1000;
    timer.running = true;
    timer.id = setInterval(tick, 250);
  }
  paintTimer();
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, undo) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Undo';
    b.addEventListener('click', () => { undo(); el.hidden = true; });
    el.appendChild(b);
  }
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

/* ---------- popup menu ---------- */
let menuEl = null;
function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  document.removeEventListener('mousedown', menuOutside, true);
  document.removeEventListener('keydown', menuKey, true);
}
function menuOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function menuKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = $$('.menu-item', menuEl);
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
}
function openMenu(anchor, items, onPick) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' :
    `<button type="button" role="menuitem" class="menu-item${it.active ? ' active' : ''}" data-i="${i}">${it.swatch ? `<span class="sw" style="background:${it.swatch}"></span>` : ''}${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, innerWidth - m.offsetWidth - 8);
  let top = r.bottom + 6;
  if (top + m.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 6);
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = top + 'px';
  m.addEventListener('click', (e) => {
    const b = e.target.closest('.menu-item');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    onPick(it.value);
  });
  menuEl = m;
  setTimeout(() => {
    document.addEventListener('mousedown', menuOutside, true);
    document.addEventListener('keydown', menuKey, true);
  }, 0);
  (m.querySelector('.active') || m.querySelector('.menu-item'))?.focus();
}

const priorityItems = (cur) => [
  { label: 'High', value: 'high', active: cur === 'high', swatch: 'var(--high)' },
  { label: 'Medium', value: 'medium', active: cur === 'medium', swatch: '#E0A23A' },
  { label: 'Low', value: 'low', active: cur === 'low', swatch: 'var(--low)' },
  { sep: true },
  { label: 'Auto (from due date)', value: null, active: !cur }
];

/* ---------- quick add ---------- */
const draft = { due: null, priority: null, project: null };

function nextWeekday(name) {
  const idx = WEEKDAYS.findIndex((w) => w.startsWith(name.slice(0, 3).toLowerCase()));
  const diff = ((idx - new Date().getDay() + 7) % 7) || 7;
  return addDays(todayStr(), diff);
}

/** Pulls "!high", "#Project" and simple date words out of the typed text. */
function parseQuick(text) {
  let title = text, priority = null, project = null, due = null;
  title = title.replace(/(^|\s)!(high|medium|med|low|h|m|l)\b/i, (m, sp, p) => { priority = { h: 'high', m: 'medium', l: 'low' }[p[0].toLowerCase()]; return sp; });
  title = title.replace(/(^|\s)#([\w-]+)/, (m, sp, n) => { project = n; return sp; });
  const t = todayStr();
  const rules = [
    [/\b(\d{4}-\d{2}-\d{2})\b/, (m) => (isNaN(parseYmd(m[1])) ? null : m[1])],
    [/\bnext week\b/i, () => addDays(t, 7)],
    [/\bin (\d{1,3}) days?\b/i, (m) => addDays(t, +m[1])],
    [/\b(?:tomorrow|tmrw|tmr)\b/i, () => addDays(t, 1)],
    [/\btoday\b/i, () => t],
    [/\b(?:(?:on|by|due) )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i, (m) => nextWeekday(m[1])]
  ];
  for (const [re, fn] of rules) {
    const m = title.match(re);
    if (m) {
      const val = fn(m);
      if (val) { due = val; title = title.replace(re, ' '); break; }
    }
  }
  title = title.replace(/\s{2,}/g, ' ').trim();
  return { title: title || text.trim(), priority, project, due };
}

function resolveProject(name) {
  if (!name) return null;
  const hit = state.projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  return hit ? hit.name : null;
}

function composerValues() {
  const p = parseQuick($('#task-input').value);
  return {
    title: p.title,
    due: draft.due ?? p.due,
    priority: draft.priority ?? p.priority,
    projectName: draft.project ?? p.project
  };
}

function paintChips() {
  const v = composerValues();
  const set = (id, on, label) => { const b = $(id); b.classList.toggle('set', on); $('span', b).textContent = label; };
  set('#chip-date', !!v.due, v.due ? (diffDays(todayStr(), v.due) === 0 ? 'Today' : diffDays(todayStr(), v.due) === 1 ? 'Tomorrow' : fmtDate(v.due)) : 'Date');
  set('#chip-pri', !!v.priority, v.priority ? PRI_LABEL[v.priority] : 'Priority');
  set('#chip-proj', !!v.projectName, v.projectName || 'Project');
}

function addTaskFromComposer() {
  const raw = $('#task-input').value.trim();
  if (!raw) return;
  const v = composerValues();
  let project = resolveProject(v.projectName);
  if (!project && v.projectName) {
    const name = v.projectName.charAt(0).toUpperCase() + v.projectName.slice(1);
    state.projects.push({ name, color: state.projects.length % PALETTE.length });
    project = name;
  }
  const view = state.ui.view;
  if (!project && view.startsWith('p:')) project = view.slice(2);
  let due = v.due;
  if (!due && view === 'today' && !search) due = todayStr();
  state.tasks.push({
    id: uid(), title: v.title, done: false,
    priority: v.priority || 'medium', manualPriority: !!v.priority,
    due: due || null, project: project || null, subtasks: [], createdAt: Date.now()
  });
  $('#task-input').value = '';
  draft.due = draft.priority = draft.project = null;
  paintChips();
  commit();
}

/* ---------- task actions ---------- */
const byId = (id) => state.tasks.find((t) => t.id === id);

function toggleDone(id) {
  const t = byId(id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) t.completedAt = Date.now(); else delete t.completedAt;
  commit();
}
function deleteTask(id) {
  const i = state.tasks.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [t] = state.tasks.splice(i, 1);
  commit();
  toast('Task deleted', () => { state.tasks.splice(Math.min(i, state.tasks.length), 0, t); commit(); });
}

/* ---------- list events (delegated) ---------- */
const listEl = $('#list');
listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.task');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.cb')) return toggleDone(id);
  if (e.target.closest('.rowdel')) return deleteTask(id);
  const pill = e.target.closest('.pill');
  if (pill) {
    const t = byId(id);
    return openMenu(pill, priorityItems(t.manualPriority ? t.priority : null), (val) => {
      if (val) { t.priority = val; t.manualPriority = true; } else { t.manualPriority = false; }
      commit();
    });
  }
  openDetail(id);
});

let dragId = null;
listEl.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.task');
  if (!row) return;
  dragId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  setTimeout(() => row.classList.add('dragging'), 0);
});
listEl.addEventListener('dragend', () => {
  dragId = null;
  $$('.task', listEl).forEach((r) => r.classList.remove('dragging', 'drop-before', 'drop-after'));
});
listEl.addEventListener('dragover', (e) => {
  const row = e.target.closest('.task');
  if (!row || !dragId || row.dataset.id === dragId || row.classList.contains('d')) return;
  e.preventDefault();
  const r = row.getBoundingClientRect();
  const after = e.clientY > r.top + r.height / 2;
  $$('.task', listEl).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  row.classList.add(after ? 'drop-after' : 'drop-before');
});
listEl.addEventListener('drop', (e) => {
  const row = e.target.closest('.task');
  if (!row || !dragId) return;
  e.preventDefault();
  const after = row.classList.contains('drop-after');
  const src = byId(dragId), dst = byId(row.dataset.id);
  if (!src || !dst || src === dst) return;
  state.tasks.splice(state.tasks.indexOf(src), 1);
  state.tasks.splice(state.tasks.indexOf(dst) + (after ? 1 : 0), 0, src);
  state.ui.arranged = true; focusSkip = 0;
  commit();
});
listEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('task')) openDetail(e.target.dataset.id);
});

/* ---------- detail dialog ---------- */
const detail = $('#detail');
let detailId = null;

function openDetail(id) {
  detailId = id;
  paintDetail();
  if (!detail.open) detail.showModal();
}
function paintDetail() {
  const t = byId(detailId);
  if (!t) { detail.close(); return; }
  const subs = t.subtasks || [];
  detail.innerHTML = `<div class="dlg">
    <div class="dlg-head">
      <input class="dlg-title" id="d-title" value="${esc(t.title)}" aria-label="Task title">
      <button class="icon-btn" type="button" id="d-close" aria-label="Close">${icon('x')}</button>
    </div>
    <div class="fields">
      <label class="field"><span class="flabel">Project</span>
        <select id="d-project"><option value="">No project</option>${state.projects.map((p) => `<option value="${esc(p.name)}"${t.project === p.name ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="flabel">Due date</span><input type="date" id="d-due" value="${t.due || ''}"></label>
    </div>
    <div class="field"><span class="flabel">Priority</span>
      <div class="seg" role="group" aria-label="Priority">
        ${[[null, 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([v, l]) => `<button type="button" data-pri="${v || ''}" class="${(t.manualPriority ? t.priority : null) === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <span class="hint">Auto raises priority as the due date gets closer.</span>
    </div>
    <div class="field"><span class="flabel">Subtasks${subs.length ? ` (${subs.filter((s) => s.done).length}/${subs.length})` : ''}</span>
      <ul class="subs">${subs.map((s) => `<li class="sub${s.done ? ' d' : ''}" data-sid="${s.id}"><button class="cb ${s.done ? 'done' : ''}" type="button" role="checkbox" aria-checked="${s.done}" aria-label="Toggle subtask">${icon('check')}</button><span>${esc(s.text)}</span><button class="icon-btn" type="button" data-del-sub aria-label="Remove subtask">${icon('x')}</button></li>`).join('')}</ul>
      <input class="input" id="d-sub" placeholder="Add a subtask and press Enter" autocomplete="off">
    </div>
    <div class="dlg-foot">
      <button class="btn danger-ghost" type="button" id="d-delete">Delete task</button>
      <div class="right"><button class="btn" type="button" id="d-done">Done</button></div>
    </div>
  </div>`;
}

detail.addEventListener('click', (e) => {
  const t = byId(detailId);
  if (e.target === detail) return detail.close();
  if (!t) return;
  if (e.target.closest('#d-close') || e.target.closest('#d-done')) return detail.close();
  if (e.target.closest('#d-delete')) { detail.close(); return deleteTask(t.id); }
  const seg = e.target.closest('[data-pri]');
  if (seg) {
    const v = seg.dataset.pri;
    if (v) { t.priority = v; t.manualPriority = true; } else { t.manualPriority = false; }
    save(); paintDetail(); render(); return;
  }
  const sub = e.target.closest('.sub');
  if (sub) {
    const s = t.subtasks.find((x) => x.id === sub.dataset.sid);
    if (e.target.closest('[data-del-sub]')) t.subtasks = t.subtasks.filter((x) => x !== s);
    else if (e.target.closest('.cb') && s) s.done = !s.done;
    else return;
    save(); paintDetail(); render();
  }
});
detail.addEventListener('input', (e) => {
  const t = byId(detailId);
  if (!t) return;
  if (e.target.id === 'd-title' && e.target.value.trim()) { t.title = e.target.value.trim(); save(); render(); }
});
detail.addEventListener('change', (e) => {
  const t = byId(detailId);
  if (!t) return;
  if (e.target.id === 'd-project') { t.project = e.target.value || null; save(); render(); }
  if (e.target.id === 'd-due') { t.due = e.target.value || null; save(); render(); }
});
detail.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'd-sub') {
    e.preventDefault();
    const text = e.target.value.trim();
    const t = byId(detailId);
    if (!text || !t) return;
    (t.subtasks = t.subtasks || []).push({ id: uid(), text, done: false });
    save(); paintDetail(); render();
    $('#d-sub', detail).focus();
  }
});
detail.addEventListener('close', () => {
  const t = byId(detailId);
  if (t && !t.title.trim()) t.title = 'Untitled task';
  detailId = null;
  save(); render();
});

/* ---------- settings, backup ---------- */
const settings = $('#settings');
function openSettings() {
  settings.innerHTML = `<div class="dlg">
    <div class="dlg-head"><h2 style="flex:1;font-size:18px;padding:6px 8px">Settings</h2><button class="icon-btn" type="button" id="s-close" aria-label="Close">${icon('x')}</button></div>
    <div class="field"><label class="flabel" for="s-name">Your name</label>
      <input class="input" id="s-name" value="${esc(state.name)}" placeholder="Shown in your greeting" autocomplete="off" maxlength="40"></div>
    <div class="field"><span class="flabel">Backup</span>
      <span class="hint">Your tasks live only in this browser. Export a file to back them up or move to another device. Backups from the old extension can be imported too.</span>
      <div class="row-btns"><button class="btn ghost" type="button" id="s-export">Export data</button><button class="btn ghost" type="button" id="s-import">Import data</button><input type="file" id="s-file" accept="application/json,.json" hidden></div>
      <span class="hint" id="s-msg" role="status"></span></div>
    <div class="dlg-foot"><button class="btn danger-ghost" type="button" id="s-clear">Delete all data</button><div class="right"><button class="btn" type="button" id="s-save">Save</button></div></div>
  </div>`;
  settings.showModal();
  $('#s-name').focus();
}
const sMsg = (m) => { const el = $('#s-msg'); if (el) el.textContent = m; };

settings.addEventListener('click', (e) => {
  if (e.target === settings) return settings.close();
  if (e.target.closest('#s-close')) return settings.close();
  if (e.target.closest('#s-save')) {
    state.name = $('#s-name').value.trim();
    commit(); return settings.close();
  }
  if (e.target.closest('#s-export')) return exportData();
  if (e.target.closest('#s-import')) return $('#s-file').click();
  if (e.target.closest('#s-clear')) {
    if (confirm('Delete all tasks, projects and settings from this browser? This cannot be undone.')) {
      state = defaults(); commit(); settings.close(); toast('All data deleted');
    }
  }
});
settings.addEventListener('change', (e) => {
  if (e.target.id === 's-file' && e.target.files[0]) importData(e.target.files[0]);
});
settings.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 's-name') $('#s-save').click(); });

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'lavo', version: 1, exportedAt: new Date().toISOString(), name: state.name, projects: state.projects, tasks: state.tasks }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lavo-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  sMsg('Backup downloaded.');
}

/** Accepts Lavo backups and the old extension's backups (text/completed/dueDate fields). */
function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  const title = String(t.title ?? t.text ?? '').trim();
  if (!title) return null;
  const done = !!(t.done ?? t.completed);
  const pri = PW[t.priority] !== undefined ? t.priority : 'medium';
  const out = {
    id: String(t.id || uid()), title, done, priority: pri,
    manualPriority: !!t.manualPriority,
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || t.dueDate || '') ? (t.due || t.dueDate) : null,
    project: t.project ? String(t.project) : null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s) => s && s.text).map((s) => ({ id: String(s.id || uid()), text: String(s.text), done: !!s.done })) : [],
    createdAt: Number(t.createdAt) || Date.now()
  };
  if (done) out.completedAt = Number(t.completedAt) || out.createdAt;
  return out;
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const src = d && typeof d.data === 'object' ? d.data : d;
      if (!src || !Array.isArray(src.tasks)) throw new Error('bad');
      const tasks = src.tasks.map(normalizeTask).filter(Boolean);
      if (!confirm(`Import ${tasks.length} tasks? This replaces your current tasks.`)) return;
      let projects = Array.isArray(src.projects) ? src.projects.filter((p) => p && p.name).map((p, i) => ({ name: String(p.name), color: Number.isInteger(p.color) ? p.color : i })) : state.projects;
      tasks.forEach((t) => { if (t.project && !projects.some((p) => p.name === t.project)) projects.push({ name: t.project, color: projects.length % PALETTE.length }); });
      state.tasks = tasks; state.projects = projects;
      if (typeof src.displayName === 'string' && !state.name) state.name = src.displayName;
      if (typeof src.name === 'string' && src.name) state.name = src.name;
      commit(); sMsg(`Imported ${tasks.length} tasks.`);
    } catch (err) { sMsg('That file is not a valid backup.'); }
  };
  r.onerror = () => sMsg('Could not read that file.');
  r.readAsText(file);
}

/* ---------- wiring ---------- */
document.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav[data-view]');
  if (nav) { state.ui.view = nav.dataset.view; search = ''; $('#search').value = ''; commit(); }
});
$('#nav-quick').addEventListener('click', () => $('#task-input').focus());
$('#open-settings').addEventListener('click', openSettings);
$('#sort-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) { state.ui.sort = b.dataset.sort; commit(); }
});
$('#clear-completed').addEventListener('click', () => {
  const gone = state.tasks.filter((t) => t.done);
  state.tasks = state.tasks.filter((t) => !t.done);
  commit();
  toast(`${gone.length} completed task${gone.length === 1 ? '' : 's'} cleared`, () => { state.tasks.push(...gone); commit(); });
});
$('#delete-project').addEventListener('click', () => {
  const name = state.ui.view.slice(2);
  const n = state.tasks.filter((t) => t.project === name).length;
  if (!confirm(`Delete project "${name}"? ${n} task${n === 1 ? '' : 's'} will move to Inbox.`)) return;
  state.tasks.forEach((t) => { if (t.project === name) t.project = null; });
  state.projects = state.projects.filter((p) => p.name !== name);
  state.ui.view = 'inbox';
  commit();
});

$('#add-project').addEventListener('click', () => {
  if ($('.proj-input')) return $('.proj-input').focus();
  const inp = document.createElement('input');
  inp.className = 'proj-input'; inp.placeholder = 'Project name'; inp.maxLength = 24; inp.setAttribute('aria-label', 'New project name');
  $('#projects').appendChild(inp);
  inp.focus();
  let finished = false;
  const finish = (ok) => {
    if (finished) return; finished = true;
    const name = inp.value.trim();
    inp.remove();
    if (ok && name && !state.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      state.projects.push({ name, color: state.projects.length % PALETTE.length });
      state.ui.view = 'p:' + name;
    }
    commit();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
});

$('#search').addEventListener('input', (e) => { search = e.target.value; render(); });
$('#search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; search = ''; e.target.blur(); render(); } });

$('#composer').addEventListener('submit', (e) => { e.preventDefault(); addTaskFromComposer(); });
$('#task-input').addEventListener('input', paintChips);
$('#task-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur(); });

$('#chip-date').addEventListener('click', (e) => {
  const cur = composerValues().due, t = todayStr();
  openMenu(e.currentTarget, [
    { label: 'Today', value: t, active: cur === t },
    { label: 'Tomorrow', value: addDays(t, 1), active: cur === addDays(t, 1) },
    { label: 'Next week', value: addDays(t, 7), active: cur === addDays(t, 7) },
    { label: 'Pick a date...', value: 'pick' },
    { sep: true },
    { label: 'No date', value: '' }
  ], (v) => {
    if (v === 'pick') {
      const p = $('#date-pick');
      p.value = cur || '';
      try { p.showPicker(); } catch (err) { p.focus(); p.click(); }
      return;
    }
    draft.due = v || null;
    if (!v) { /* explicit no date: also ignore words typed */ draft.due = null; }
    paintChips(); $('#task-input').focus();
  });
});
$('#date-pick').addEventListener('change', (e) => { draft.due = e.target.value || null; paintChips(); $('#task-input').focus(); });
$('#chip-pri').addEventListener('click', (e) => {
  openMenu(e.currentTarget, priorityItems(composerValues().priority), (v) => { draft.priority = v; paintChips(); $('#task-input').focus(); });
});
$('#chip-proj').addEventListener('click', (e) => {
  const cur = resolveProject(composerValues().projectName);
  openMenu(e.currentTarget, [
    { label: 'No project', value: null, active: !cur },
    ...state.projects.map((p) => ({ label: p.name, value: p.name, active: cur === p.name, swatch: PALETTE[p.color % PALETTE.length].dot }))
  ], (v) => { draft.project = v; paintChips(); $('#task-input').focus(); });
});

$('#timer-toggle').addEventListener('click', toggleTimer);
$('#timer-reset').addEventListener('click', () => { stopTimer(); timer.left = timer.total; paintTimer(); });
$('#focus-skip').addEventListener('click', () => { focusSkip++; renderAside(); });
$('#focus-done').addEventListener('click', () => {
  const cands = focusCandidates();
  if (cands.length) { const t = cands[focusSkip % cands.length]; focusSkip = 0; toggleDone(t.id); }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target;
  const typing = el.matches && el.matches('input,textarea,select,[contenteditable]');
  if (typing || document.querySelector('dialog[open]')) return;
  if (e.key === 'q' || e.key === 'Q' || e.key === 'n') { e.preventDefault(); $('#task-input').focus(); }
  else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
});

/* ---------- init ---------- */
load();
render();
paintChips();
paintTimer();
setInterval(() => { renderHead(); renderAside(); }, 60000);
