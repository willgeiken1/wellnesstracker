import { columns, supportsPurgeTimezone, type Row } from './rows';
const dated = new Set(['sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days','daily_logs']);
/** The calendar day a moment falls on in the marker's zone, or undefined when this phone cannot format it. */
function calendarDay(at: number, tz: unknown): string | undefined {
  if (!supportsPurgeTimezone(tz)) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
    const part = (type: string) => parts.find(p=>p.type===type)!.value;
    return `${part('year').padStart(4,'0')}-${part('month')}-${part('day')}`;
  } catch { return undefined; } // Legacy timestamps or device ICU differences must not block pulls.
}
function dayBefore(day: string) {
  return new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7))-1,Number(day.slice(8,10))-1)).toISOString().slice(0,10);
}
/** Parent purge versions survive payload erasure. No health values are retained. */
export function matchesPurge(row: Row, marker: Row, get: (table: 'sessions'|'entries', id: string) => Row | undefined): boolean {
  if (marker.deleted_at !== null || marker.data.cutoff_ms == null || marker.data.from_day == null || marker.data.to_day == null ||
      row.owner_id !== marker.owner_id || row.deleted_at !== null || row.updated_at > Number(marker.data.cutoff_ms)) return false;
  const inRange = (parent: Row | undefined) => !!parent && (
    (typeof parent.data.day === 'string' && parent.data.day >= String(marker.data.from_day) && parent.data.day <= String(marker.data.to_day)) ||
    (parent.deleted_at !== null && parent.updated_at === marker.updated_at && parent.device_id === marker.device_id));
  if (row.table === 'photos') {
    if (typeof row.data.captured_at !== 'number') return false;
    const day = calendarDay(row.data.captured_at, marker.data.tz);
    return !!day && day >= String(marker.data.from_day) && day <= String(marker.data.to_day);
  }
  // A routine day rolls over a few hours after midnight, so a dose taken in the early morning of the first
  // deleted day is stored on the day before. Deleting that calendar day deletes that dose too.
  if (row.table === 'daily_logs' && row.data.day === dayBefore(String(marker.data.from_day)) && typeof row.data.at === 'number'
      && calendarDay(row.data.at, marker.data.tz) === marker.data.from_day) return true;
  if (dated.has(row.table)) return inRange(row);
  if (row.table === 'entries') return inRange(get('sessions',String(row.data.session_id)));
  if (row.table === 'sets') {
    const entry = get('entries',String(row.data.entry_id));
    return inRange(entry) || (!!entry && inRange(get('sessions',String(entry.data.session_id))));
  }
  return false;
}
export function purgeTombstone(row: Row, marker: Row): Row {
  return {...row,updated_at:marker.updated_at,deleted_at:marker.updated_at,device_id:marker.device_id,
    data:Object.fromEntries(Object.keys(columns[row.table]).map(key=>[key,row.table==='weigh_ins' && key==='source'?row.data.source:null]))};
}
