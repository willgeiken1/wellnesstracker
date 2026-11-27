import { randomUUID } from 'node:crypto';
import { localDatabase } from './server/sqlite';
import { Repository } from '../src/data/repository';
import { syncedTables } from '../src/data/rows';
import { WorkoutStore } from '../src/data/workout/store';
import { localDay } from '../src/core/workout/rules';
import { DEMO_ROUTINE_ID, DEMO_SESSION_ID, seedDemo } from '../fixtures/demo';
import { promoteDemo } from '../src/features/onboarding/demo-transfer';
import { seedTrainingDemo } from '../src/features/workout/training-demo';
import { buildTileData, type HomeInput } from '../src/features/home/tiles/data';
import { readAppData } from '../src/features/home/tiles/read';
import { heroInput, lastWeek } from '../src/features/home/hero/data';
import { heroView } from '../src/features/home/hero/model';
import { addDrink, litresOn, readWater } from '../src/features/food/water';
import { defaultMeals } from '../src/features/food/model';
import { createLocalRoutinesStore } from '../src/features/routines/store';
jest.mock('expo-sqlite', () => require('./server/expo-sqlite-stub'));

const AFTERNOON = new Date(2026, 10, 22, 16, 12).getTime();
const KJ = 4.184;
const days = (now: number) => lastWeek(new Date(now));
const allRows = (repo: Repository) => syncedTables.flatMap(table => repo.list(table, true));
async function demoRepo() {
  const { db, repo: account, sqlite } = await localDatabase();
  return { demo: new Repository(db, 'demo', account.device, randomUUID), account, db, sqlite };
}
/** What Home's hero is drawn from, read the way Home reads it (no Health connected). */
function hero(repo: Repository, now: number) {
  const store = new WorkoutStore(repo), at = new Date(now);
  const input: HomeInput = { now: at, ...readAppData(store, at, null), weightGoalKg: null, health: null, detail: null, recovery: null,
    sources: { activity: 'Apple Health', sleep: 'Apple Health', body: 'Apple Health' }, goals: { steps: 10000, exercise: 30, active: 500, sleepHours: 8, mindful: 10 } };
  return heroInput(buildTileData(input), store, 'kcal', at);
}

