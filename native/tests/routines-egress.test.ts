import fs from 'node:fs';
import path from 'node:path';
import { routineTables, syncedTables } from '../src/data/catalog';
import { DEFAULT_SYNC_FLAGS, syncTables } from '../src/data/sync/flags';

/* Routine names, doses, units, notes, sites and supply are medication data. They stay on the phone.
   The telemetry and AI tests push the synthetic values at each way out; this file checks the code paths. */

const SRC = path.resolve(__dirname, '../src');
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

test('the routines data closure has no network, telemetry, logging, sync or AI capability', () => {
  const start = path.join(SRC, 'features/routines');
  // The store, the tables behind it and the plain model logic. The screens are checked below.
  const roots = [path.join(start, 'store.ts'), path.join(start, 'model.ts'), ...files(path.join(start, 'data')), ...files(path.join(start, 'model'))];
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bconsole\s*\.|\b(?:Sentry|PostHog|posthog)\s*\.|\b(?:captureException|captureMessage|captureEvent|track|capture|sendBeacon)\s*\(/);
    // Type-only imports are erased before the app runs, so they carry no capability.
    for (const match of text.matchAll(/import\s+(?!type\b)[\s\S]*?from\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      // The shared store hook is the one outside package, React itself.
      if (spec === 'react' && file === path.join(start, 'store.ts')) continue;
      expect([path.relative(SRC, file), spec, spec.startsWith('.') || spec.startsWith('@/')]).toEqual([path.relative(SRC, file), spec, true]);
      const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      const next = ['.ts', '.tsx'].map(ext => base + ext).find(candidate => fs.existsSync(candidate)) ?? base;
      expect(next).not.toMatch(/\/auth\/|\/sync\/|\/server\/|\/ai\/|telemetry|analytics|sentry|posthog/i);
      // The model is plain logic: it may only reach other model files.
      if (file.includes(`${path.sep}model${path.sep}`)) expect(path.dirname(next)).toBe(path.join(start, 'model'));
      visit(next);
    }
  }
  roots.forEach(visit);
  expect(roots.length).toBeGreaterThanOrEqual(4);
  // Outside Routines it reaches only the list of what to drop when the account changes, which holds no data.
  const shared = [path.join(SRC, 'core', 'session-memory.ts')];
  expect([...seen].filter(file => !file.startsWith(start))).toEqual(shared);
});

test('no telemetry or AI code reads a routine table or imports routine code', () => {
  const outward = files(SRC).filter(file => /\/telemetry\/|\/ai\//.test(file));
  expect(outward.length).toBeGreaterThan(5);
  for (const file of outward) {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/daily_(?:blocks|items|placements|compounds|logs|types|prefs)/);
    expect(text).not.toMatch(/features\/routines|routine-catalog|readRoutineStore|sqlite-store/);
  }
  const functions = path.resolve(__dirname, '../../supabase/functions');
  for (const file of files(functions)) expect(fs.readFileSync(file, 'utf8')).not.toMatch(/daily_(?:blocks|items|placements|compounds|logs|types|prefs)/);
});

test('routine tables are not in the list the sync engine pushes and pulls', () => {
  expect(routineTables).toHaveLength(8);
  expect(DEFAULT_SYNC_FLAGS.dailyRoutines).toBe(false);
  for (const table of routineTables) {
    expect(syncedTables).not.toContain(table);
    expect(syncTables(DEFAULT_SYNC_FLAGS)).not.toContain(table);
    expect(syncTables({ syncedV1Columns: true })).not.toContain(table);
  }
});

/* The Routines tab and its screens. They draw the routine rows, so the same rule holds for them as for the
   store: nothing in them may send, log or report, and no import of theirs may lead to code that does. */
