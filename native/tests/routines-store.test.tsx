import {
  MAX_ON_HAND, addDays, clock, convert, demoState, emptyState, hist, markOf, nowOf, peptides, rById, rItems, stats, todayItems, weekData, weekdayOf,
  type Item, type RoutinesState,
} from '../src/features/routines/model';
import { createRoutinesStore, type NewItem } from '../src/features/routines/store';

/* The Routines adapter: everything the screens and tiles ask of it, against an in-memory copy of the stored document. */

const realNow = clock.now;
beforeAll(() => { clock.now = () => new Date(2026, 10, 22, 16, 12); });
afterAll(() => { clock.now = realNow; });

function memory(seed?: () => RoutinesState) {
  let stored: unknown;
  const saves: RoutinesState[] = [];
  const io = { get: () => stored, save: (s: RoutinesState) => { stored = JSON.parse(JSON.stringify(s)); saves.push(s); }, seed };
  return { io, saves, stored: () => stored as RoutinesState | undefined };
}
const draft = (p: Partial<NewItem> = {}): NewItem => ({
  name: 'Zinc', type: 'Supplement', kind: 'dose', amt: 15, unit: 'mg', routines: ['night'], time: null, hand: '', mixed: '', note: null, ...p,
});

describe('routines store', () => {
  it('starts the demo account with the sample routines and keeps them', () => {
    const m = memory(() => demoState());
    const store = createRoutinesStore(m.io);
    expect(store.read().routines.map(r => r.name)).toEqual(['Morning', 'Midday', 'Night']);
    expect(store.read().hidden.map(r => r.name)).toEqual(['Supplement & enhancer stack']);
    expect(m.stored()?.items).toHaveLength(12);
    // A second store over the same storage reads what was saved rather than seeding again.
    const again = createRoutinesStore({ ...m.io, seed: () => emptyState() });
    expect(again.read().items).toHaveLength(12);
  });

  it('starts an account without a seed empty, and saves nothing until something changes', () => {
    const m = memory();
    const store = createRoutinesStore(m.io);
    expect(store.read().items).toEqual([]);
    expect(m.saves).toHaveLength(0);
  });

  it('ticks an item off and back, keeping the on-hand count in step', () => {
    const store = createRoutinesStore(memory(() => demoState()).io), day = nowOf().day;
    const left = () => store.read().items.find(i => i.id === 'mag')!.left;
    expect(left()).toBe(9);
    store.toggleDone('mag');
    expect(markOf(store.read(), day, 'mag')).toBe('d');
    expect(left()).toBe(8);
    store.toggleDone('mag');
    expect(markOf(store.read(), day, 'mag')).toBeNull();
    expect(left()).toBe(9);
  });

  it('skips an item for today and takes the skip back', () => {
    const store = createRoutinesStore(memory(() => demoState()).io), day = nowOf().day;
    store.toggleSkip('gly');
    expect(markOf(store.read(), day, 'gly')).toBe('s');
    store.toggleSkip('gly');
    expect(markOf(store.read(), day, 'gly')).toBeNull();
  });

  it('tells listeners about each change', () => {
    const store = createRoutinesStore(memory(() => demoState()).io), seen = jest.fn();
    const off = store.subscribe(seen);
    store.toggleDone('read');
    store.setRemind('night', false);
    expect(seen).toHaveBeenCalledTimes(2);
    off(); store.toggleDone('read');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('adds a dose item at its routine start, with an undo', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const { item, undo } = store.addItem(draft({ hand: '60' }));
    expect(item).toMatchObject({ name: 'Zinc', dose: '15 mg', kind: 'dose', h: 21.5, left: 60, perDay: 1, routines: ['night'] });
    expect(store.read().items.some(i => i.id === item.id)).toBe(true);
    undo();
    expect(store.read().items.some(i => i.id === item.id)).toBe(false);
  });

  it('adds a check item at a time of its own, with no amount', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const { item } = store.addItem(draft({ name: ' Journal ', type: '', kind: 'check', amt: 5, unit: 'mg', time: 20, routines: [] }));
    expect(item).toMatchObject({ name: 'Journal', type: 'Other', kind: 'check', amt: null, unit: '', dose: 'Tick when done', h: 20 });
  });

  it('adds a routine with its items, and reorders the list', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const r = store.addRoutine({ name: 'Afternoon', from: 15, to: 17, days: [5, 1, 2], color: 'food', items: ['fish'] });
    expect(rById(store.read(), r.id)).toMatchObject({ name: 'Afternoon', days: [1, 2, 5], remind: true });
    expect(store.read().items.find(i => i.id === 'fish')!.routines).toEqual(['midday', r.id]);
    store.reorder([r.id, 'night']);
    expect(store.read().routines.map(x => x.id)).toEqual([r.id, 'night', 'morning', 'midday']);
  });

  it('restores a hidden routine, and its undo hides it again', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const undo = store.restore('stack');
    expect(store.read().hidden).toHaveLength(0);
    expect(store.read().routines.map(r => r.id)).toContain('stack');
    undo();
    expect(store.read().hidden.map(r => r.id)).toEqual(['stack']);
    expect(store.read().routines.map(r => r.id)).not.toContain('stack');
  });

  it('pauses a routine until a day and resumes it', () => {
    const store = createRoutinesStore(memory(() => demoState()).io), today = nowOf().day, back = addDays(today, 7);
    const undo = store.pause('night', back, 'Travel');
    expect(rById(store.read(), 'night')!.pauses).toEqual([{ from: today, until: back, why: 'Travel' }]);
    undo();
    expect(rById(store.read(), 'night')!.pauses).toEqual([]);
  });

  it('turns reminders off and on', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    store.setRemind('morning', false);
    expect(rById(store.read(), 'morning')!.remind).toBe(false);
    store.setRemind('morning', true);
    expect(rById(store.read(), 'morning')!.remind).toBe(true);
  });

  it('drops history older than four months when it saves', () => {
    const m = memory(() => { const s = demoState(); s.log[addDays(nowOf().day, -200)] = { mag: 'd' }; return s; });
    const store = createRoutinesStore(m.io);
    store.toggleDone('read');
    expect(Object.keys(m.stored()!.log).every(d => d >= addDays(nowOf().day, -120))).toBe(true);
  });
});

