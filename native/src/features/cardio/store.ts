import type { Repository } from '../../data/repository';
import type { Row } from '../../data/rows';
import { defaults, elapsedMs, kcalPerMin, localDay, machines, pauseLive, resumeLive, type Machine, type Settings, type Timer } from '../../core/cardio/rules';
export interface Segment { at: number; settings: Settings }
export interface Live extends Timer { machine: Machine; segments: Segment[] }
interface FinishedInput { day: string; machine: Machine; durationMs: number; settings: Settings; notes: string }
const LIVE = 'cardio.live';
export function machineDefaults(machine: Machine): Settings {
  return { ...defaults, incline: machine === 'treadmill' ? 12 : 0 };
}
function validateSettings(settings: Settings) {
  if (!Object.values(settings).every(Number.isFinite) || settings.mph < 0 || settings.mph > 30 || settings.incline < 0 || settings.incline > 40 || !Number.isInteger(settings.level) || settings.level < 1 || settings.level > 20) throw new Error('Invalid cardio settings');
}
function validateFinish(day: string, duration: number, today: string) {
  const stamp = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== day || day > today || !Number.isSafeInteger(duration) || duration < 60000 || duration > 21600000) throw new Error('Invalid cardio session');
}
/** Local machine settings never enter notes or the synced row. Only repo.save writes the outbox. */
export class CardioStore {
  constructor(readonly repo: Repository, readonly viewRevision = 0) {}
  live(): Live | null { return this.repo.localGet<Live | null>(LIVE) ?? null; }
  goal() { return this.repo.localGet<number>('cardio.goal') ?? 150; }
  setGoal(minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new Error('Invalid cardio goal');
    this.repo.localSave('cardio.goal', minutes);
  }
  sessions() { return this.repo.list('cardio_sessions').sort((a, b) => String(b.data.day).localeCompare(String(a.data.day)) || b.updated_at - a.updated_at); }
  segments(id: string) { return this.repo.localGet<Segment[]>(`cardio.segments.${id}`); }
  start(machine: Machine, settings = machineDefaults(machine), now = Date.now()) {
    if (this.live()) throw new Error('Cardio already active');
    validateSettings(settings);
    this.repo.localSave(LIVE, { machine, startedAt: now, pausedAt: null, pausedMs: 0, segments: [{ at: 0, settings }] } satisfies Live);
  }
  pause(now = Date.now()) { const live = this.live(); if (live) this.repo.localSave(LIVE, pauseLive(live, now)); }
  resume(now = Date.now()) { const live = this.live(); if (live) this.repo.localSave(LIVE, resumeLive(live, now)); }
  cancel() { this.repo.localSave(LIVE, null); }
  change(settings: Settings, now = Date.now()) {
    validateSettings(settings);
    const live = this.live();
    if (live) this.repo.localSave(LIVE, { ...live, segments: [...live.segments, { at: elapsedMs(live, now), settings }] });
  }
  private kcal(machine: Machine, segments: Segment[], duration: number, kg: number) {
    return segments.reduce((sum, s, i) => sum + kcalPerMin(machine, s.settings, kg) * Math.max(0, (segments[i + 1]?.at ?? duration) - s.at) / 60000, 0);
  }
  liveKcal(kg: number, now = Date.now()) {
    const live = this.live();
    return live ? this.kcal(live.machine, live.segments, elapsedMs(live, now), kg) : 0;
  }
  sessionKcal(row: Row, kg: number) {
    const segments = this.segments(row.id);
    // Another device has no intensity data. Do not invent a calorie estimate.
    return segments && machines.includes(row.data.kind as Machine) ? this.kcal(row.data.kind as Machine, segments, Number(row.data.duration_ms), kg) : null;
  }
  finish(now = Date.now()) {
    return this.repo.atomic(() => {
      const live = this.live();
      if (!live) return null;
      const duration = Math.floor(elapsedMs(live, now)), day = localDay(now);
      validateFinish(day, duration, day);
      const row = this.repo.save('cardio_sessions', { day, kind: live.machine, duration_ms: duration, distance_m: null, notes: '' });
      this.repo.localSave(`cardio.segments.${row.id}`, live.segments);
      this.repo.localSave(LIVE, null);
      return row;
    });
  }
  logFinished(input: FinishedInput, today = localDay()) {
    validateFinish(input.day, input.durationMs, today);
    validateSettings(input.settings);
    if (input.notes.length > 2000) throw new Error('Cardio notes too long');
    return this.repo.atomic(() => {
      const row = this.repo.save('cardio_sessions', { day: input.day, kind: input.machine, duration_ms: input.durationMs, distance_m: null, notes: input.notes });
      this.repo.localSave(`cardio.segments.${row.id}`, [{ at: 0, settings: input.settings }]);
      return row;
    });
  }
}
