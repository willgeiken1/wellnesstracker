import { moveContainer, draftOk } from '../src/features/food/containers-sheet';
import { addDrink, DEFAULT_CONTAINERS, drinksOn, FLOZ, fixQuick, litresOn, readWater, removeDrink, setContainers, setWaterGoal, setWaterUnit, sizeText, waterAmt, type Container } from '../src/features/food/water';
import { stepOther } from '../src/features/food/water-sheet';
import { memoryRepository } from './workout-repository';

jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));

const DAY = '2026-10-28';
const c = (id: string, quick: boolean): Container => ({ id, name: `Cup ${id}`, oz: 8, icon: 'glass', quick });

describe('water', () => {
  test('starts with the default containers, ounces and a goal of 100 oz', () => {
    const s = readWater(memoryRepository());
    expect(s.containers).toEqual(fixQuick([...DEFAULT_CONTAINERS]));
    expect(s.unit).toBe('oz');
    expect(Math.round(s.goal * FLOZ)).toBe(100);
  });

  test('keeps two to four containers on quick add', () => {
    expect(fixQuick([c('a', false), c('b', false), c('c', false)]).map(x => x.quick)).toEqual([true, true, false]);
    expect(fixQuick([c('a', true), c('b', true), c('c', true), c('d', true), c('e', true)]).map(x => x.quick)).toEqual([true, true, true, true, false]);
    expect(fixQuick([c('a', false)]).map(x => x.quick)).toEqual([true]);
  });

  test('logs a drink, takes it off and puts it back in the same place', () => {
    const repo = memoryRepository(), cup = readWater(repo).containers[0];
    addDrink(repo, DAY, { c: cup }, 1);
    const second = addDrink(repo, DAY, { oz: 12 }, 2);
    addDrink(repo, DAY, { c: cup }, 3);
    expect(drinksOn(readWater(repo), DAY).map(d => d.oz)).toEqual([cup.oz, 12, cup.oz]);
    expect(second.drink.name).toBe('Other amount');
    const gone = removeDrink(repo, DAY, second.drink.id);
    expect(drinksOn(readWater(repo), DAY)).toHaveLength(2);
    gone.undo(); gone.undo();
    expect(drinksOn(readWater(repo), DAY).map(d => d.id)[1]).toBe(second.drink.id);
    expect(litresOn(readWater(repo), DAY)).toBeCloseTo((cup.oz * 2 + 12) / FLOZ);
    second.undo();
    expect(drinksOn(readWater(repo), DAY)).toHaveLength(2);
  });

  test('saves the unit, the goal within reason, and the containers', () => {
    const repo = memoryRepository();
    setWaterUnit(repo, 'ml'); setWaterGoal(repo, 2.5); setWaterGoal(repo, 20);
    setContainers(repo, [c('a', false), c('b', false)]);
    const s = readWater(repo);
    expect(s).toMatchObject({ unit: 'ml', goal: 2.5 });
    expect(s.containers.map(x => x.quick)).toEqual([true, true]);
  });

  test('shows amounts in ounces or millilitres', () => {
    expect(waterAmt(1.68, 'ml')).toBe('1,680 mL');
    expect(waterAmt(57 / FLOZ, 'oz')).toBe('57 oz');
    expect(sizeText(16.9, 'oz')).toBe('16.9 oz');
    expect(sizeText(16.9, 'ml')).toBe('500 mL');
  });

  test('the other amount steps by 1 oz or 50 mL and stays within bounds', () => {
    expect(stepOther(12, 'oz', true)).toBe(13);
    expect(stepOther(1, 'oz', false)).toBe(1);
    expect(stepOther(64, 'oz', true)).toBe(64);
    expect(Math.round(stepOther(500 / 1000 * FLOZ, 'ml', true) / FLOZ * 1000)).toBe(550);
    expect(Math.round(stepOther(50 / 1000 * FLOZ, 'ml', false) / FLOZ * 1000)).toBe(50);
  });

  test('moves a container and checks a new size', () => {
    const cs = [c('a', true), c('b', true), c('c', false)];
    expect(moveContainer(cs, 0, 2).map(x => x.id)).toEqual(['b', 'c', 'a']);
    expect(moveContainer(cs, 2, -5).map(x => x.id)).toEqual(['c', 'a', 'b']);
    expect(cs.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect([null, 0.5, 1, 135, 136].map(oz => draftOk({ oz }))).toEqual([false, false, true, true, false]);
  });
});