/* Review fixes: each one a regression test for something the store or the model got wrong. */

describe('routine weekdays', () => {
  // The clock reads Sunday, November 22. Morning runs on weekdays only; the item has no days of its own.
  const weekdayState = (extra: Partial<Item> = {}) => {
    const s = emptyState(), today = nowOf().day;
    rById(s, 'morning')!.days = [1, 2, 3, 4, 5];
    rById(s, 'night')!.days = [0, 6];
    s.items = [{ id: 'zn', name: 'Zinc', amt: 15, unit: 'mg', dose: '15 mg', type: 'Supplement', kind: 'dose', routines: ['morning'], h: 7, days: null, created: addDays(today, -60), ...extra }];
    for (let k = 1; k < 30; k++) { const day = addDays(today, -k), wd = weekdayOf(day); if (wd >= 1 && wd <= 5) (s.log[day] ??= {}).zn = 'd'; }
    return s;
  };

  it('leaves an item off the days its only routine does not run', () => {
    const s = weekdayState(), n = nowOf();
    expect(n.wd).toBe(0);
    expect(todayItems(s, n)).toEqual([]);
    expect(rItems(s, 'morning', n)).toEqual([]);
    expect(rItems(s, 'morning', n, true).map(i => i.id)).toEqual(['zn']);
  });

  it('counts weekends as not scheduled in history, so a kept weekday record has no misses', () => {
    const s = weekdayState(), n = nowOf(), h = hist(s, s.items[0], n);
    h.forEach((x, k) => { const wd = weekdayOf(addDays(n.day, k - 29)); expect(x).toBe(wd === 0 || wd === 6 ? 'o' : 'd'); });
    const st = stats(s, s.items, n);
    expect(st.pct).toBe(100);
    expect(st.done).toBe(st.sched);
    expect(st.streak).toBe(29); // Every day before today; today, a Sunday, has nothing due.
  });

  it('makes an item due on any day one of its routines runs, and pauses still count', () => {
    const s = weekdayState({ routines: ['morning', 'night'] }), n = nowOf();
    expect(todayItems(s, n).map(i => i.id)).toEqual(['zn']);
    expect(hist(s, s.items[0], n)[28]).toBe('m'); // Saturday, through Night, never ticked.
    rById(s, 'night')!.pauses = [{ from: addDays(n.day, -1), until: addDays(n.day, 3), why: null }];
    expect(todayItems(s, n)).toEqual([]);
    expect(hist(s, s.items[0], n)[28]).toBe('o');
  });

  it("still lets an item's own days narrow its routine's", () => {
    const s = weekdayState({ routines: ['morning', 'night'], days: [0, 3] }), n = nowOf();
    expect(todayItems(s, n).map(i => i.id)).toEqual(['zn']);
    const h = hist(s, s.items[0], n);
    expect(h[28]).toBe('o'); // Saturday: Night runs, but the item is Sunday and Wednesday only.
    expect(h[25]).toBe('d'); // Wednesday, through Morning.
  });

  it('shows the week ahead and the next peptide by the routine days', () => {
    const s = weekdayState({ type: 'Peptide', vial: 10, left: 5 }), n = nowOf();
    const ahead = weekData(s, n, true), cell = (wd: number) => ahead.find(d => d.wd === wd)!.cells.find(c => c.r.id === 'morning')!;
    expect(cell(6)).toMatchObject({ s: 0, st: 'o' });
    expect(cell(0)).toMatchObject({ s: 0, st: 'o' });
    expect(cell(1)).toMatchObject({ s: 1, st: 'o2' });
    expect(peptides(s, n)[0]).toMatchObject({ nextDay: 1 });
    expect(peptides(s, n)[0].when).toMatch(/^Tomorrow /);
  });
});

