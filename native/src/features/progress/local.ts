import type { Repository } from '@/data/repository';
import { deleteProgressPhoto, PROGRESS_PHOTOS_FOLDER, PROGRESS_PHOTOS_PENDING_KEY } from '@/core/owner-files';
import type { Row } from '@/data/rows';
import { finite, MEASURE_KEYS, type MeasureKey, type Measured, type Pose, type ProgressPhoto } from './model';

/**
 * What Progress keeps that has no synced table: progress photos (on this phone only: never synced, sent or exported), the
 * neck measurement (the synced measurements table has no neck column) and body fat typed in by hand. All in the
 * repository's local, per-person storage, which is never part of the sync queue.
 */
const PHOTOS = 'progressPhotos', NECK = 'progressNeck', FAT = 'progressBodyFat', REMIND = 'progressPhotoReminder', HEALTH_WEIGHT = 'progressWeightFromHealth';

export interface StoredPhoto { id: string; day: string; kg: number | null; pose: Pose; uri: string }
function list<T>(repo: Repository, key: string): T[] { try { const v = repo.localGet<T[]>(key); return Array.isArray(v) ? v : []; } catch { return []; } }

export function readPhotos(repo: Repository): ProgressPhoto[] {
  return list<StoredPhoto>(repo, PHOTOS).filter(p => p && typeof p.uri === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day))
    .map(p => ({ id: p.id, day: p.day, kg: finite(p.kg) ? p.kg : null, pose: (['Front', 'Side', 'Back'] as const).includes(p.pose) ? p.pose : 'Front', uri: p.uri }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
export function addPhoto(repo: Repository, photo: StoredPhoto) { repo.localSave(PHOTOS, [...list<StoredPhoto>(repo, PHOTOS), photo]); }

/** The address a new photo's file will have once moved in, as noted before the move. */
const plannedAddress = (id: string) => `${PROGRESS_PHOTOS_FOLDER}/${id.replace(/[^a-zA-Z0-9-]/g, '')}.jpg`;
function unpend(repo: Repository, address: string) {
  try { repo.localSave(PROGRESS_PHOTOS_PENDING_KEY, list<string>(repo, PROGRESS_PHOTOS_PENDING_KEY).filter(a => a !== address)); } catch { /* a note for a file that is gone or saved is harmless */ }
}
/**
 * Takes in a new photo: notes its file's address first (nothing is moved if that fails), moves the file in, then saves the
 * photo. If the save fails, the file is deleted; a file that can't be deleted keeps its noted address, so departure still
 * finds it and the photo never stays on the phone unknown. Throws when the photo was not saved.
 */
export async function takeInPhoto(repo: Repository, photo: Omit<StoredPhoto, 'uri'>, move: (id: string) => Promise<string>): Promise<StoredPhoto> {
  const planned = plannedAddress(photo.id);
  repo.localSave(PROGRESS_PHOTOS_PENDING_KEY, [...list<string>(repo, PROGRESS_PHOTOS_PENDING_KEY), planned]);
  const saved = { ...photo, uri: await move(photo.id) };
  try { addPhoto(repo, saved); } catch (e) { if (deleteProgressPhoto(saved.uri)) unpend(repo, planned); throw e; }
  unpend(repo, planned);
  return saved;
}
/** Deletes one progress photo: its file first, then its address. If the file can't be deleted the address stays, so it can be retried. */
export function removePhoto(repo: Repository, id: string) {
  const all = list<StoredPhoto>(repo, PHOTOS), gone = all.find(p => p.id === id);
  if (gone && !deleteProgressPhoto(gone.uri)) return;
  repo.localSave(PHOTOS, all.filter(p => p.id !== id));
}

/** The weekly photo reminder starts off, like every reminder; only a saved On (the person's own choice) turns it on. */
export function readReminder(repo: Repository): boolean { try { return repo.localGet<boolean>(REMIND) === true; } catch { return false; } }
export function saveReminder(repo: Repository, on: boolean) { repo.localSave(REMIND, on); }

/** Whether new Apple Health weigh-ins fill in on their own when Body opens. On unless turned off in Log weight. */
export function readWeightFromHealth(repo: Repository): boolean { try { return repo.localGet<boolean>(HEALTH_WEIGHT) !== false; } catch { return true; } }
export function saveWeightFromHealth(repo: Repository, on: boolean) { repo.localSave(HEALTH_WEIGHT, on); }

/** Tape measurements, oldest first: the synced rows (metres) joined with the neck readings kept here. */
export function readMeasures(repo: Repository): Measured[] {
  const byDay = new Map<string, Measured>();
  const at = (day: string) => { let m = byDay.get(day); if (!m) { m = { day, cm: {} }; byDay.set(day, m); } return m; };
  const rows = repo.list('measurements').filter((r: Row) => r.deleted_at === null && typeof r.data.day === 'string')
    .sort((a, b) => a.updated_at - b.updated_at);
  for (const r of rows) {
    const m = at(String(r.data.day));
    for (const k of ['chest', 'waist', 'hips', 'arm', 'thigh'] as const) { const v = r.data[`${k}_m`]; if (finite(v) && v > 0) m.cm[k] = v * 100; }
  }
  for (const n of list<{ day: string; cm: number }>(repo, NECK)) if (finite(n.cm) && n.cm > 0 && typeof n.day === 'string') at(n.day).cm.neck = n.cm;
  return [...byDay.values()].filter(m => Object.keys(m.cm).length).sort((a, b) => a.day.localeCompare(b.day));
}
/** Saves one day's measurements: one synced row for the tape, the neck here. Values are centimetres. */
export function saveMeasures(repo: Repository, day: string, cm: Partial<Record<MeasureKey, number>>) {
  const m = (k: MeasureKey) => finite(cm[k]) && (cm[k] as number) > 0 ? (cm[k] as number) / 100 : null;
  const existing = repo.list('measurements').find(r => r.deleted_at === null && r.data.day === day);
  repo.save('measurements', { day, waist_m: m('waist'), hips_m: m('hips'), chest_m: m('chest'), arm_m: m('arm'), thigh_m: m('thigh') }, existing?.id);
  if (finite(cm.neck) && cm.neck > 0) repo.localSave(NECK, [...list<{ day: string; cm: number }>(repo, NECK).filter(n => n.day !== day), { day, cm: cm.neck }]);
}
export const MEASURED_KEYS = MEASURE_KEYS;

export function readBodyFat(repo: Repository): { day: string; pct: number }[] {
  return list<{ day: string; pct: number }>(repo, FAT).filter(b => finite(b.pct) && b.pct > 0 && b.pct < 100 && typeof b.day === 'string')
    .sort((a, b) => a.day.localeCompare(b.day));
}
export function saveBodyFat(repo: Repository, day: string, pct: number) {
  repo.localSave(FAT, [...list<{ day: string; pct: number }>(repo, FAT).filter(b => b.day !== day), { day, pct }]);
}
