import { DOCK, dockBottom, fadeHeight, labelOffset, layoutArc, layoutDock, pageEndSpace } from '../src/features/shell/geometry';
import { ACTIONS, MAX_ACTIONS, PAGES, chosenActions, customizeOrder, defaultActionIds, defaultHint, nextMeal, pageForRoute, toggleDraft, visiblePages } from '../src/features/shell/pages';
import { EMPTY_PREFS, SHELL_PREFS_KEY, loadPrefs, readPrefs, withActions, withHidden } from '../src/features/shell/prefs';

// The mockup's phone is 393 by 852 points with the bar 24 points up; these numbers are read off the mockup itself.
const W = 393, H = 852, ALL = [0, 1, 2, 3, 4];

describe('the pages on the bar', () => {
  test('Home, Training, Food, Progress and Routines, in that order, and an Insights route lights Progress', () => {
    expect(PAGES.map(page => page.key)).toEqual(['home', 'training', 'food', 'progress', 'routines']);
    expect(PAGES.map(page => page.route)).toEqual(['index', 'workouts', 'food', 'progress', 'routines']);
    expect(pageForRoute('insights')).toBe('progress');
    expect(pageForRoute('workouts')).toBe('training');
    expect(pageForRoute('settings')).toBeNull();
  });
  test('a hidden tab leaves the bar, but Home and the open page always stay', () => {
    expect(visiblePages({ food: true, routines: true }, 0)).toEqual([0, 1, 3]);
    // Opened from the Tab bar sheet, a hidden page shows on the bar while you are on it.
    expect(visiblePages({ food: true }, 2)).toEqual(ALL);
    expect(visiblePages({ home: true } as never, 1)).toEqual(ALL);
  });
});

