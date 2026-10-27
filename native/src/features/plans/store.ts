import type { Repository } from '../../data/repository';
import { compareRows } from '../../data/rows';
import { WorkoutStore } from '../../data/workout/store';
import { type Plan, type PlanDay, plannedWeek, validatePlan } from './schedule';
interface Definition { id?: string; days: PlanDay[] }
const key = 'plans:definition';
/** IN-M209-1/2: One current definition; membership and weekday assignments
 * stay owner-local. Only mode and days_per_week may enter synced plan rows.
 * The v1 config table is never read or written while its flag is off. */
export class PlanStore {
  constructor(readonly repo: Repository) {}
  private definition() { return this.repo.localGet<Definition>(key) ?? {days:[]}; }
  private config() {
    if (!this.repo.syncFlags?.syncedV1Columns) return undefined;
    const id=this.definition().id;
    return id ? this.repo.get('plans',id) : this.repo.list('plans').sort(compareRows).at(-1);
  }
  read(): Plan {
    const config=this.config();
    return {mode:config?.data.mode === 'fixed' ? 'fixed' : 'rotation',
      daysPerWeek:Number(config?.data.days_per_week ?? 3),
      days:this.definition().days.filter(d=>this.repo.list('routines').some(r=>r.id===d.routineId))};
  }
  save(plan: Plan) {
    validatePlan(plan);
    if (plan.days.some(d=>!this.repo.list('routines').some(r=>r.id===d.routineId))) throw Error('Invalid plan day.');
    this.repo.atomic(()=>{
      let id=this.definition().id;
      if (this.repo.syncFlags?.syncedV1Columns) {
        id=this.repo.save('plans',{mode:plan.mode,days_per_week:plan.daysPerWeek},this.config()?.id).id;
        for (const row of this.repo.list('plans')) if (row.id !== id) this.repo.remove('plans',row.id);
      }
      this.repo.localSave(key,{id,days:plan.days} satisfies Definition);
    });
  }
  nextIndex() {
    const days=this.read().days;
    if (!days.length) return 0;
    // Immutable local launch order prevents historical timestamp edits from
    // changing rotation. Session identity avoids advancing twice on an edit.
    const last=this.repo.list('sessions').filter(s=>s.data.finished_at != null &&
      this.repo.localGet<number>(`plans:session:${s.id}`) != null && days.some(d=>d.routineId===s.data.routine_id))
      .sort((a,b)=>this.repo.localGet<number>(`plans:session:${b.id}`)!-this.repo.localGet<number>(`plans:session:${a.id}`)! || b.id.localeCompare(a.id))[0];
    return last ? (days.findIndex(d=>d.routineId===last.data.routine_id)+1)%days.length : 0;
  }
  startDay(routineId:string, now=Date.now()) {
    const workout=new WorkoutStore(this.repo);
    if (workout.active() || !this.read().days.some(d=>d.routineId===routineId)) throw Error('Plan day unavailable.');
    return this.repo.atomic(()=>{
      const session=workout.start(routineId,now);
      const sequence=(this.repo.localGet<number>('plans:sequence') ?? 0)+1;
      this.repo.localSave('plans:sequence',sequence);
      this.repo.localSave(`plans:session:${session.id}`,sequence);
      return session;
    });
  }
  week(monday:string) { return plannedWeek(monday,this.read(),this.nextIndex()); }
}