describe('on-hand count when a tick is taken back', () => {
  const seeded = (edit: (s: RoutinesState) => void) => { const m = memory(() => { const s = demoState(); edit(s); return s; }); return { m, store: createRoutinesStore(m.io) }; };
  const leftOf = (store: ReturnType<typeof createRoutinesStore>, id: string) => store.read().items.find(i => i.id === id)!.left;

  it('stays at zero through any number of ticks and undos', () => {
    const { store } = seeded(s => { s.items.find(i => i.id === 'mag')!.left = 0; });
    for (let k = 0; k < 4; k++) { store.toggleDone('mag'); expect(leftOf(store, 'mag')).toBe(0); store.toggleDone('mag'); expect(leftOf(store, 'mag')).toBe(0); }
  });

  it('puts back only what a tick took when there was less than a full step', () => {
    const { m, store } = seeded(s => { s.items.find(i => i.id === 'crea')!.left = 3; delete s.log[nowOf().day]?.crea; });
    store.toggleDone('crea');
    expect(leftOf(store, 'crea')).toBe(0);
    expect(m.stored()!.used?.[nowOf().day]?.crea).toBe(3);
    store.toggleDone('crea');
    expect(leftOf(store, 'crea')).toBe(3);
    expect(m.stored()!.used?.[nowOf().day]?.crea).toBeUndefined();
  });

  it('puts back what a tick took when the tick is replaced by a skip', () => {
    const { store } = seeded(s => { s.items.find(i => i.id === 'mag')!.left = 0; });
    store.toggleDone('mag'); store.toggleSkip('mag');
    expect(markOf(store.read(), nowOf().day, 'mag')).toBe('s');
    expect(leftOf(store, 'mag')).toBe(0);
  });

  it('puts back one full step for a tick saved before ticks noted what they took', () => {
    const { store } = seeded(s => { s.items.find(i => i.id === 'mag')!.left = 8; (s.log[nowOf().day] ??= {}).mag = 'd'; delete s.used; });
    store.toggleDone('mag');
    expect(markOf(store.read(), nowOf().day, 'mag')).toBeNull();
    expect(leftOf(store, 'mag')).toBe(9);
  });

  it('keeps what ticks took across a reload', () => {
    const { m, store } = seeded(s => { s.items.find(i => i.id === 'mag')!.left = 0; });
    store.toggleDone('mag');
    const again = createRoutinesStore({ ...m.io, seed: undefined });
    again.toggleDone('mag');
    expect(leftOf(again, 'mag')).toBe(0);
  });
});

