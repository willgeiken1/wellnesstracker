import { rounded, step, suggestion, type Equipment, type Unit, type WorkingSet } from './rules';
export interface RepRange { min: number; max: number }
export function repRange(min: unknown, max: unknown): RepRange | null {
  return typeof min === 'number' && typeof max === 'number' && Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 100 && min <= max ? {min,max} : null;
}
export interface RotationEntry { id: string; group: string | null; count: number }
/** Groups stay at their first member's position; each round omits exhausted members. */
export function loggerOrder(entries: RotationEntry[]) {
  const visited = new Set<string>(), slots: {entryId:string; index:number}[] = [];
  for (const entry of entries) {
    if (visited.has(entry.id)) continue;
    const members = entry.group ? entries.filter(e => e.group === entry.group) : [entry];
    members.forEach(e => visited.add(e.id));
    for (let index=0; index<Math.max(...members.map(e => e.count)); index++) {
      for (const e of members) if (index<e.count) slots.push({entryId:e.id,index});
    }
  }
  return slots;
}
export function rangeSuggestion(previous: WorkingSet[], equipment: Equipment, unit: Unit, range: RepRange, stack?: number) {
  const sets = previous.filter(s => s.done && !s.warmup), last = sets.at(-1);
  if (!last) return {...suggestion([],equipment,unit,range.min,stack), target:range.min};
  const increment = step(equipment,unit,stack), hit = sets.every(s => s.reps >= range.max), jump = hit && increment > 0;
  return {weight:rounded(last.weight+(jump ? increment : 0)), previous:last.weight, jump,
    target:jump ? range.min : Math.min(range.max,Math.max(range.min,Math.min(...sets.map(s => s.reps))+1)),count:sets.length};
}
