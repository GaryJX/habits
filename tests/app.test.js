const results = [];
let failures = 0;

function test(name, fn) {
  state = { items: [], log: {} };
  editing = false;
  location.hash = '';
  for (const k in store) delete store[k];
  try {
    fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL ${name}: ${e.message}`);
  }
}

function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}

const day = n => keyOf(addDays(new Date(), n));

function add(kind, name, created = todayKey()) {
  const item = { id: uid(), name, kind, created };
  state.items.push(item);
  return item;
}

function markDays(item, offsets) {
  for (const n of offsets) toggle(item.id, day(n));
}

const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
const submit = (kind, value) =>
  listeners.submit({ preventDefault() {}, target: { dataset: { kind }, elements: { name: { value } } } });

test('load_emptyStorage_returnsEmptyState', () => {
  eq(load(), { items: [], log: {} });
});

test('load_invalidJson_returnsEmptyState', () => {
  store[STORE_KEY] = '{not json';
  eq(load(), { items: [], log: {} });
});

test('load_validState_returnsStoredState', () => {
  const saved = { items: [{ id: 'a', name: 'Read', kind: 'habit', created: '2026-01-01' }], log: { '2026-01-01': { a: 1 } } };
  store[STORE_KEY] = JSON.stringify(saved);
  eq(load(), saved);
});

test('save_afterChange_writesStateToStorage', () => {
  add('habit', 'Read');
  save();
  eq(JSON.parse(store[STORE_KEY]), state);
});

test('toggle_uncheckedDay_marksDone', () => {
  const h = add('habit', 'Read');
  toggle(h.id, todayKey());
  eq(isDone(h.id, todayKey()), true);
});

test('toggle_checkedDay_unmarksAndDropsEmptyDay', () => {
  const h = add('habit', 'Read');
  toggle(h.id, todayKey());
  toggle(h.id, todayKey());
  eq(state.log, {});
});

test('move_down_swapsWithNextOfSameKind', () => {
  const a = add('habit', 'A');
  add('routine', 'R');
  const b = add('habit', 'B');
  move(a, 1);
  eq(itemsOf('habit').map(i => i.name), ['B', 'A']);
  eq(state.items.indexOf(b), 0);
});

test('move_upAtTop_doesNothing', () => {
  const a = add('habit', 'A');
  add('habit', 'B');
  move(a, -1);
  eq(itemsOf('habit').map(i => i.name), ['A', 'B']);
});

test('remove_itemWithHistory_deletesItemAndItsLogs', () => {
  const a = add('habit', 'A');
  const b = add('habit', 'B');
  markDays(a, [0, -1]);
  markDays(b, [0]);
  remove(a.id);
  eq(state.items.map(i => i.id), [b.id]);
  eq(state.log, { [todayKey()]: { [b.id]: 1 } });
});

test('habitStreak_doneThroughToday_countsToday', () => {
  const h = add('habit', 'Read', day(-5));
  markDays(h, [0, -1, -2]);
  eq(habitStreak(h.id), 3);
});

test('habitStreak_todayUnchecked_countsFromYesterday', () => {
  const h = add('habit', 'Read', day(-5));
  markDays(h, [-1, -2]);
  eq(habitStreak(h.id), 2);
});

test('habitStreak_missedYesterday_returnsZero', () => {
  const h = add('habit', 'Read', day(-5));
  markDays(h, [-2, -3]);
  eq(habitStreak(h.id), 0);
});

test('bestStreak_multipleRuns_returnsLongest', () => {
  const h = add('habit', 'Read', day(-10));
  markDays(h, [-10, -9, -8, -7, -5, -4, 0]);
  eq(bestStreak(h), 4);
});

test('routineProgress_stepAddedLater_isExcludedFromEarlierDays', () => {
  const old = add('routine', 'Water', day(-3));
  add('routine', 'Stretch', todayKey());
  markDays(old, [-1]);
  eq(routineProgress(day(-1)), { done: 1, total: 1 });
  eq(routineProgress(todayKey()), { done: 0, total: 2 });
});

test('routineStreak_partialDay_breaksStreak', () => {
  const a = add('routine', 'Water', day(-5));
  const b = add('routine', 'Stretch', day(-5));
  markDays(a, [-1, -2, -3]);
  markDays(b, [-1, -3]);
  eq(routineStreak(), 1);
});

test('gridDays_phoneWidth_returnsWholeWeeksEndingSaturday', () => {
  const days = gridDays();
  eq(days.length, 20 * 7);
  eq(parseKey(days[days.length - 1]).getDay(), 6);
  eq(parseKey(days[0]).getDay(), 0);
  eq(days.includes(todayKey()), true);
});

test('habitCell_eachDayState_returnsMatchingClass', () => {
  const h = add('habit', 'Read', day(-2));
  markDays(h, [-1]);
  const t = todayKey();
  const cls = k => habitCell(h, k, t).match(/cell (\w+)/)[1];
  eq([cls(day(1)), cls(day(0)), cls(day(-1)), cls(day(-2)), cls(day(-3))], ['future', 'today', 'done', 'miss', 'none']);
  eq(habitCell(h, day(1), t).includes('data-action'), false);
});

test('routineCell_eachDayState_returnsMatchingClass', () => {
  const a = add('routine', 'Water', day(-3));
  const b = add('routine', 'Stretch', day(-3));
  markDays(a, [-1, -2]);
  markDays(b, [-1]);
  const t = todayKey();
  const cls = k => routineCell(k, t).match(/cell (\w+)/)[1];
  eq([cls(day(1)), cls(day(0)), cls(day(-1)), cls(day(-2)), cls(day(-3)), cls(day(-4))], ['future', 'today', 'done', 'part', 'miss', 'none']);
});

test('checklist_htmlInName_escapesName', () => {
  add('habit', '<b>Read</b>');
  const html = checklist('habit');
  eq(html.includes('&lt;b&gt;Read&lt;/b&gt;'), true);
  eq(html.includes('<b>'), false);
});

test('checklist_habitWithStreak_showsStreak', () => {
  const h = add('habit', 'Read', day(-2));
  markDays(h, [0, -1]);
  eq(checklist('habit').includes('2d'), true);
});

test('checklist_editing_showsEditButtonsInsteadOfStreak', () => {
  const h = add('habit', 'Read');
  markDays(h, [0]);
  editing = true;
  const html = checklist('habit');
  eq(html.includes('data-action="delete"'), true);
  eq(html.includes('1d'), false);
});

test('route_unknownHash_fallsBackToToday', () => {
  location.hash = '#nope';
  eq(route(), 'today');
  location.hash = '#history';
  eq(route(), 'history');
});

test('render_eachPage_rendersItsHeader', () => {
  add('habit', 'Read');
  add('routine', 'Water');
  const titles = { today: 'Today', routine: 'Morning routine', history: 'History' };
  for (const tab in titles) {
    location.hash = `#${tab}`;
    render();
    eq(fakeView.innerHTML.includes(`<h1>${titles[tab]}</h1>`), true);
  }
});

