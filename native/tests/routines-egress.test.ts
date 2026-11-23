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

test('the routines import closure has no network, telemetry, logging, sync or AI capability', () => {
  const start = path.join(SRC, 'features/routines');
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bconsole\s*\.|\b(?:Sentry|PostHog|posthog)\s*\.|\b(?:captureException|captureMessage|captureEvent|track|capture|sendBeacon)\s*\(/);
    // Type-only imports are erased before the app runs, so they carry no capability.
    for (const match of text.matchAll(/import\s+(?!type\b)[\s\S]*?from\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      expect(spec.startsWith('.') || spec.startsWith('@/')).toBe(true);
      const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      const next = ['.ts', '.tsx'].map(ext => base + ext).find(candidate => fs.existsSync(candidate)) ?? base;
      expect(next).not.toMatch(/\/auth\/|\/sync\/|\/server\/|\/ai\/|telemetry|analytics|sentry|posthog/i);
      // The model is plain logic: it may only reach other model files.
      if (file.includes(`${path.sep}model${path.sep}`)) expect(path.dirname(next)).toBe(path.join(start, 'model'));
      visit(next);
    }
  }
  const own = files(start);
  own.forEach(visit);
  expect(own.length).toBeGreaterThanOrEqual(8);
  expect([...seen].every(file => file.startsWith(start))).toBe(true);
});

test('no telemetry or AI code reads a routine table or imports routine code', () => {
  const outward = files(SRC).filter(file => /\/telemetry\/|\/ai\//.test(file));
  expect(outward.length).toBeGreaterThan(5);
  for (const file of outward) {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/daily_(?:blocks|items|placements|compounds|logs|types|prefs)/);
    expect(text).not.toMatch(/features\/routines|routine-catalog|readRoutineStore/);
  }
  const functions = path.resolve(__dirname, '../../supabase/functions');
  for (const file of files(functions)) expect(fs.readFileSync(file, 'utf8')).not.toMatch(/daily_(?:blocks|items|placements|compounds|logs|types|prefs)/);
});

test('routine tables are not in the list the sync engine pushes and pulls', () => {
  expect(routineTables).toHaveLength(7);
  expect(DEFAULT_SYNC_FLAGS.dailyRoutines).toBe(false);
  for (const table of routineTables) {
    expect(syncedTables).not.toContain(table);
    expect(syncTables(DEFAULT_SYNC_FLAGS)).not.toContain(table);
    expect(syncTables({ syncedV1Columns: true })).not.toContain(table);
  }
});

/* The Routines tab and its screens. They draw the routine rows, so the same rule holds for them as for the
   store: nothing in them may send, log or report, and no import of theirs may lead to code that does. */
const UI = path.join(SRC, 'features/routines-ui');
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
    for (const spec of imports(text)) expect([route, /^(?:@\/features\/routines-ui\/[\w-]+|@\/i18n\/en|expo-router)$/.test(spec)]).toEqual([route, true]);
  }
  // No other route reads routine data.
  const others = files(app).filter(file => !routes.includes(path.relative(app, file)) && path.relative(app, file) !== '_layout.tsx');
  expect(others.some(file => /features\/routines/.test(fs.readFileSync(file, 'utf8')))).toBe(false);
});

test('telemetry does not count the Routines tab or see its path', () => {
  const telemetry = files(path.join(SRC, 'telemetry')).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  expect(telemetry).not.toMatch(/['"`]\/?routines['"`]/);
});
