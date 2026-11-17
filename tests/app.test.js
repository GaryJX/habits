const results = [];
let failures = 0;

function test(name, fn) {
  state = emptyState();
  editing = false;
  location.hash = '';
  for (const k in store) delete store[k];
  for (const k in fakeQuery) delete fakeQuery[k];
  for (const k in elements) delete elements[k];
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

function fakeChart() {
  const attrs = { line: {}, circle: {} };
  const node = name => ({ setAttribute: (k, v) => (attrs[name][k] = v) });
  const line = node('line');
  const circle = node('circle');
  const g = { style: {}, querySelector: sel => (sel === 'line' ? line : circle) };
  const svg = {
    getBoundingClientRect: () => ({ left: 0, width: contentWidth() }),
    viewBox: { baseVal: { width: contentWidth() } },
    querySelector: () => g,
  };
  fakeQuery['.crosshair'] = g;
  return { g, attrs, target: { closest: () => svg } };
}

const click = dataset => listeners.click({ target: { closest: () => ({ dataset }) } });
const submit = (kind, value) =>
  listeners.submit({ preventDefault() {}, target: { dataset: { kind }, elements: { name: { value } } } });

test('load_emptyStorage_returnsEmptyState', () => {
  eq(load(), emptyState());
});

test('load_invalidJson_returnsEmptyState', () => {
  store[STORE_KEY] = '{not json';
  eq(load(), emptyState());
});

test('load_validState_returnsStoredState', () => {
  const saved = { items: [{ id: 'a', name: 'Read', kind: 'habit', created: '2026-01-01' }], log: { '2026-01-01': { a: 1 } } };
  store[STORE_KEY] = JSON.stringify(saved);
  eq(load(), { ...emptyState(), ...saved });
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
  eq(routineProgress('routine', day(-1)), { done: 1, total: 1 });
  eq(routineProgress('routine', todayKey()), { done: 0, total: 2 });
});

test('routineStreak_partialDay_breaksStreak', () => {
  const a = add('routine', 'Water', day(-5));
  const b = add('routine', 'Stretch', day(-5));
  markDays(a, [-1, -2, -3]);
  markDays(b, [-1, -3]);
  eq(routineStreak('routine'), 1);
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
  const cls = k => routineCell('routine', k, t).match(/cell (\w+)/)[1];
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
  const titles = { today: 'Today', morning: 'Morning routine', evening: 'Evening routine', weight: 'Weight', history: 'History' };
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

test('load_backupWithoutWeights_addsWeightAndFastDefaults', () => {
  store[STORE_KEY] = JSON.stringify({ items: [], log: {} });
  const s = load();
  eq([s.weights, s.fasts, s.fastGoal], [{}, [], 16]);
});

test('normalize_missingItems_returnsNull', () => {
  eq(normalize({ log: {} }), null);
  eq(normalize(null), null);
});

test('routineProgress_morningAndEvening_trackedSeparately', () => {
  const m = add('routine', 'Water');
  add('evening', 'Read');
  add('evening', 'Floss');
  toggle(m.id, todayKey());
  eq(routineProgress('routine', todayKey()), { done: 1, total: 1 });
  eq(routineProgress('evening', todayKey()), { done: 0, total: 2 });
});

test('routineStreak_eveningComplete_countsOnlyEvening', () => {
  const e = add('evening', 'Read', day(-3));
  add('routine', 'Water', day(-3));
  markDays(e, [0, -1]);
  eq(routineStreak('evening'), 2);
  eq(routineStreak('routine'), 0);
});

test('checklist_evening_usesRoutineStyling', () => {
  add('evening', 'Read');
  eq(checklist('evening').includes('list-routine'), true);
});

test('submit_eveningStep_addsEveningItem', () => {
  submit('evening', 'Floss');
  eq(itemsOf('evening').map(i => i.name), ['Floss']);
});

test('setWeight_sameDayTwice_overwritesAndRounds', () => {
  setWeight(todayKey(), 180);
  setWeight(todayKey(), 179.46);
  eq(state.weights, { [todayKey()]: 179.5 });
});

test('deleteWeight_existingDay_removesEntry', () => {
  setWeight(day(-1), 180);
  setWeight(todayKey(), 179);
  deleteWeight(day(-1));
  eq(Object.keys(state.weights), [todayKey()]);
});

test('weightEntries_range_filtersAndSortsAscending', () => {
  setWeight(todayKey(), 178);
  setWeight(day(-40), 182);
  setWeight(day(-10), 180);
  eq(weightEntries('1M').map(e => e.w), [180, 178]);
  eq(weightEntries('All').map(e => e.w), [182, 180, 178]);
});

test('weightChange_weekAgoEntry_returnsDiffAndPercent', () => {
  setWeight(day(-7), 200);
  setWeight(day(-3), 199);
  setWeight(todayKey(), 198);
  const c = weightChange(7);
  eq([c.diff, c.pct, c.from], [-2, -1, day(-7)]);
});

test('weightChange_noEntryOldEnough_returnsNull', () => {
  setWeight(day(-3), 199);
  setWeight(todayKey(), 198);
  eq(weightChange(7), null);
});

test('weightChange_usesLatestEntryNotToday', () => {
  setWeight(day(-40), 190);
  setWeight(day(-10), 195);
  eq(weightChange(30).diff, 5);
});

test('trendTile_loss_showsGreenDownArrow', () => {
  const html = trendTile('Week', { diff: -1.5, pct: -0.75, from: day(-7) });
  eq(html.includes('trend down">↓ 1.5 lb'), true);
  eq(html.includes('0.8%'), true);
});

test('trendTile_gain_showsRedUpArrow', () => {
  const html = trendTile('Month', { diff: 2, pct: 1, from: day(-30) });
  eq(html.includes('trend up">↑ 2.0 lb'), true);
});

test('trendTile_noData_showsPlaceholder', () => {
  eq(trendTile('Week', null).includes('Not enough data'), true);
});

test('weightChart_oneEntry_showsHintAndNoPoints', () => {
  setWeight(todayKey(), 180);
  eq(weightChart(weightEntries()).includes('Log another day'), true);
  eq(chartPoints.length, 0);
});

test('weightChart_entries_plotsPointsInOrderWithinBounds', () => {
  setWeight(day(-2), 182);
  setWeight(day(-1), 181);
  setWeight(todayKey(), 183);
  const html = weightChart(weightEntries());
  eq(html.includes('class="line"'), true);
  eq(chartPoints.map(p => p.w), [182, 181, 183]);
  eq(chartPoints[0].x < chartPoints[1].x && chartPoints[1].x < chartPoints[2].x, true);
  eq(chartPoints[2].y < chartPoints[0].y && chartPoints[0].y < chartPoints[1].y, true);
  eq(chartPoints.every(p => p.x >= 40 && p.x <= contentWidth()), true);
});

test('weightChart_flatWeights_doesNotDivideByZero', () => {
  setWeight(day(-1), 180);
  setWeight(todayKey(), 180);
  weightChart(weightEntries());
  eq(chartPoints.every(p => Number.isFinite(p.y)), true);
});

test('submit_weight_savesForChosenDate', () => {
  listeners.submit({ preventDefault() {}, target: { dataset: { kind: 'weight' }, elements: { weight: { value: '181.2' }, date: { value: day(-2) } } } });
  eq(state.weights, { [day(-2)]: 181.2 });
});

test('submit_invalidWeight_savesNothing', () => {
  listeners.submit({ preventDefault() {}, target: { dataset: { kind: 'weight' }, elements: { weight: { value: '' }, date: { value: todayKey() } } } });
  eq(state.weights, {});
});

test('startFast_noActiveFast_startsWithCurrentGoal', () => {
  state.fastGoal = 18;
  startFast();
  eq([activeFast().goal, typeof activeFast().start], [18, 'number']);
});

test('startFast_alreadyFasting_doesNotStartAnother', () => {
  startFast();
  startFast();
  eq(state.fasts.length, 1);
});

test('endFast_activeFast_setsEndAndClearsActive', () => {
  startFast();
  endFast();
  eq([typeof state.fasts[0].end, activeFast()], ['number', null]);
});

test('setFastStart_earlierTime_setsStartToday', () => {
  startFast();
  const d = new Date(Date.now() - 2 * HOUR);
  setFastStart(hhmm(d.getTime()));
  eq(keyOf(new Date(activeFast().start)), keyOf(d));
  eq(hhmm(activeFast().start), hhmm(d.getTime()));
});

test('setFastStart_laterThanNow_setsStartYesterday', () => {
  startFast();
  const later = new Date(Date.now() + 2 * HOUR);
  setFastStart(hhmm(later.getTime()));
  eq(activeFast().start < Date.now(), true);
  eq(Date.now() - activeFast().start < 24 * HOUR, true);
});

test('fmtClock_overADay_showsTotalHours', () => {
  eq(fmtClock(25 * HOUR + 61000), '25:01:01');
  eq(fmtHours(16 * HOUR + 5 * 60000), '16h 05m');
});

test('fastCard_activePastGoal_marksTimerMet', () => {
  state.fasts.push({ start: Date.now() - 17 * HOUR, goal: 16 });
  const html = fastCard();
  eq(html.includes('timer met'), true);
  eq(html.includes('End fast'), true);
});

test('fastCard_notFasting_showsGoalChipsAndStart', () => {
  state.fastGoal = 14;
  const html = fastCard();
  eq(html.includes('Start 14h fast'), true);
  eq(html.includes('chip active" data-action="goal" data-h="14"'), true);
});

test('click_goalChip_setsFastGoal', () => {
  click({ action: 'goal', h: '20' });
  eq(state.fastGoal, 20);
});

test('click_deleteFast_removesThatFast', () => {
  state.fasts = [{ start: 1, end: 2, goal: 16 }, { start: 3, end: 4, goal: 16 }];
  click({ action: 'delete-fast', i: '0' });
  eq(state.fasts, [{ start: 3, end: 4, goal: 16 }]);
});

test('today_activeFast_showsFastingSummary', () => {
  startFast();
  location.hash = '#today';
  render();
  eq(fakeView.innerHTML.includes('href="#weight"'), true);
});

test('scrub_pointerNearPoint_movesCrosshairAndReadout', () => {
  setWeight(day(-2), 182);
  setWeight(day(-1), 181);
  setWeight(todayKey(), 183);
  weightChart(weightEntries());
  const chart = fakeChart();
  scrub({ target: chart.target, clientX: chartPoints[1].x + 2 });
  eq(chart.g.style.visibility, 'visible');
  eq([chart.attrs.line.x1, chart.attrs.circle.cy], [chartPoints[1].x, chartPoints[1].y]);
  eq(elements['chart-readout'].innerHTML.includes('181.0 lb'), true);
});

test('scrub_outsideChart_leavesReadoutAlone', () => {
  setWeight(day(-1), 181);
  setWeight(todayKey(), 183);
  weightChart(weightEntries());
  scrub({ target: { closest: () => null }, clientX: 50 });
  eq(elements['chart-readout'], undefined);
});

test('unscrub_afterScrub_hidesCrosshairAndShowsLatest', () => {
  setWeight(day(-1), 181);
  setWeight(todayKey(), 183);
  weightChart(weightEntries());
  const chart = fakeChart();
  scrub({ target: chart.target, clientX: chartPoints[0].x });
  unscrub();
  eq(chart.g.style.visibility, 'hidden');
  eq(elements['chart-readout'].innerHTML.includes('183.0 lb'), true);
});

test('unscrub_noChart_doesNothing', () => {
  unscrub();
  eq(elements['chart-readout'], undefined);
});

test('weightLog_moreThanTenEntries_showsLatestTenNewestFirst', () => {
  for (let i = 0; i < 12; i++) setWeight(day(-i), 170 + i);
  const html = weightLog(weightEntries());
  const shown = html.match(/\d+\.\d lb/g);
  eq(shown.length, 10);
  eq([shown[0], shown[9]], ['170.0 lb', '179.0 lb']);
  eq(html.includes('delete-weight'), false);
});

test('weightLog_editing_showsDeleteButtons', () => {
  setWeight(todayKey(), 180);
  editing = true;
  eq(weightLog(weightEntries()).includes(`data-action="delete-weight" data-k="${todayKey()}"`), true);
});

test('weightLog_noEntries_rendersNothing', () => {
  eq(weightLog([]), '');
});

test('fastLog_mixedFasts_listsOnlyCompletedWithGoalMark', () => {
  state.fasts = [
    { start: 0, end: 17 * HOUR, goal: 16 },
    { start: 20 * HOUR, end: 30 * HOUR, goal: 16 },
    { start: Date.now(), goal: 16 },
  ];
  const html = fastLog();
  eq(html.match(/<li/g).length, 2);
  eq(html.includes('17h 00m ✓'), true);
  eq(html.includes('10h 00m ✓'), false);
});

test('fastLog_editing_deleteButtonUsesOriginalIndex', () => {
  state.fasts = [{ start: 0, goal: 16 }, { start: 0, end: HOUR, goal: 16 }];
  editing = true;
  eq(fastLog().includes('data-action="delete-fast" data-i="1"'), true);
});

test('fastLog_noCompletedFasts_rendersNothing', () => {
  state.fasts = [{ start: Date.now(), goal: 16 }];
  eq(fastLog(), '');
});

test('fmtWhen_today_showsTimeOnly', () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  eq(fmtWhen(d.getTime()).includes(weekday), false);
});

test('fmtWhen_tomorrow_prefixesWeekday', () => {
  const d = addDays(new Date(), 1);
  d.setHours(12, 0, 0, 0);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  eq(fmtWhen(d.getTime()).startsWith(`${weekday} `), true);
});

test('click_deleteWeight_removesThatEntry', () => {
  setWeight(day(-1), 181);
  setWeight(todayKey(), 180);
  click({ action: 'delete-weight', k: day(-1) });
  eq(state.weights, { [todayKey()]: 180 });
});

const summary = `${results.join('\n')}\n\n${results.length - failures} passed, ${failures} failed`;
if (failures) throw new Error(summary);
summary;
