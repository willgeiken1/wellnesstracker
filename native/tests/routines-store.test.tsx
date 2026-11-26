import { addDays, clock, convert, demoState, emptyState, markOf, nowOf, rById, type RoutinesState } from '../src/features/routines/model';
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