describe('Explore with sample data: the example week', () => {
  test('a fresh demo namespace gets a full week ending today, every row listed as a sample', async () => {
    const { demo, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const week = days(AFTERNOON), today = week[6];
      const food = demo.list('food_entries');
      expect([...new Set(food.map(row => String(row.data.day)))].sort()).toEqual(week);
      const kcal = (day: string) => Math.round(food.filter(row => row.data.day === day).reduce((sum, row) => sum + Number(row.data.energy_kj), 0) / KJ);
      expect(week.map(kcal)).toEqual([2140, 2310, 1980, 2260, 2050, 2410, 1364]);
      expect(demo.list('food_targets')).toHaveLength(1);
      expect(Math.round(Number(demo.list('food_targets')[0].data.energy_kj) / KJ)).toBe(2200);
      expect(demo.list('weigh_ins')).toHaveLength(30);
      expect(demo.list('weigh_ins').find(row => row.data.day === today)?.data.entered_value).toBe(182.1);
      const water = readWater(demo);
      for (const day of week) expect(litresOn(water, day)).toBeGreaterThan(1);
      // Training is the Training tab's own sample: finished workouts with sets this week, and one going now.
      const store = new WorkoutStore(demo);
      const trained = store.trainingHistory().filter(row => week.includes(String(row.data.day)));
      expect(trained.length).toBeGreaterThanOrEqual(3);
      for (const session of trained) expect(store.entries(session.id).some(entry => demo.list('sets').some(set => set.data.entry_id === entry.id))).toBe(true);
      expect(store.active()?.data.day).toBe(today);
      // Every synced row is a sample, by list and by its reserved id (the Food tab's four meals keep their own fixed ids).
      const meals = new Set(defaultMeals().map(meal => meal.id));
      const samples = new Set(demo.localGet<string[]>('demoSamples'));
      expect(samples.has(DEMO_ROUTINE_ID) && samples.has(DEMO_SESSION_ID)).toBe(true);
      for (const row of allRows(demo)) {
        expect(samples.has(row.id)).toBe(true);
        expect(row.id.startsWith('de000000-0000-4000-80') || (row.table === 'meals' && meals.has(row.id))).toBe(true);
      }
      expect(demo.pending()).toEqual([]);
    } finally { sqlite.close(); }
  }, 60000);

  test('Home shows the day and the week instead of a clear sky', async () => {
    const { demo, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const input = hero(demo, AFTERNOON), view = heroView(input);
      expect(view.empty).toBe(false);
      expect(input.days[6].kcal).toBeCloseTo(1364, 0);
      expect(input.goals.kcal).toBe(2200);
      // The workout going now started 25 minutes before the sample was made.
      expect(input.days[6].trainMin).toBe(25);
      expect(view.week.every(day => !day.empty)).toBe(true);
      // Sleep is read from Apple Health or Oura only, never stored, so the sample has none.
      expect(input.days.every(day => day.sleepMin === null)).toBe(true);
    } finally { sqlite.close(); }
  }, 60000);

  // Past days only: a workout cannot start in the future.
  test.each([new Date(2026, 2, 10, 18, 30), new Date(2026, 0, 2, 20, 0)])('dates follow the device day (%s)', async when => {
    const { demo, sqlite } = await demoRepo();
    try {
      seedDemo(demo, when.getTime());
      const dates = demo.list('food_entries').map(row => String(row.data.day)).sort();
      expect(dates[dates.length - 1]).toBe(localDay(when));
      expect(dates[0]).toBe(days(when.getTime())[0]);
      expect(demo.list('weigh_ins').map(row => String(row.data.day)).sort().at(-1)).toBe(localDay(when));
    } finally { sqlite.close(); }
  }, 60000);

  test('today only has the meals and drinks whose time has come', async () => {
    const { demo, sqlite } = await demoRepo();
    try {
      const morning = new Date(2026, 10, 22, 9, 5).getTime();
      seedDemo(demo, morning);
      const today = localDay(new Date(morning));
      const names = demo.list('food_entries').filter(row => row.data.day === today).map(row => row.data.name);
      expect(names).toEqual(['Greek yogurt, plain 2%', 'Blueberries', 'Granola']);
      for (const drink of readWater(demo).log[today] ?? []) expect(drink.at).toBeLessThanOrEqual(morning);
    } finally { sqlite.close(); }
  }, 60000);

  test('seeding twice, or opening Training afterwards, adds nothing', async () => {
    const { demo, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const rows = allRows(demo).length, samples = demo.localGet<string[]>('demoSamples'), water = demo.localGet('foodWater');
      seedDemo(demo, AFTERNOON + 3_600_000);
      seedTrainingDemo(demo, AFTERNOON + 3_600_000);
      expect(allRows(demo)).toHaveLength(rows);
      expect(demo.localGet('demoSamples')).toEqual(samples);
      expect(demo.localGet('foodWater')).toEqual(water);
    } finally { sqlite.close(); }
  }, 60000);

  test('promotion carries only what the person logged; no sample row reaches the account', async () => {
    const { demo, account, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const samples = demo.localGet<string[]>('demoSamples')!;
      const mine = demo.save('food_entries', { name: 'Synthetic user food', day: days(AFTERNOON)[6], energy_kj: 400 });
      promoteDemo(demo, account);
      for (const table of syncedTables) {
        expect(account.list(table, true).some(row => samples.includes(row.id))).toBe(false);
        expect(demo.list(table, true)).toEqual([]);
      }
      expect(account.list('food_entries').map(row => row.id)).toEqual([mine.id]);
      expect(account.list('weigh_ins')).toEqual([]);
      expect(account.list('food_targets')).toEqual([]);
      expect(account.list('sessions')).toEqual([]);
      expect(account.list('sets')).toEqual([]);
      expect(account.localGet('foodWater')).toBeUndefined();
    } finally { sqlite.close(); }
  }, 60000);

  test('a drink logged in Look around first carries into the account, and the sample drinks do not', async () => {
    const { demo, account, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const today = days(AFTERNOON)[6], glass = readWater(demo).containers[0];
      const { drink } = addDrink(demo, today, { c: glass }, AFTERNOON);
      promoteDemo(demo, account);
      const log = readWater(account).log;
      expect(Object.values(log).flat().map(d => d.id)).toEqual([drink.id]);
      expect(log[today].map(d => d.oz)).toEqual([glass.oz]);
      expect(demo.localGet('foodWater')).toBeUndefined();
    } finally { sqlite.close(); }
  }, 60000);

  test('routines and items made in Look around first carry over with their check-offs, and the sample ones stay behind', async () => {
    const { demo, account, sqlite } = await demoRepo();
    try {
      seedDemo(demo, AFTERNOON);
      const store = createLocalRoutinesStore(demo);
      const { item } = store.addItem({ name: 'Zinc', type: 'Supplement', kind: 'dose', amt: 15, unit: 'mg', routines: ['morning'], time: 8, hand: '', mixed: '', note: null });
      const routine = store.addRoutine({ name: 'Evening walk', from: 18, to: 19, days: [], color: 'training', items: [item.id, 'vd3'] });
      store.toggleDone(item.id);
      store.toggleDone('k2');
      const day = Object.keys(store.read().log).find(d => store.read().log[d][item.id] === 'd')!;
      promoteDemo(demo, account);
      const after = createLocalRoutinesStore(account).read();
      expect(after.items.map(i => i.id)).toEqual([item.id]);
      expect(after.items[0].routines).toEqual(['morning', routine.id]);
      expect(after.routines.map(r => r.id)).toEqual(['morning', 'midday', 'night', routine.id]);
      expect(after.hidden).toEqual([]);
      expect(Object.values(after.log).flatMap(m => Object.keys(m))).toEqual([item.id]);
      expect(after.log[day][item.id]).toBe('d');
      expect(demo.localGet('routines')).toBeUndefined();
    } finally { sqlite.close(); }
  }, 60000);

  test('the Training sample adds its rows to an existing sample list, and never makes one for unmarked data', async () => {
    const marked = await demoRepo(), unmarked = await demoRepo();
    try {
      marked.demo.localSave('demoSamples', [DEMO_ROUTINE_ID, DEMO_SESSION_ID]);
      seedTrainingDemo(marked.demo, AFTERNOON);
      const samples = new Set(marked.demo.localGet<string[]>('demoSamples'));
      expect(allRows(marked.demo).length).toBeGreaterThan(30);
      expect(allRows(marked.demo).every(row => samples.has(row.id))).toBe(true);
      seedTrainingDemo(unmarked.demo, AFTERNOON);
      expect(unmarked.demo.localGet('demoSamples')).toBeUndefined();
      expect(() => promoteDemo(unmarked.demo, unmarked.account)).toThrow();
    } finally { marked.sqlite.close(); unmarked.sqlite.close(); }
  }, 60000);

  test('no other owner is ever seeded', async () => {
    const { account, sqlite } = await demoRepo();
    try {
      expect(() => seedDemo(account, AFTERNOON)).toThrow();
      expect(allRows(account)).toEqual([]);
    } finally { sqlite.close(); }
  });
});
