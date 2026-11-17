const VERSION = '0.2.0';
const STORE_KEY = 'habits.v1';
const CELL = 14;
const GAP = 3;
const UNIT = 'lb';
const HOUR = 3600e3;
const FAST_GOALS = [12, 14, 16, 18, 20, 24];
const RANGES = { '1M': 30, '3M': 91, '1Y': 365, All: Infinity };
const ROUTINES = {
  routine: { tab: 'morning', title: 'Morning routine' },
  evening: { tab: 'evening', title: 'Evening routine' },
};

const emptyState = () => ({ items: [], log: {}, weights: {}, fasts: [], fastGoal: 16 });

const view = document.getElementById('view');
let state = load();
let editing = false;
let renderedDay = null;
let weightRange = '3M';
let chartPoints = [];

document.documentElement.style.setProperty('--cell', `${CELL}px`);
document.documentElement.style.setProperty('--gap', `${GAP}px`);

function normalize(s) {
  if (!s || !Array.isArray(s.items) || typeof s.log !== 'object' || !s.log) return null;
  return { ...emptyState(), ...s };
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORE_KEY))) || emptyState();
  } catch {
    return emptyState();
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date());
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const parseKey = k => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtDay = k => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtW = w => w.toFixed(1);
const fmtClock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};
const fmtHours = ms => `${Math.floor(ms / HOUR)}h ${pad(Math.floor(ms / 60000) % 60)}m`;
const hhmm = ts => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function fmtWhen(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return keyOf(d) === todayKey() ? time : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const contentWidth = () => Math.min(window.innerWidth, 560) - 40;

const itemsOf = kind => state.items.filter(i => i.kind === kind);
const isDone = (id, k) => !!state.log[k]?.[id];

function toggle(id, k) {
  const day = (state.log[k] ||= {});
  if (day[id]) delete day[id];
  else day[id] = 1;
  if (!Object.keys(day).length) delete state.log[k];
  save();
}

function move(item, dir) {
  const same = itemsOf(item.kind);
  const target = same[same.indexOf(item) + dir];
  if (!target) return;
  const a = state.items.indexOf(item);
  const b = state.items.indexOf(target);
  [state.items[a], state.items[b]] = [state.items[b], state.items[a]];
  save();
}

function remove(id) {
  state.items = state.items.filter(i => i.id !== id);
  for (const k in state.log) {
    delete state.log[k][id];
    if (!Object.keys(state.log[k]).length) delete state.log[k];
  }
  save();
}

// A streak survives until the end of today, so an unchecked today counts from yesterday.
function streakWhile(test) {
  let d = new Date();
  if (!test(keyOf(d))) d = addDays(d, -1);
  let n = 0;
  while (test(keyOf(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

const habitStreak = id => streakWhile(k => isDone(id, k));

function bestStreak(item) {
  const end = todayKey();
  let best = 0;
  let run = 0;
  for (let d = parseKey(item.created); keyOf(d) <= end; d = addDays(d, 1)) {
    run = isDone(item.id, keyOf(d)) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function routineProgress(kind, k) {
  const items = itemsOf(kind).filter(i => i.created <= k);
  return { done: items.filter(i => isDone(i.id, k)).length, total: items.length };
}

const routineStreak = kind => streakWhile(k => {
  const p = routineProgress(kind, k);
  return p.total > 0 && p.done === p.total;
});

function weightEntries(range = 'All') {
  const all = Object.entries(state.weights)
    .map(([k, w]) => ({ k, w }))
    .sort((a, b) => (a.k < b.k ? -1 : 1));
  if (range === 'All') return all;
  const cutoff = keyOf(addDays(new Date(), -RANGES[range]));
  return all.filter(e => e.k >= cutoff);
}

// Latest entry vs the most recent entry at least `days` before it.
function weightChange(days) {
  const all = weightEntries();
  const last = all.at(-1);
  if (!last) return null;
  const cutoff = keyOf(addDays(parseKey(last.k), -days));
  const base = all.findLast(e => e.k <= cutoff);
  if (!base) return null;
  const diff = last.w - base.w;
  return { diff, pct: (diff / base.w) * 100, from: base.k };
}

function setWeight(k, w) {
  state.weights[k] = Math.round(w * 10) / 10;
  save();
}

function deleteWeight(k) {
  delete state.weights[k];
  save();
}

const activeFast = () => {
  const f = state.fasts.at(-1);
  return f && !f.end ? f : null;
};

function startFast() {
  if (activeFast()) return;
  state.fasts.push({ start: Date.now(), goal: state.fastGoal });
  save();
}

function endFast() {
  const f = activeFast();
  if (!f) return;
  f.end = Date.now();
  save();
}

// The picker only gives a time of day; a time later than now means it started yesterday.
function setFastStart(time) {
  const f = activeFast();
  const [h, m] = time.split(':').map(Number);
  if (!f || Number.isNaN(h) || Number.isNaN(m)) return;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  f.start = d.getTime();
  save();
}

function gridDays() {
  const weeks = Math.max(4, Math.floor((contentWidth() + GAP) / (CELL + GAP)));
  const now = new Date();
  const end = addDays(now, 6 - now.getDay());
  const days = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) days.push(keyOf(addDays(end, -i)));
  return days;
}

function habitCell(item, k, t) {
  if (k > t) return '<span class="cell future"></span>';
  let cls;
  if (isDone(item.id, k)) cls = 'done';
  else if (k === t) cls = 'today';
  else if (k < item.created) cls = 'none';
  else cls = 'miss';
  return `<span class="cell ${cls}" data-action="cell" data-id="${item.id}" data-k="${k}"></span>`;
}

function routineCell(kind, k, t) {
  if (k > t) return '<span class="cell future"></span>';
  const { done, total } = routineProgress(kind, k);
  let cls;
  if (!total) cls = 'none';
  else if (done === total) cls = 'done';
  else if (done > 0) cls = 'part';
  else if (k === t) cls = 'today';
  else cls = 'miss';
  return `<span class="cell ${cls}"></span>`;
}

const grid = (days, cellFn) => `<div class="grid">${days.map(cellFn).join('')}</div>`;

const header = (title, sub, editable) => `
  <header>
    <div>
      <h1>${title}</h1>
      ${sub ? `<p class="sub">${sub}</p>` : ''}
    </div>
    ${editable ? `<button class="link" data-action="edit">${editing ? 'Done' : 'Edit'}</button>` : ''}
  </header>`;

const addForm = (kind, placeholder) => `
  <form class="add" data-kind="${kind}">
    <input name="name" placeholder="${placeholder}" autocomplete="off" enterkeyhint="done">
    <button>Add</button>
  </form>`;

const deleteBtn = attrs => `<button class="icon danger" ${attrs} aria-label="Delete">✕</button>`;

function checklist(kind) {
  const items = itemsOf(kind);
  const t = todayKey();
  if (!items.length) return '';
  return `<ul class="list list-${kind === 'habit' ? 'habit' : 'routine'}">${items.map(it => {
    const streak = kind === 'habit' ? habitStreak(it.id) : 0;
    return `
      <li class="row ${isDone(it.id, t) ? 'done' : ''}" data-action="toggle" data-id="${it.id}">
        <span class="check"></span>
        <span class="name">${esc(it.name)}</span>
        ${editing ? `
          <span class="edit-btns">
            <button class="icon" data-action="up" data-id="${it.id}" aria-label="Move up">↑</button>
            <button class="icon" data-action="down" data-id="${it.id}" aria-label="Move down">↓</button>
            <button class="icon" data-action="rename" data-id="${it.id}" aria-label="Rename">✎</button>
            ${deleteBtn(`data-action="delete" data-id="${it.id}"`)}
          </span>` : streak ? `<span class="streak">${streak}d</span>` : ''}
      </li>`;
  }).join('')}</ul>`;
}

const section = (title, meta, body) => `
  <section class="hist">
    <div class="hist-head"><h2>${esc(title)}</h2><span class="meta">${meta}</span></div>
    ${body}
  </section>`;

function routinePage(kind) {
  const r = routineProgress(kind, todayKey());
  const sub = !r.total ? `Add the steps you do each ${kind === 'evening' ? 'evening' : 'morning'}.`
    : r.done === r.total ? 'All done.' : `${r.done} of ${r.total}`;
  return header(ROUTINES[kind].title, sub, true)
    + (r.total ? `<div class="bar"><span style="width:${(100 * r.done) / r.total}%"></span></div>` : '')
    + checklist(kind)
    + addForm(kind, 'New step');
}

function trendTile(label, change) {
  if (!change) {
    return `<div class="tile"><span class="tile-label">${label}</span><span class="trend">—</span><span class="tile-sub">Not enough data</span></div>`;
  }
  const { diff, pct, from } = change;
  const dir = diff < 0 ? 'down' : diff > 0 ? 'up' : 'flat';
  const arrow = { down: '↓', up: '↑', flat: '' }[dir];
  return `
    <div class="tile">
      <span class="tile-label">${label}</span>
      <span class="trend ${dir}">${arrow} ${fmtW(Math.abs(diff))} ${UNIT}</span>
      <span class="tile-sub"><span class="trend ${dir}">${Math.abs(pct).toFixed(1)}%</span> since ${fmtDay(from)}</span>
    </div>`;
}

const readout = p => `<strong>${fmtW(p.w)} ${UNIT}</strong> <span>${fmtDay(p.k)}</span>`;

function weightChart(entries) {
  chartPoints = [];
  if (entries.length < 2) {
    return `<p class="empty">${entries.length ? 'Log another day to see a trend.' : 'No entries in this range.'}</p>`;
  }
  const W = contentWidth();
  const H = 180;
  const L = 40;
  const R = 8;
  const T = 10;
  const B = 24;
  const t0 = parseKey(entries[0].k).getTime();
  const span = parseKey(entries.at(-1).k).getTime() - t0;
  const ws = entries.map(e => e.w);
  const min = Math.min(...ws);
  const max = Math.max(...ws);
  const padY = Math.max((max - min) * 0.15, 0.5);
  const lo = min - padY;
  const hi = max + padY;
  const x = k => L + ((parseKey(k).getTime() - t0) / span) * (W - L - R);
  const y = w => T + ((hi - w) / (hi - lo)) * (H - T - B);
  chartPoints = entries.map(e => ({ ...e, x: x(e.k), y: y(e.w) }));

  const line = chartPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const last = chartPoints.at(-1);
  const area = `${line}L${last.x.toFixed(1)},${H - B}L${L},${H - B}Z`;
  const ticks = [...new Set([max, (max + min) / 2, min])];
  const dots = chartPoints.length <= 20 ? chartPoints : [last];

  return `
    <div class="chart">
      <div class="readout" id="chart-readout">${readout(last)}</div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Weight over time">
        ${ticks.map(v => `
          <line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line>
          <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtW(v)}</text>`).join('')}
        <text class="axis" x="${L}" y="${H - 6}">${fmtDay(entries[0].k)}</text>
        <text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDay(last.k)}</text>
        <path class="area" d="${area}"></path>
        <path class="line" d="${line}"></path>
        ${dots.map(p => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4"></circle>`).join('')}
        <g class="crosshair">
          <line y1="${T}" y2="${H - B}"></line>
          <circle r="5"></circle>
        </g>
      </svg>
    </div>`;
}

function scrub(e) {
  const svg = e.target.closest?.('.chart svg');
  if (!svg || !chartPoints.length) return;
  const box = svg.getBoundingClientRect();
  const px = ((e.clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
  const p = chartPoints.reduce((a, b) => (Math.abs(b.x - px) < Math.abs(a.x - px) ? b : a));
  const g = svg.querySelector('.crosshair');
  g.style.visibility = 'visible';
  const ln = g.querySelector('line');
  ln.setAttribute('x1', p.x);
  ln.setAttribute('x2', p.x);
  g.querySelector('circle').setAttribute('cx', p.x);
  g.querySelector('circle').setAttribute('cy', p.y);
  document.getElementById('chart-readout').innerHTML = readout(p);
}

function unscrub() {
  const g = view.querySelector('.crosshair');
  if (!g || !chartPoints.length) return;
  g.style.visibility = 'hidden';
  document.getElementById('chart-readout').innerHTML = readout(chartPoints.at(-1));
}

function fastCard() {
  const f = activeFast();
  if (!f) {
    const last = state.fasts.at(-1);
    const lastMs = last ? last.end - last.start : 0;
    return `
      <section class="card">
        <div class="card-head">
          <h2>Fasting</h2>
          ${last ? `<span class="meta">Last ${fmtHours(lastMs)}${lastMs >= last.goal * HOUR ? ' ✓' : ''}</span>` : ''}
        </div>
        <div class="chips">${FAST_GOALS.map(h => `
          <button class="chip ${h === state.fastGoal ? 'active' : ''}" data-action="goal" data-h="${h}">${h}h</button>`).join('')}
        </div>
        <button class="btn" data-action="start-fast">Start ${state.fastGoal}h fast</button>
      </section>`;
  }
  const elapsed = Date.now() - f.start;
  const goal = f.goal * HOUR;
  return `
    <section class="card">
      <div class="card-head"><h2>Fasting</h2><span class="meta">Goal ${f.goal}h</span></div>
      <div class="timer ${elapsed >= goal ? 'met' : ''}" data-fast-timer>${fmtClock(elapsed)}</div>
      <div class="bar"><span data-fast-bar style="width:${Math.min(100, (100 * elapsed) / goal)}%"></span></div>
      <div class="fast-meta">
        <label>Started <input type="time" data-fast-start value="${hhmm(f.start)}"></label>
        <span>Ends ${fmtWhen(f.start + goal)}</span>
      </div>
      <button class="btn secondary" data-action="end-fast">End fast</button>
    </section>`;
}

function weightLog(entries) {
  if (!entries.length) return '';
  return `
    <h2 class="list-title">Entries</h2>
    <ul class="list">${entries.slice(-10).reverse().map(e => `
      <li class="row static">
        <span class="name">${fmtDay(e.k)}</span>
        <span class="streak">${fmtW(e.w)} ${UNIT}</span>
        ${editing ? deleteBtn(`data-action="delete-weight" data-k="${e.k}"`) : ''}
      </li>`).join('')}
    </ul>`;
}

function fastLog() {
  const done = state.fasts.map((f, i) => ({ ...f, i })).filter(f => f.end);
  if (!done.length) return '';
  return `
    <h2 class="list-title">Fasts</h2>
    <ul class="list">${done.slice(-5).reverse().map(f => `
      <li class="row static">
        <span class="name">${fmtDay(keyOf(new Date(f.start)))}</span>
        <span class="streak">${fmtHours(f.end - f.start)}${f.end - f.start >= f.goal * HOUR ? ' ✓' : ''}</span>
        ${editing ? deleteBtn(`data-action="delete-fast" data-i="${f.i}"`) : ''}
      </li>`).join('')}
    </ul>`;
}

const pages = {
  today() {
    const t = todayKey();
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const summaries = Object.entries(ROUTINES).map(([kind, { tab, title }]) => {
      const r = routineProgress(kind, t);
      return r.total ? `
        <a class="summary ${r.done === r.total ? 'complete' : ''}" href="#${tab}">
          <span>${title}</span><span class="count">${r.done}/${r.total}</span>
        </a>` : '';
    }).join('');
    const fast = activeFast();
    return header('Today', date, true)
      + summaries
      + (fast ? `
        <a class="summary" href="#weight">
          <span>Fasting</span><span class="count" data-fast-timer>${fmtClock(Date.now() - fast.start)}</span>
        </a>` : '')
      + (itemsOf('habit').length ? checklist('habit') : '<p class="empty">Add a habit to start tracking it.</p>')
      + addForm('habit', 'New habit');
  },

  morning: () => routinePage('routine'),
  evening: () => routinePage('evening'),

  weight() {
    const all = weightEntries();
    const last = all.at(-1);
    const editable = all.length > 0 || state.fasts.some(f => f.end);
    return header('Weight', last ? `${fmtW(last.w)} ${UNIT} · ${fmtDay(last.k)}` : 'Log your weight to start.', editable)
      + fastCard()
      + `
        <form class="add" data-kind="weight">
          <input name="weight" type="number" inputmode="decimal" step="0.1" min="1" placeholder="${last ? fmtW(last.w) : UNIT}">
          <input name="date" type="date" value="${todayKey()}" max="${todayKey()}">
          <button>Save</button>
        </form>`
      + (all.length >= 2 ? `<div class="tiles">${trendTile('Week', weightChange(7))}${trendTile('Month', weightChange(30))}</div>` : '')
      + (all.length ? `
        <div class="chips ranges">${Object.keys(RANGES).map(r => `
          <button class="chip ${r === weightRange ? 'active' : ''}" data-action="range" data-range="${r}">${r}</button>`).join('')}
        </div>
        ${weightChart(weightEntries(weightRange))}` : '')
      + weightLog(all)
      + fastLog();
  },

  history() {
    const t = todayKey();
    const days = gridDays();
    const habits = itemsOf('habit');
    const any = state.items.length > 0;
    let html = header('History', any ? 'Tap a square to fix a past day.' : '');

    if (!any) html += '<p class="empty">Nothing to show yet.</p>';

    html += habits.map(it => section(
      it.name,
      `${habitStreak(it.id)} day streak · best ${bestStreak(it)}`,
      grid(days, k => habitCell(it, k, t))
    )).join('');

    for (const [kind, { title }] of Object.entries(ROUTINES)) {
      const steps = itemsOf(kind);
      if (!steps.length) continue;
      html += section(title, `${routineStreak(kind)} day streak`, grid(days, k => routineCell(kind, k, t)))
        + `<details class="steps"><summary>${title} steps</summary>${steps.map(it => section(
          it.name,
          `${habitStreak(it.id)} day streak`,
          grid(days, k => habitCell(it, k, t))
        )).join('')}</details>`;
    }

    return html + `
      <div class="footer">
        <button class="link" data-action="export">Export backup</button>
        <label class="link">Import<input type="file" id="import-file" accept="application/json,.json" hidden></label>
      </div>
      <p class="version">v${VERSION}</p>`;
  },
};

function route() {
  const tab = location.hash.slice(1);
  return pages[tab] ? tab : 'today';
}

function render() {
  const tab = route();
  renderedDay = todayKey();
  view.innerHTML = pages[tab]();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

function tick() {
  const f = activeFast();
  if (!f) return;
  const elapsed = Date.now() - f.start;
  const goal = f.goal * HOUR;
  document.querySelectorAll('[data-fast-timer]').forEach(el => {
    el.textContent = fmtClock(elapsed);
    el.classList.toggle('met', elapsed >= goal);
  });
  document.querySelectorAll('[data-fast-bar]').forEach(el => (el.style.width = `${Math.min(100, (100 * elapsed) / goal)}%`));
}

async function exportData() {
  const name = `habits-${todayKey()}.json`;
  const file = new File([JSON.stringify(state, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {}
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

view.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, k } = el.dataset;
  const item = state.items.find(i => i.id === id);

  switch (action) {
    case 'toggle':
      if (editing) return;
      toggle(id, todayKey());
      break;
    case 'edit':
      editing = !editing;
      break;
    case 'up':
    case 'down':
      move(item, action === 'up' ? -1 : 1);
      break;
    case 'rename': {
      const name = prompt('Rename', item.name)?.trim();
      if (!name) return;
      item.name = name;
      save();
      break;
    }
    case 'delete':
      if (!confirm(`Delete "${item.name}" and all its history?`)) return;
      remove(id);
      break;
    case 'cell':
      if (k < item.created) item.created = k;
      toggle(id, k);
      break;
    case 'range':
      weightRange = el.dataset.range;
      break;
    case 'delete-weight':
      deleteWeight(k);
      break;
    case 'goal':
      state.fastGoal = Number(el.dataset.h);
      save();
      break;
    case 'start-fast':
      startFast();
      break;
    case 'end-fast':
      if (!confirm('End this fast?')) return;
      endFast();
      break;
    case 'delete-fast':
      state.fasts.splice(Number(el.dataset.i), 1);
      save();
      break;
    case 'export':
      exportData();
      return;
    default:
      return;
  }
  render();
});

view.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.kind === 'weight') {
    const w = parseFloat(form.elements.weight.value);
    const k = form.elements.date.value || todayKey();
    if (!(w > 0) || k > todayKey()) return;
    setWeight(k, w);
    render();
    return;
  }
  const name = form.elements.name.value.trim();
  if (!name) return;
  state.items.push({ id: uid(), name, kind: form.dataset.kind, created: todayKey() });
  save();
  render();
  view.querySelector('.add input')?.focus();
});

view.addEventListener('change', async e => {
  if (e.target.matches('[data-fast-start]')) {
    setFastStart(e.target.value);
    render();
    return;
  }
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!data) throw new Error('bad backup');
    if (!confirm('Replace all current data with this backup?')) return;
    state = data;
    save();
    render();
  } catch {
    alert("That file isn't a valid backup.");
  }
});

view.addEventListener('pointerdown', scrub);
view.addEventListener('pointermove', scrub);
view.addEventListener('pointerup', unscrub);
view.addEventListener('pointercancel', unscrub);
view.addEventListener('pointerout', e => {
  if (!e.relatedTarget?.closest?.('.chart svg')) unscrub();
});

window.addEventListener('hashchange', () => {
  editing = false;
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (todayKey() !== renderedDay) render();
  else tick();
});

window.addEventListener('resize', () => {
  if (route() === 'history' || route() === 'weight') render();
});

setInterval(tick, 1000);
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

render();