test('click_toggleWhileEditing_doesNotMark', () => {
  const h = add('habit', 'Read');
  editing = true;
  click({ action: 'toggle', id: h.id });
  eq(isDone(h.id, todayKey()), false);
});

test('click_cellBeforeCreated_backfillsCreatedDate', () => {
  const h = add('habit', 'Read');
  click({ action: 'cell', id: h.id, k: day(-3) });
  eq(h.created, day(-3));
  eq(isDone(h.id, day(-3)), true);
});

test('click_rename_updatesName', () => {
  const h = add('habit', 'Read');
  click({ action: 'rename', id: h.id });
  eq(h.name, 'Renamed');
});

test('submit_paddedName_addsTrimmedItem', () => {
  submit('routine', '  Water  ');
  eq(state.items.map(i => [i.name, i.kind, i.created]), [['Water', 'routine', todayKey()]]);
});

test('submit_blankName_addsNothing', () => {
  submit('habit', '   ');
  eq(state.items.length, 0);
});

test('exportData_shareAvailable_sharesJsonBackup', () => {
  add('habit', 'Read');
  shared.length = 0;
  exportData();
  const file = shared[0].files[0];
  eq(file.name, `habits-${todayKey()}.json`);
  eq(JSON.parse(file.text), state);
});

const summary = `${results.join('\n')}\n\n${results.length - failures} passed, ${failures} failed`;
if (failures) throw new Error(summary);
summary;
