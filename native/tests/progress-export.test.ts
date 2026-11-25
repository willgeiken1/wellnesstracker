import { saveWeighIn } from '../src/features/body/model';
import { saveFood, meals } from '../src/features/food/model';
import { buildCsvs, cell, crc32, EXPORT_KINDS, rangeStart, zip } from '../src/features/progress/export';
import { emptyProgress, HISTORY } from '../src/features/progress/model';
import { memoryRepository } from './workout-repository';

jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

const TODAY = '2026-11-11';
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
const lines = (csv: string) => csv.trimEnd().split('\r\n');

describe('cells', () => {
  test('quotes commas, quotes and line breaks, and keeps text that looks like a formula as text', () => {
    expect(cell('Oats, with milk')).toBe('"Oats, with milk"');
    expect(cell('The "big" one')).toBe('"The ""big"" one"');
    expect(cell('two\nlines')).toBe('"two\nlines"');
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('+1')).toBe("'+1");
    expect(cell('@sum')).toBe("'@sum");
    expect(cell(-2.5)).toBe('-2.5');
    expect(cell(1 / 3)).toBe('0.333');
    expect(cell(null)).toBe('');
    expect(cell(Number.NaN)).toBe('');
  });
  test('a range keeps that many days, today included', () => {
    expect(rangeStart(TODAY, '30')).toBe('2026-10-13');
    expect(rangeStart(TODAY, 'all')).toBeNull();
  });
});

describe('the CSV files', () => {
  test('weight, food and daily readings keep only days with something logged, and only inside the range', () => {
    const repo = memoryRepository(), d = emptyProgress(TODAY, 'kg');
    repo.save('profile', { name: 'Sample', weight_unit: 'kg' });
    saveWeighIn(repo, 80.4, 'kg', '2026-11-10');
    saveWeighIn(repo, 82, 'kg', '2026-08-01');
    saveFood(repo, TODAY, meals(repo)[0].id, { name: 'Oats, with milk', energy_kj: 400 * 4.184, protein_g: 12, carbs_g: 60, fat_g: 8, ...blank }, 1, undefined, TODAY);
    d.days.steps[HISTORY - 1] = 5000;
    d.days.sleep[HISTORY - 2] = 7.5;
    const files = buildCsvs(repo, d, ['weight', 'food', 'steps', 'sleep'], '30');
    const by = Object.fromEntries(files.map(f => [f.name, lines(f.csv)]));
    expect(Object.keys(by)).toEqual(['weight-and-body.csv', 'food-log.csv', 'steps.csv', 'sleep.csv']);
    expect(by['weight-and-body.csv']).toEqual(['date,measure,value,unit,source', '2026-11-10,Weight,80.4,kg,Insight']);
    expect(by['food-log.csv'][1]).toBe(`${TODAY},${meals(repo)[0].name},"Oats, with milk",,400,12,60,8,,,`);
    expect(by['steps.csv']).toEqual(['date,steps', `${TODAY},5000`]);
    expect(by['sleep.csv']).toHaveLength(2);
    expect(buildCsvs(repo, d, ['weight'], 'all')[0].csv).toContain('2026-08-01,Weight,82');
  });
  test('HRV names its kind by source, so Apple Health and Oura numbers are never read as the same thing', () => {
    const d = emptyProgress(TODAY, 'kg');
    d.days.hrv[HISTORY - 1] = 44; d.days.rhr[HISTORY - 1] = 58;
    d.sources = { oura: false, apple: true, ouraSynced: null };
    expect(lines(buildCsvs(memoryRepository(), d, ['heart'], '30')[0].csv)[0]).toBe('date,hrv_sdnn_ms,resting_heart_rate_bpm,source');
    d.sources = { oura: true, apple: false, ouraSynced: null };
    expect(lines(buildCsvs(memoryRepository(), d, ['heart'], '30')[0].csv)[0]).toBe('date,hrv_rmssd_ms,resting_heart_rate_bpm,source');
  });
  test('nothing is exported as a day score or a photo', () => {
    const files = buildCsvs(memoryRepository(), emptyProgress(TODAY, 'kg'), EXPORT_KINDS, 'all');
    for (const f of files) { expect(f.name).not.toMatch(/score|photo/i); expect(f.csv).not.toMatch(/score|photo/i); }
  });
});

describe('the zip', () => {
  test('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  test('is a stored zip with a local header per file, a central directory and an end record that point at each other', () => {
    const files = [{ name: 'a.csv', csv: 'x,y\r\n' }, { name: 'b.csv', csv: 'é\r\n' }];
    const out = zip(files, new Date(2026, 10, 11, 12, 30)), v = new DataView(out.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdSize = v.getUint32(end + 12, true), cdAt = v.getUint32(end + 16, true);
    expect(cdAt + cdSize).toBe(end);
    let p = cdAt;
    for (const f of files) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      expect(v.getUint16(p + 10, true)).toBe(0); // stored
      expect(v.getUint16(p + 8, true) & 0x0800).toBe(0x0800); // names are UTF-8
      const data = new TextEncoder().encode(f.csv), local = v.getUint32(p + 42, true), nameLen = v.getUint16(p + 28, true);
      expect(v.getUint32(p + 16, true)).toBe(crc32(data));
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      const start = local + 30 + v.getUint16(local + 26, true);
      expect(new TextDecoder().decode(out.slice(start, start + data.length))).toBe(f.csv);
      expect(new TextDecoder().decode(out.slice(p + 46, p + 46 + nameLen))).toBe(f.name);
      p += 46 + nameLen;
    }
  });
});