describe('a save that fails', () => {
  it('leaves the last saved state on screen, tells no one, and lets the next tap work', () => {
    let fail = false, stored: unknown;
    const store = createRoutinesStore({ get: () => stored, save: s => { if (fail) throw new Error('Local data is unavailable.'); stored = JSON.parse(JSON.stringify(s)); }, seed: () => demoState() });
    const before = store.read(), seen = jest.fn();
    store.subscribe(seen);
    fail = true;
    expect(() => store.toggleDone('mag')).toThrow('Local data is unavailable.');
    expect(store.read()).toBe(before);
    expect(markOf(store.read(), nowOf().day, 'mag')).toBeNull();
    expect(store.read().items.find(i => i.id === 'mag')!.left).toBe(9);
    expect(seen).not.toHaveBeenCalled();
    fail = false;
    store.toggleDone('mag');
    expect(markOf(store.read(), nowOf().day, 'mag')).toBe('d');
    expect(store.read().items.find(i => i.id === 'mag')!.left).toBe(8);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('tells listeners once per change when the storage reports its own saves back', () => {
    let stored: unknown;
    const others = new Set<() => void>();
    const store = createRoutinesStore({
      get: () => stored, seed: () => demoState(),
      save: s => { stored = JSON.parse(JSON.stringify(s)); others.forEach(l => l()); },
      subscribe: l => { others.add(l); return () => { others.delete(l); }; },
    });
    store.read();
    const seen = jest.fn();
    store.subscribe(seen);
    store.toggleDone('mag');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(markOf(store.read(), nowOf().day, 'mag')).toBe('d');
  });
});

describe('adding items and routines', () => {
  it('caps the on-hand count', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    expect(MAX_ON_HAND).toBe(99999);
    expect(store.addItem(draft({ hand: '1000000' })).item.left).toBe(99999);
    const pep = store.addItem(draft({ name: 'Peptide C', type: 'Peptide', hand: '250000' })).item;
    expect(pep).toMatchObject({ left: 99999, vial: 99999 });
    expect(store.addItem(draft({ hand: '40' })).item.left).toBe(40);
  });

  it('gives two items added in the same millisecond ids of their own', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const a = store.addItem(draft({ name: 'Zinc' })).item, b = store.addItem(draft({ name: 'Copper' })).item;
    expect(a.id).not.toBe(b.id);
    for (const id of [a.id, b.id]) expect(id).toMatch(/^n[0-9a-z]+$/);
    expect(store.read().items.filter(i => i.id === a.id || i.id === b.id).map(i => i.name)).toEqual(['Zinc', 'Copper']);
  });

  it('gives an item an id no stored item has, even from another store', () => {
    const m = memory(() => demoState());
    const one = createRoutinesStore(m.io).addItem(draft({ name: 'Zinc' })).item;
    const s = m.stored()!; s.items.push({ ...one, id: `n${clock.now().getTime().toString(36)}1`, name: 'Copy' });
    const other = createRoutinesStore({ ...m.io, get: () => s, seed: undefined });
    const two = other.addItem(draft({ name: 'Copper' })).item;
    expect(new Set(other.read().items.map(i => i.id)).size).toBe(other.read().items.length);
    expect(two.id).toMatch(/^n[0-9a-z]+$/);
  });

  it('gives two routines added in the same millisecond ids of their own', () => {
    const store = createRoutinesStore(memory(() => demoState()).io);
    const nr = { from: 15, to: 16, days: [1, 2, 3, 4, 5], color: 'food' as const, items: [] };
    const a = store.addRoutine({ ...nr, name: 'Afternoon' }), b = store.addRoutine({ ...nr, name: 'Evening' });
    expect(a.id).not.toBe(b.id);
    for (const id of [a.id, b.id]) expect(id).toMatch(/^r[0-9a-z]+$/);
    expect(store.read().routines.map(r => r.name)).toEqual(expect.arrayContaining(['Afternoon', 'Evening']));
  });
});

describe('unit converter', () => {
  it('converts mcg to mg and shows its arithmetic', () => {
    const r = convert({ amt: 250, from: 'mcg', to: 'mg', vit: 'd3' });
    expect(r).toMatchObject({ ok: true, v: 0.25, rate: '1 mcg = 0.001 mg' });
    expect(r.lines).toEqual(['Amount: 250 mcg', '1 mg = 1,000 mcg', '250 mcg ÷ 1,000 = 0.25 mg']);
  });
  it('converts IU through the vitamin it is for', () => {
    expect(convert({ amt: 2000, from: 'IU', to: 'mcg', vit: 'd3' })).toMatchObject({ ok: true, v: 50 });
  });
  it('refuses mL against a weight', () => {
    expect(convert({ amt: 1, from: 'mL', to: 'mg', vit: 'd3' }).ok).toBe(false);
  });
});
