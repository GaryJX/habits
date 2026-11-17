const VERSION = '0.1.0';
const STORE_KEY = 'habits.v1';
const CELL = 14;
const GAP = 3;

const view = document.getElementById('view');
let state = load();
let editing = false;
let renderedDay = null;

document.documentElement.style.setProperty('--cell', `${CELL}px`);
document.documentElement.style.setProperty('--gap', `${GAP}px`);

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.items) && s.log) return s;
  } catch {}
  return { items: [], log: {} };
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

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

function routineProgress(k) {
  const items = itemsOf('routine').filter(i => i.created <= k);
  return { done: items.filter(i => isDone(i.id, k)).length, total: items.length };
}

const routineStreak = () => streakWhile(k => {
  const p = routineProgress(k);
  return p.total > 0 && p.done === p.total;
});

function gridDays() {
  const width = Math.min(window.innerWidth, 560) - 40;
  const weeks = Math.max(4, Math.floor((width + GAP) / (CELL + GAP)));
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

function routineCell(k, t) {
  if (k > t) return '<span class="cell future"></span>';
  const { done, total } = routineProgress(k);
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

function checklist(kind) {
  const items = itemsOf(kind);
  const t = todayKey();
  if (!items.length) return '';
  return `<ul class="list list-${kind}">${items.map(it => {
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
            <button class="icon danger" data-action="delete" data-id="${it.id}" aria-label="Delete">✕</button>
          </span>` : streak ? `<span class="streak">${streak}d</span>` : ''}
      </li>`;
  }).join('')}</ul>`;
}

const section = (title, meta, body) => `
  <section class="hist">
    <div class="hist-head"><h2>${esc(title)}</h2><span class="meta">${meta}</span></div>
    ${body}
  </section>`;

const pages = {
  today() {
    const r = routineProgress(todayKey());
    const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    return header('Today', date, true)
      + (r.total ? `
        <a class="summary ${r.done === r.total ? 'complete' : ''}" href="#routine">
          <span>Morning routine</span><span class="count">${r.done}/${r.total}</span>
        </a>` : '')
      + (itemsOf('habit').length ? checklist('habit') : '<p class="empty">Add a habit to start tracking it.</p>')
      + addForm('habit', 'New habit');
  },

  routine() {
    const r = routineProgress(todayKey());
    const sub = !r.total ? 'Add the steps you do each morning.'
      : r.done === r.total ? 'All done.' : `${r.done} of ${r.total}`;
    return header('Morning routine', sub, true)
      + (r.total ? `<div class="bar"><span style="width:${(100 * r.done) / r.total}%"></span></div>` : '')
      + checklist('routine')
      + addForm('routine', 'New step');
  },

  history() {
    const t = todayKey();
    const days = gridDays();
    const habits = itemsOf('habit');
    const routine = itemsOf('routine');
    let html = header('History', habits.length || routine.length ? 'Tap a square to fix a past day.' : '');

    if (!habits.length && !routine.length) html += '<p class="empty">Nothing to show yet.</p>';

    html += habits.map(it => section(
      it.name,
      `${habitStreak(it.id)} day streak · best ${bestStreak(it)}`,
      grid(days, k => habitCell(it, k, t))
    )).join('');

    if (routine.length) {
      html += section('Morning routine', `${routineStreak()} day streak`, grid(days, k => routineCell(k, t)))
        + `<details class="steps"><summary>Routine steps</summary>${routine.map(it => section(
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
  const name = form.elements.name.value.trim();
  if (!name) return;
  state.items.push({ id: uid(), name, kind: form.dataset.kind, created: todayKey() });
  save();
  render();
  view.querySelector('.add input')?.focus();
});

view.addEventListener('change', async e => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || typeof data.log !== 'object') throw new Error('bad backup');
    if (!confirm('Replace all current data with this backup?')) return;
    state = data;
    save();
    render();
  } catch {
    alert("That file isn't a valid backup.");
  }
});

window.addEventListener('hashchange', () => {
  editing = false;
  render();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayKey() !== renderedDay) render();
});

window.addEventListener('resize', () => {
  if (route() === 'history') render();
});

navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

render();