describe('quick actions', () => {
  test('each page has the mockup\'s four defaults, in order, closest to the thumb first', () => {
    expect(defaultActionIds('home')).toEqual(['edit', 'add', 'water', 'meal']);
    expect(defaultActionIds('training')).toEqual(['start', 'empty', 'cardio', 'plan']);
    expect(defaultActionIds('food')).toEqual(['meal', 'scan', 'water', 'quick']);
    expect(defaultActionIds('progress')).toEqual(['weigh', 'photo', 'range', 'charts']);
    expect(defaultActionIds('routines')).toEqual(['add', 'due', 'conv', 'order']);
  });
  test('a saved set is shown in its order; unknown ids drop out, and an empty set falls back to the defaults', () => {
    expect(chosenActions('food', ['copy', 'meal']).map(a => a.id)).toEqual(['copy', 'meal']);
    expect(chosenActions('food', ['gone', 'scan']).map(a => a.id)).toEqual(['scan']);
    expect(chosenActions('food', ['gone']).map(a => a.id)).toEqual(defaultActionIds('food'));
    expect(chosenActions('training', ['start', 'empty', 'cardio', 'plan', 'timer', 'repeat']).length).toBe(MAX_ACTIONS);
  });
  test('the Customize list puts the chosen ones first, then the rest in catalogue order', () => {
    expect(customizeOrder('home', ['water', 'edit']).map(a => a.id)).toEqual(['water', 'edit', 'add', 'meal', 'start', 'weigh']);
  });
  test('at least one stays on and five at most, and a refused change says why', () => {
    expect(toggleDraft(['meal'], 'meal')).toEqual({ next: ['meal'], refused: 'keepOne' });
    expect(toggleDraft(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual({ next: ['a', 'b', 'c', 'd', 'e'], refused: 'fiveMost' });
    expect(toggleDraft(['a', 'b'], 'a')).toEqual({ next: ['b'] });
    expect(toggleDraft(['a'], 'b')).toEqual({ next: ['a', 'b'] });
  });
  test('Log a meal names the next meal by the clock', () => {
    expect(nextMeal(new Date(2026, 10, 25, 8))).toBe('breakfast');
    expect(nextMeal(new Date(2026, 10, 25, 12))).toBe('lunch');
    expect(nextMeal(new Date(2026, 10, 25, 19))).toBe('dinner');
    const meal = ACTIONS.food.find(a => a.id === 'meal')!;
    expect(defaultHint(meal, new Date(2026, 10, 25, 12))).toBe('Lunch is next');
  });
  test('names and hints are plain, with no exclamation marks or dashes', () => {
    for (const page of PAGES) for (const action of ACTIONS[page.key]) {
      const text = `${chosenActions(page.key, [action.id])[0].label} ${defaultHint(action, new Date())}`;
      expect(text).not.toMatch(/[!—]/);
    }
  });
});

describe('the bar\'s geometry', () => {
  test('room for the bar: 24 points up, more above a tall home indicator, and the page ends 116 points above that', () => {
    expect(dockBottom(0)).toBe(24);
    expect(dockBottom(34)).toBe(28);
    expect(pageEndSpace(0)).toBe(140);
    expect(fadeHeight(0)).toBe(130);
  });
  test('with Home open, Home is the circle and the other four sit in one pill after it, then the +', () => {
    const dock = layoutDock(W, H, 0, 5, ALL, 0);
    expect(dock.scale).toBe(1);
    expect(dock.bubbleX).toBeCloseTo(29.5);
    expect(dock.pillA.shown).toBe(false);
    expect(dock.pillB).toEqual({ x: 93.5, width: 4 * DOCK.ITEM + 3 * DOCK.IGAP + 2 * DOCK.PAD, shown: true });
    expect(dock.plusX).toBeCloseTo(307.5);
    expect(dock.plusCenter).toEqual({ x: 335.5, y: 800 });
  });
  test('with Progress open the pill splits around it, and Home sits alone at the left of the first pill', () => {
    const dock = layoutDock(W, H, 0, 5, ALL, 3);
    expect(dock.pillA).toMatchObject({ x: 22.5, shown: true });
    expect(dock.plusX).toBeCloseTo(314.5);
    expect(dock.tabs[3]).toEqual({ x: dock.bubbleX, width: DOCK.ACTIVE, shown: true });
    expect(dock.tabs.filter(tab => tab.width === DOCK.ITEM)).toHaveLength(4);
  });
  test('a hidden tab shrinks away beside its neighbour and the bar closes up', () => {
    const all = layoutDock(W, H, 0, 5, ALL, 0), fewer = layoutDock(W, H, 0, 5, [0, 1, 3, 4], 0);
    expect(fewer.tabs[2].shown).toBe(false);
    expect(fewer.tabs[2].x).toBe(fewer.tabs[1].x);
    expect(fewer.pillB.width).toBe(all.pillB.width - DOCK.ITEM - DOCK.IGAP);
  });
  test('on a narrow screen the bar shrinks to fit', () => {
    expect(layoutDock(320, 640, 0, 5, ALL, 2).scale).toBeLessThan(1);
  });
  test('the quick actions sweep up from the + exactly where the mockup puts them', () => {
    const home = layoutArc(W, H, layoutDock(W, H, 0, 5, ALL, 0).plusCenter, 4).items;
    const want = [[138.4, 688], [160.7, 626], [199.5, 564], [299.9, 502]];
    home.forEach((item, i) => { expect(item.x).toBeCloseTo(want[i][0], 1); expect(item.y).toBeCloseTo(want[i][1], 1); });
    const progress = layoutArc(W, H, layoutDock(W, H, 0, 5, ALL, 3).plusCenter, 4).items;
    [[145.4, 688], [167.7, 626], [206.5, 564], [306.9, 502]].forEach(([x, y], i) => { expect(progress[i].x).toBeCloseTo(x, 1); expect(progress[i].y).toBeCloseTo(y, 1); });
    // Closed, every action starts on the + itself.
    expect(home.every(item => item.from.x === 335.5 - 26 && item.from.y === 800 - 26)).toBe(true);
  });
  test('a name sits right of its button while it fits, and left near the top of the curve', () => {
    expect(labelOffset(W, 138.4, 140)).toEqual({ left: 62, side: 'r' });
    expect(labelOffset(W, 299.9, 140)).toEqual({ left: -150, side: 'l' });
  });
});

describe('saved choices', () => {
  test('a saved value is read back clean: Home is never hidden, unknown pages and actions drop out, five at most', () => {
    expect(readPrefs(undefined)).toEqual(EMPTY_PREFS);
    expect(readPrefs('junk')).toEqual(EMPTY_PREFS);
    expect(readPrefs({ hidden: { home: true, food: true, insights: true, routines: 'yes' }, actions: {
      food: ['meal', 'meal', 'nope', 'scan'], training: ['start', 'empty', 'cardio', 'plan', 'timer', 'repeat'], home: [], other: ['x'],
    } })).toEqual({ hidden: { food: true }, actions: { food: ['meal', 'scan'], training: ['start', 'empty', 'cardio', 'plan', 'timer'] } });
  });
  test('hiding and showing a tab, and choosing actions, make new values and never hide Home', () => {
    const hidden = withHidden(EMPTY_PREFS, 'food', true);
    expect(hidden.hidden).toEqual({ food: true });
    expect(withHidden(hidden, 'food', false).hidden).toEqual({});
    expect(withHidden(EMPTY_PREFS, 'home', true)).toBe(EMPTY_PREFS);
    expect(withActions(hidden, 'home', ['water']).actions).toEqual({ home: ['water'] });
    expect(EMPTY_PREFS).toEqual({ hidden: {}, actions: {} });
  });
  test('the choices are read from the phone\'s local settings under their own key, and a failed read is no choices', () => {
    const storage = { localGet: jest.fn(() => ({ hidden: { routines: true } }) as never), localSave: jest.fn() };
    expect(loadPrefs(storage)).toEqual({ hidden: { routines: true }, actions: {} });
    expect(storage.localGet).toHaveBeenCalledWith(SHELL_PREFS_KEY);
    expect(loadPrefs({ localGet: () => { throw new Error('locked'); }, localSave: jest.fn() })).toEqual(EMPTY_PREFS);
    expect(loadPrefs(null)).toEqual(EMPTY_PREFS);
  });
});
