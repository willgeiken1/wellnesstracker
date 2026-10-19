import { columns, type Row } from './rows';
const dated = new Set(['sessions','weigh_ins','measurements','cardio_sessions','food_entries','plan_days']);
/** Parent purge versions survive payload erasure. No health values are retained. */
export function matchesPurge(row: Row, marker: Row, get: (table: 'sessions'|'entries', id: string) => Row | undefined): boolean {
  if (marker.deleted_at !== null || marker.data.cutoff_ms == null || marker.data.from_day == null || marker.data.to_day == null ||
      row.owner_id !== marker.owner_id || row.deleted_at !== null || row.updated_at > Number(marker.data.cutoff_ms)) return false;
  const inRange = (parent: Row | undefined) => !!parent && (
    (typeof parent.data.day === 'string' && parent.data.day >= String(marker.data.from_day) && parent.data.day <= String(marker.data.to_day)) ||
    (parent.deleted_at !== null && parent.updated_at === marker.updated_at && parent.device_id === marker.device_id));
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
