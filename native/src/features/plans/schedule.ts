export interface PlanDay { routineId: string; weekdays: number[] }
export interface Plan { mode: 'rotation' | 'fixed'; daysPerWeek: number; days: PlanDay[] }
export function validDaysPerWeek(n: number) { return Number.isInteger(n) && n >= 1 && n <= 7; }
export function validatePlan(plan: Plan) {
  const weekdays = plan.days.flatMap(d => d.weekdays);
  if (!['rotation','fixed'].includes(plan.mode) || !validDaysPerWeek(plan.daysPerWeek) ||
      new Set(plan.days.map(d => d.routineId)).size !== plan.days.length ||
      plan.days.some(d => !d.routineId) || weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
      new Set(weekdays).size !== weekdays.length) throw Error('Invalid plan.');
}
/** Monday=0. UTC is calendar arithmetic only: no elapsed local hours or DST offsets.
 * Rotation evenly spaces a prospective target from the supplied current cursor.
 * A forecast never advances the actual cursor; fixed dates ignore the target. */
export function plannedWeek(monday: string, plan: Plan, cursor = 0): {date:string;routineId:string}[] {
  validatePlan(plan);
  const start = new Date(`${monday}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday) || !Number.isFinite(start.getTime()) ||
      start.toISOString().slice(0,10) !== monday || start.getUTCDay() !== 1 ||
      !Number.isSafeInteger(cursor) || cursor < 0) throw Error('Invalid week.');
  if (!plan.days.length) return [];
  const result: {date:string;routineId:string}[] = [];
  for (let offset=0; offset<7; offset++) {
    const rotationIndex = Array.from({length:plan.daysPerWeek},(_,i)=>Math.floor(i*7/plan.daysPerWeek)).indexOf(offset);
    const day = plan.mode === 'fixed' ? plan.days.find(d=>d.weekdays.includes(offset)) :
      rotationIndex < 0 ? undefined : plan.days[(cursor+rotationIndex)%plan.days.length];
    if (day) {
      const date=new Date(start);date.setUTCDate(date.getUTCDate()+offset);
      result.push({date:date.toISOString().slice(0,10),routineId:day.routineId});
    }
  }
  return result;
}
