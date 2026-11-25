import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
import type { Repository } from '@/data/repository';
import type { Row } from '@/data/rows';
import { meals } from '@/features/food/model';
import { addDays, finite, type ProgressData } from './model';
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
      files.push({ name: 'sleep.csv', csv: csv(['date', 'hours_in_bed', 'source'], daily('sleep').map(([day, h]) => [day, h, metricView(d, 'sleep').src])) });
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
      const entries = group(repo.list('entries'), 'session_id'), sets = group(repo.list('sets'), 'entry_id'), rows: unknown[][] = [];
      for (const s of repo.list('sessions').filter(s => s.data.finished_at != null && keep(s.data.day)).sort(byDay)) {
        for (const e of (entries.get(s.id) ?? []).sort(byPos)) for (const st of (sets.get(e.id) ?? []).sort(byPos)) {
          const kg = num(st.data.weight_kg), reps = num(st.data.reps);
          if (reps == null && kg == null) continue;
          rows.push([s.data.day, s.data.name, e.data.exercise, Number(st.data.position ?? 0) + 1, kg == null ? null : kgTo(kg), unit, reps, num(st.data.rpe), st.data.tag ?? '']);
        }
      }
      files.push({ name: 'workouts-and-sets.csv', csv: csv(['date', 'workout', 'exercise', 'set', 'weight', 'unit', 'reps', 'rpe', 'tag'], rows) });
    } else if (kind === 'rout') {
      const ex = group(repo.list('routine_exercises'), 'routine_id'), rows: unknown[][] = [];
      for (const r of repo.list('routines').sort(byPos)) for (const e of (ex.get(r.id) ?? []).sort(byPos))
        rows.push([r.data.name, e.data.exercise, num(e.data.target_sets), num(e.data.target_reps), num(e.data.rep_min), num(e.data.rep_max)]);
      files.push({ name: 'routines.csv', csv: csv(['routine', 'exercise', 'target_sets', 'target_reps', 'rep_min', 'rep_max'], rows) });
    }
  }
  return files;
}
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
