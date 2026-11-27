import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
import type { Repository } from '@/data/repository';
import type { Row } from '@/data/rows';
import { WorkoutStore } from '@/data/workout/store';
import { meals } from '@/features/food/model';
import type { RoutinesState } from '@/features/routines/model';
import { readStoredRoutines } from '@/features/routines/store';
import { rpeKey } from '@/features/workout/logger/model';
import { cardioName } from '@/features/workout/training-data';
import { addDays, daysBetween, finite, type ProgressData } from './model';
import { metricView } from './metric';

/**
 * Export: the person's own logs as CSV files in one zip, handed to the system share sheet. Worked out on this phone from
 * what is logged here and the readings Progress holds in memory. The day score is not exported (it is worked out here,
 * never stored) and photos are never exported. Nothing is sent anywhere except where the person shares the file.
 */
export type ExportKind = 'weight' | 'sleep' | 'heart' | 'steps' | 'food' | 'work' | 'rout';
export const EXPORT_KINDS: readonly ExportKind[] = ['weight', 'sleep', 'heart', 'steps', 'food', 'work', 'rout'];
export type ExportRange = '30' | '90' | 'all';
export interface CsvFile { name: string; csv: string }

/** One CSV cell: quoted when it holds a comma, quote or line break; text that a spreadsheet would run as a formula is
 * prefixed with an apostrophe so it stays text. */
export function cell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;

/** The first day kept for a range, or null for all time. */
export const rangeStart = (today: string, range: ExportRange) => range === 'all' ? null : addDays(today, -(Number(range) - 1));