const UI = path.join(SRC, 'features/routines');
const OUTWARD = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bconsole\s*\.|\b(?:Sentry|PostHog|posthog)\s*\.|\b(?:captureException|captureMessage|captureEvent|track|capture|sendBeacon)\s*\(/;
const imports = (text: string) => [...text.matchAll(/import\s+(?!type\b)[\s\S]*?from\s*['"]([^'"]+)['"]/g)].map(match => match[1]);

test('the Routines screens send, log and report nothing, and import no telemetry, sync, server or AI code', () => {
  const own = files(UI);
  expect(own.length).toBeGreaterThanOrEqual(12);
  for (const file of own) {
    const text = fs.readFileSync(file, 'utf8');
    expect([path.relative(SRC, file), OUTWARD.test(text)]).toEqual([path.relative(SRC, file), false]);
    for (const spec of imports(text)) expect(spec).not.toMatch(/\/sync\/|\/server\/|\/ai\/|telemetry|analytics|sentry|posthog/i);
  }
});

test('the only routes for routines are the tab and its routines folder, and they only open the Routines screens', () => {
  const app = path.join(SRC, 'app');
  const routes = files(app).map(file => path.relative(app, file)).filter(file => /routine/i.test(file) && !/workout/i.test(file)).sort();
  expect(routes.filter(file => file !== '(tabs)/routines.tsx' && !file.startsWith(`routines${path.sep}`))).toEqual([]);
  expect(routes).toContain('(tabs)/routines.tsx');
  for (const route of routes) {
    const text = fs.readFileSync(path.join(app, route), 'utf8');
    expect([route, OUTWARD.test(text)]).toEqual([route, false]);
    // A route file is a thin door: it may reach the Routines screens, the router and the strings, and nothing else.
    for (const spec of imports(text)) expect([route, /^(?:@\/features\/routines\/[\w-]+|@\/auth\/provider|@\/components\/[\w-]+|@\/i18n\/en|expo-router)$/.test(spec)]).toEqual([route, true]);
  }
  // No other route reads routine data.
  const others = files(app).filter(file => !routes.includes(path.relative(app, file)) && path.relative(app, file) !== '_layout.tsx');
  expect(others.some(file => /features\/routines/.test(fs.readFileSync(file, 'utf8')))).toBe(false);
});

test('telemetry does not count the Routines tab or see its path', () => {
  const telemetry = files(path.join(SRC, 'telemetry')).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  expect(telemetry).not.toMatch(/['"`]\/?routines['"`]/);
});

/* Setup's routine step writes routine data through the store. Each file outside Routines that reads it is named
   here, one path at a time, and held to the same rule as the Routines screens. A new reader fails this test until
   its path is added on purpose. */
const READERS = [
  // Setup's routine step opens the store and hands it the suggested routines. save.ts beside it names the store's
  // type only, which carries nothing at run time.
  'features/onboarding/flow/flow.tsx',
  // Look around first hands the routines made there to the new account, on the phone, in one transaction.
  'features/onboarding/demo-transfer.ts',
  // The person's own export: a file made on the phone and handed to the share sheet only when they ask for it.
  'features/progress/export.ts',
  // Routines with Remind me on become local notifications, scheduled on the phone. plan.ts beside it is plain logic.
  'features/reminders/plan.ts',
  'features/reminders/sync.tsx',
];
/* The sample items of "Look around first" and the leak-test rows. Both are made up. */
const FIXTURE_READERS = ['routines.ts'];
const ROUTINE_HOMES = [UI, path.join(SRC, 'app/routines')];
const insideRoutines = (file: string) => ROUTINE_HOMES.some(home => file === home || file.startsWith(home + path.sep)) || file === path.join(SRC, 'app/(tabs)/routines.tsx');
function resolved(file: string, spec: string): string {
  return spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : spec;
}
const readsRoutines = (file: string) => imports(fs.readFileSync(file, 'utf8')).some(spec => insideRoutines(resolved(file, spec)) || ROUTINE_HOMES.some(home => resolved(file, spec).startsWith(home + path.sep)));

test('outside Routines only the named setup files read routine data, and they send, log and report nothing', () => {
  const readers = files(SRC).filter(file => !insideRoutines(file) && readsRoutines(file)).map(file => path.relative(SRC, file)).sort();
  expect(readers).toEqual([...READERS].sort());
  for (const reader of READERS) {
    const file = path.join(SRC, reader), text = fs.readFileSync(file, 'utf8');
    expect([reader, OUTWARD.test(text)]).toEqual([reader, false]);
    for (const spec of imports(text)) expect([reader, spec, /\/sync\/|\/server\/|\/ai\/|telemetry|analytics|sentry|posthog/i.test(resolved(file, spec))]).toEqual([reader, spec, false]);
  }
  const fixtures = path.resolve(__dirname, '../fixtures');
  expect(files(fixtures).filter(readsRoutines).map(file => path.relative(fixtures, file)).sort()).toEqual(FIXTURE_READERS);
});

test('the charts and Home do not read routines', () => {
  for (const file of ['features/insights/mini-chart.tsx', 'features/body/chart.tsx', 'features/home/screen.tsx']) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    expect([file, /features\/routines/.test(text)]).toEqual([file, false]);
  }
});

/* The app never works out an amount: no routine code may suggest one. */
const ADVICE = /recommended dose|should take|prescrib|typical dose|suggested dose|you should/i;

test('no routine code calls the network, analytics or crash reporting, and none suggests an amount', () => {
  const own = files(UI);
  expect(own).toContain(path.join(UI, 'data', 'sqlite-store.ts'));
  for (const file of own) {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/sendBeacon/);
    expect(src).not.toMatch(/posthog/i);
    expect(src).not.toMatch(/Sentry/);
    expect(src).not.toMatch(/captureMessage|captureException/);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/from ['"][^'"]*(telemetry|analytics|food-ai|workout-ai|\/ai\/)/);
    expect(src).not.toMatch(ADVICE);
  }
});
