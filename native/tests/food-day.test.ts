import { daySums, dayView, foodsLine, nextMealId, stripDays, streak, weekDays } from '../src/features/food/day';
import { saveFood } from '../src/features/food/model';
import { memoryRepository } from './workout-repository';

/** Made-up sample foods only. */
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const toast = { name: 'Synthetic toast', energy_kj: 200 * 4.184, protein_g: 8, carbs_g: 30, fat_g: 4, ...blank };
const soup = { name: 'Synthetic soup', energy_kj: 350 * 4.184, protein_g: 20, carbs_g: 25, fat_g: 12, fiber_g: 6, sugar_g: null, sodium_mg: null, amount_g: null };
const BREAKFAST = 'fd000000-0000-4000-8000-000000000000', LUNCH = 'fd000000-0000-4000-8000-000000000001';
const DINNER = 'fd000000-0000-4000-8000-000000000002', SNACK = 'fd000000-0000-4000-8000-000000000003';
const DAY = '2026-10-28'; // a Wednesday

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 28, 13, 0)); });
afterEach(() => jest.useRealTimers());

describe('the day', () => {
  test('adds up each meal and the day, in the order breakfast, lunch, snack, dinner', () => {
    const repo = memoryRepository();
    saveFood(repo, DAY, BREAKFAST, toast);
    saveFood(repo, DAY, LUNCH, soup, 2);
    const v = dayView(repo, DAY, { today: DAY });
    expect(v.meals.map(m => m.name)).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner']);
    expect(Math.round(v.eaten!)).toBe(900);
    expect(v.p).toBe(48);
    expect(v.fib).toBe(12);
    expect(v.logged).toBe(2);
    expect(v.today).toBe(true);
    expect(v.meals[1].items).toHaveLength(1);
    expect(v.meals[2].empty).toBe(true);
  });

  test('reads the day against 2,000 kcal when no targets are set, with fiber worked out from it', () => {
    const v = dayView(memoryRepository(), DAY, { today: DAY });
    expect(v.goals).toMatchObject({ kcal: 2000, fib: 28, set: false });
    expect(v.left).toBe(2000);
  });

  test('the next meal is the first one still empty, and dinner once all have food', () => {
    const repo = memoryRepository();
    saveFood(repo, DAY, BREAKFAST, toast);
    expect(nextMealId(dayView(repo, DAY))).toBe(LUNCH);
    saveFood(repo, DAY, LUNCH, toast);
    expect(nextMealId(dayView(repo, DAY))).toBe(SNACK);
    saveFood(repo, DAY, SNACK, toast); saveFood(repo, DAY, DINNER, toast);
    expect(nextMealId(dayView(repo, DAY))).toBe(DINNER);
  });
});

describe('days and weeks', () => {
  test('the strip is last week and this week from Monday, with later days marked', () => {
    const s = stripDays(DAY);
    expect(s).toHaveLength(14);
    expect(s[0]).toMatchObject({ day: '2026-10-19', wd: 'M' });
    expect(s.find(d => d.today)?.day).toBe(DAY);
    expect(s.filter(d => d.future).map(d => d.day)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekDays(DAY)[0]).toBe('2026-10-26');
  });

  test('days with nothing logged sum to no reading, not zero', () => {
    const repo = memoryRepository();
    saveFood(repo, '2026-10-27', BREAKFAST, toast);
    saveFood(repo, '2026-10-27', LUNCH, soup);
    const [mon, tue] = daySums(repo, ['2026-10-26', '2026-10-27']);
    expect(mon).toEqual({ day: '2026-10-26', kcal: null, p: null, meals: 0 });
    expect(Math.round(tue.kcal!)).toBe(550);
    expect(tue).toMatchObject({ p: 28, meals: 2 });
  });

  test('the streak counts back from yesterday until today has food, and a full streak needs every meal', () => {
    const repo = memoryRepository();
    for (const d of ['2026-10-25', '2026-10-26', '2026-10-27']) saveFood(repo, d, BREAKFAST, toast);
    expect(streak(repo, DAY)).toMatchObject({ count: 3, today: false });
    saveFood(repo, DAY, LUNCH, toast);
    expect(streak(repo, DAY)).toMatchObject({ count: 4, today: true });
    expect(streak(repo, DAY, true).count).toBe(0);
  });
});

describe('a meal\'s one-line summary', () => {
  test('names each food up to its first comma, the first capitalised and the rest lower case', () => {
    const repo = memoryRepository();
    saveFood(repo, DAY, BREAKFAST, { ...toast, name: 'Synthetic yogurt, plain 2%' });
    saveFood(repo, DAY, BREAKFAST, { ...soup, name: 'Berries' });
    expect(foodsLine(dayView(repo, DAY, { today: DAY }).meals[0].items)).toBe('Synthetic yogurt, berries');
  });
});
