import type { Repository } from '../repository';
import type { Row } from '../rows';
import { repRange } from '../../core/workout/supersets';
export interface ExerciseOptions { rep_min?: number | null; rep_max?: number | null; superset_group?: string | null }
/** Wire columns are dormant with the flag OFF. Local values never come from dormant columns. */
export class WorkoutOptions {
  constructor(private repo: Repository) {}
  read(row: Row): Required<ExerciseOptions> {
    const key = `exerciseOptions:${row.table}:${row.id}`;
    const local = this.repo.localGet<ExerciseOptions | null>(key);
    const current = this.repo.get(row.table,row.id);
    let data = local;
    if (this.repo.syncFlags?.syncedV1Columns) {
      data = {...(current?.data ?? row.data),...local};
      if (local && current && current.deleted_at === null &&
          (row.table === 'routine_exercises' || row.table === 'entries') && this.repo.canPromotePreferences(row.table)) {
        this.repo.atomic(() => {
          this.repo.save(row.table,{...current.data,superset_group:local.superset_group ?? null,
            ...(row.table === 'routine_exercises' ? {rep_min:local.rep_min ?? null,rep_max:local.rep_max ?? null} : {})},row.id);
          this.repo.localSave(key,null);
        });
        data = this.repo.get(row.table,row.id)!.data;
      }
    }
    const range = repRange(data?.rep_min,data?.rep_max);
    return {rep_min:range?.min ?? null,rep_max:range?.max ?? null,superset_group:typeof data?.superset_group === 'string' && data.superset_group ? data.superset_group : null};
  }
  write(row: Row, options: ExerciseOptions) {
    const next = {...this.read(row),...options};
    if (this.repo.syncFlags?.syncedV1Columns) {
      const data = {...row.data,superset_group:next.superset_group};
      this.repo.save(row.table,row.table === 'routine_exercises' ? {...data,rep_min:next.rep_min,rep_max:next.rep_max} : data,row.id);
    }
    // ON writes already own their wire values; do not leave a stale promotion.
    this.repo.localSave(`exerciseOptions:${row.table}:${row.id}`,this.repo.syncFlags?.syncedV1Columns ? null : next);
  }
  range(entry: Row) {
    const local = this.repo.localGet<{min:number;max:number} | null>(`repRange:${entry.id}`);
    // Entries have no range columns. Keep the owner-local session snapshot,
    // including explicit null after replacement, across flag changes.
    if (local !== undefined) return local;
    // Synced entries have no range columns: resolve via their originating routine.
    const session = this.repo.get('sessions',String(entry.data.session_id));
    const candidates = this.repo.list('routine_exercises').filter(e => e.data.routine_id === session?.data.routine_id && e.data.exercise === entry.data.exercise);
    const match = candidates.find(e => e.data.position === entry.data.position) ?? (candidates.length === 1 ? candidates[0] : undefined);
    const options = match ? this.read(match) : null;
    return repRange(options?.rep_min,options?.rep_max);
  }
}