/** The CSV files for the chosen kinds and range. Days with nothing logged are left out, never written as 0. */
export function buildCsvs(repo: Repository, d: ProgressData, kinds: readonly ExportKind[], range: ExportRange): CsvFile[] {
  const from = rangeStart(d.today, range), keep = (day: unknown) => typeof day === 'string' && day <= d.today && (from == null || day >= from);
  const unit = d.unit, kgTo = (kg: number) => unit === 'lb' ? kg * 2.2046226218487757 : kg;
  const daily = (key: 'sleep' | 'hrv' | 'rhr' | 'steps') => {
    const v = d.days[key], out: [string, number][] = [];
    for (let i = 0; i < v.length; i++) { const day = addDays(d.today, i - (v.length - 1)), x = v[i]; if (finite(x) && keep(day)) out.push([day, x]); }
    return out;
  };
  const files: CsvFile[] = [];
  for (const kind of kinds) {
    if (kind === 'weight') {
      const rows: unknown[][] = [];
      for (const r of repo.list('weigh_ins').filter(r => keep(r.data.day)).sort(byDay)) {
        const kg = num(r.data.weight_kg); if (kg == null || kg <= 0) continue;
        rows.push([r.data.day, 'Weight', kgTo(kg), unit, r.data.source === 'healthkit' ? 'Apple Health' : 'Insight']);
      }
      for (const m of d.measures) if (keep(m.day)) for (const [k, cm] of Object.entries(m.cm)) if (finite(cm)) rows.push([m.day, cap(k), unit === 'lb' ? cm / 2.54 : cm, unit === 'lb' ? 'in' : 'cm', 'Insight']);
      for (const b of d.bodyFat) if (keep(b.day)) rows.push([b.day, 'Body fat', b.pct, '%', b.health ? 'Apple Health' : 'Insight']);
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      files.push({ name: 'weight-and-body.csv', csv: csv(['date', 'measure', 'value', 'unit', 'source'], rows) });
    } else if (kind === 'sleep') {
      // Each night says where it came from: Oura, or Apple Health where the ring had nothing that night.
      const v = d.days.sleep, from = (day: string) => d.sleepFrom && d.sleepFrom.length === v.length ? d.sleepFrom[v.length - 1 - daysBetween(day, d.today)] : null;
      files.push({ name: 'sleep.csv', csv: csv(['date', 'hours_asleep', 'source'], daily('sleep').map(([day, h]) => [day, h, from(day) ?? metricView(d, 'sleep').src])) });
    } else if (kind === 'heart') {
      // HRV keeps its one source: Apple Health's is SDNN and Oura's is RMSSD, so the column says which.
      const hrv = new Map(daily('hrv')), rhr = new Map(daily('rhr')), days = [...new Set([...hrv.keys(), ...rhr.keys()])].sort();
      const hrvName = metricView(d, 'hrv').src === 'Oura' ? 'hrv_rmssd_ms' : 'hrv_sdnn_ms';
      files.push({ name: 'heart.csv', csv: csv(['date', hrvName, 'resting_heart_rate_bpm', 'source'], days.map(day => [day, hrv.get(day) ?? null, rhr.get(day) ?? null, metricView(d, 'hrv').src])) });
    } else if (kind === 'steps') {
      files.push({ name: 'steps.csv', csv: csv(['date', 'steps'], daily('steps').map(([day, n]) => [day, Math.round(n)])) });
    } else if (kind === 'food') {
      const mealName = new Map(meals(repo).map(m => [m.id, m.name]));
      const rows = repo.list('food_entries').filter(r => keep(r.data.day)).sort(byDay).map(r => {
        const kj = num(r.data.energy_kj);
        return [r.data.day, mealName.get(String(r.data.meal_id)) ?? '', r.data.name, num(r.data.amount_g), kj == null ? null : Math.round(kj / 4.184),
          num(r.data.protein_g), num(r.data.carbs_g), num(r.data.fat_g), num(r.data.fiber_g), num(r.data.sugar_g), num(r.data.sodium_mg)];
      });
      files.push({ name: 'food-log.csv', csv: csv(['date', 'meal', 'food', 'amount_g', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'], rows) });
    } else if (kind === 'work') {
      const entries = group(repo.list('entries'), 'session_id'), sets = group(repo.list('sets'), 'entry_id'), rows: unknown[][] = []
      const store = new WorkoutStore(repo);
      for (const s of repo.list('sessions').filter(s => s.data.finished_at != null && keep(s.data.day)).sort(byDay)) {
        for (const e of (entries.get(s.id) ?? []).sort(byPos)) for (const st of (sets.get(e.id) ?? []).sort(byPos)) {
          const kg = num(st.data.weight_kg), reps = num(st.data.reps);
          if (reps == null && kg == null) continue;
          // The logger keeps RPE beside the set, by its exercise and place, rather than on the set row.
          const position = Number(st.data.position ?? 0), rpe = num(st.data.rpe) ?? num(localRpe(repo, e.id, position));
          // A one-side-at-a-time set keeps each side's result; weight and reps are the weaker side's, as the logger shows.
          const lk = num(st.data.left_weight_kg), rk = num(st.data.right_weight_kg), side = (k: number | null) => k == null ? null : kgTo(k);
          rows.push([s.data.day, s.data.name, e.data.exercise, position + 1, kg == null ? null : kgTo(kg), unit, reps, rpe, store.setTag(e.id, st) ?? '',
            side(lk), num(st.data.left_reps), side(rk), num(st.data.right_reps)]);
        }
      }
      files.push({ name: 'workouts-and-sets.csv', csv: csv(['date', 'workout', 'exercise', 'set', 'weight', 'unit', 'reps', 'rpe', 'tag', 'left_weight', 'left_reps', 'right_weight', 'right_reps'], rows) });
      // Cardio is logged on its own (machines, runs and rides), so it gets its own file when there is any.
      const cardio = repo.list('cardio_sessions').filter(c => keep(c.data.day)).sort(byDay).map(c => {
        const ms = num(c.data.duration_ms), m = num(c.data.distance_m);
        return [c.data.day, cardioName(String(c.data.kind ?? '')), ms == null ? null : Math.round(ms / 60000), m == null ? null : m / 1000, c.data.notes ?? ''];
      });
      if (cardio.length) files.push({ name: 'cardio.csv', csv: csv(['date', 'activity', 'minutes', 'distance_km', 'notes'], cardio) });
    } else if (kind === 'rout') {
      const ex = group(repo.list('routine_exercises'), 'routine_id'), rows: unknown[][] = [];
      for (const r of repo.list('routines').sort(byPos)) for (const e of (ex.get(r.id) ?? []).sort(byPos))
        rows.push([r.data.name, e.data.exercise, num(e.data.target_sets), num(e.data.target_reps), num(e.data.rep_min), num(e.data.rep_max)]);
      files.push({ name: 'routines.csv', csv: csv(['routine', 'exercise', 'target_sets', 'target_reps', 'rep_min', 'rep_max'], rows) });
      // The Routines tab keeps its own routines, items and check-offs in this phone's local storage.
      const tab = routinesTab(repo);
      if (tab) {
        const all = [...tab.routines, ...tab.hidden], hidden = new Set(tab.hidden.map(r => r.id)), name = new Map(all.map(r => [r.id, r.name])), item = new Map(tab.items.map(i => [i.id, i]));
        const itemRows: unknown[][] = [];
        for (const r of all) for (const i of tab.items.filter(x => x.routines.includes(r.id)))
          itemRows.push([r.name, hours(r.from), hours(r.to), weekdays(r.days), hidden.has(r.id) ? 'hidden' : pausedOn(r, d.today) ? 'paused' : 'on',
            i.name, i.type, i.dose, hours(i.h), weekdays(i.days), i.left ?? null, i.note ?? '']);
        files.push({ name: 'routine-items.csv', csv: csv(['routine', 'routine_from', 'routine_to', 'routine_days', 'routine_state', 'item', 'type', 'dose', 'time', 'item_days', 'on_hand', 'note'], itemRows) });
        const history: unknown[][] = [];
        for (const day of Object.keys(tab.log).filter(keep).sort()) for (const [id, mark] of Object.entries(tab.log[day])) {
          const i = item.get(id);
          history.push([day, i?.name ?? '', (i?.routines ?? []).map(r => name.get(r) ?? '').filter(Boolean).join('; '), mark === 'd' ? 'done' : 'skipped', tab.used?.[day]?.[id] ?? null]);
        }
        files.push({ name: 'routine-history.csv', csv: csv(['date', 'item', 'routines', 'status', 'used_from_on_hand'], history) });
      }
    }
  }
  return files;
}
/** The Routines tab's saved state for this account, or null when it has none. */
function routinesTab(repo: Repository): RoutinesState | null { try { return readStoredRoutines(repo); } catch { return null; } }
const hours = (h: unknown) => typeof h === 'number' && Number.isFinite(h) ? `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}` : null;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdays = (days: number[] | null) => !days || days.length >= 7 ? 'every day' : [...days].sort().map(x => WEEKDAY[x] ?? '').join(' ');
const pausedOn = (r: { pauses: { from: string; until: string }[] }, day: string) => r.pauses.some(p => p.from <= day && day < p.until);
function localRpe(repo: Repository, entryId: string, position: number): unknown { try { return repo.localGet<unknown>(rpeKey(entryId, position)); } catch { return null; } }
const cap = (s: string) => s === 'arm' ? 'Upper arm' : s.charAt(0).toUpperCase() + s.slice(1);
const byDay = (a: Row, b: Row) => String(a.data.day).localeCompare(String(b.data.day)) || a.id.localeCompare(b.id);
const byPos = (a: Row, b: Row) => Number(a.data.position ?? 0) - Number(b.data.position ?? 0) || a.id.localeCompare(b.id);
function group(rows: Row[], key: string) { const m = new Map<string, Row[]>(); for (const r of rows) { const k = String(r.data[key]); const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); } return m; }

/* ---------- zip (stored, no compression) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** A zip archive of the files, stored without compression, so any spreadsheet app or Files can open it. */
export function zip(files: readonly CsvFile[], at = new Date()): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2), date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.csv), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); local.set(name, 30);
    const cen = new Uint8Array(46 + name.length), cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); cen.set(name, 46);
    parts.push(local, data); central.push(cen); offset += local.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at2 = 0; for (const p of all) { out.set(p, at2); at2 += p.length; }
  return out;
}

/** Writes the zip to a temporary folder in Caches, opens the share sheet, and removes the folder after. */
export async function shareExport(files: readonly CsvFile[], name: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.');
  const dir = new Directory(Paths.cache, `export-${randomUUID()}`);
  try {
    dir.create();
    const file = new File(dir, name);
    await file.write(zip(files));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } finally {
    try { dir.delete(); } catch { /* best effort once the share sheet closes */ }
  }
}
