import { atlasMuscles } from './muscles';
export interface AtlasSession { at: number; exercises: {main?: string; helpers: string[]; sets: number}[] }
export interface MuscleVolume { key: string; group: string; sets: number; lastTrained: number | null; freshness: number; target: readonly [number,number] }
const small = new Set(['rearDelts','sideDelts','forearms','calves','abs','neck']);
export const targetFor = (group: string): readonly [number,number] => small.has(group) ? [6,12] : [10,20];
export const fadeHours = (group: string, sessionSets: number) => sessionSets>=10 ? 72 : small.has(group) ? 36 : 48;
/** Rolling seven days, inclusive start; future sessions and invalid set counts excluded.
 * Native logs record basic groups, so each mapped region inherits the group's value.
 * Never sum sibling regions to form a basic group: that would multiply set counts. */
export function heatmap(sessions: AtlasSession[], now: number): MuscleVolume[] {
 const totals = new Map<string,{sets:number;last:number|null;latestSets:number}>();
 for (const session of sessions) {
  if (!Number.isFinite(session.at) || session.at>now) continue;
  const groups = new Map<string,number>();
  for (const ex of session.exercises) {
   if (!Number.isFinite(ex.sets) || ex.sets<=0) continue;
   for (const g of new Set([...(ex.main?[ex.main]:[]),...ex.helpers])) groups.set(g,(groups.get(g)??0)+ex.sets*(g===ex.main?1:.5));
  }
  for (const [group,sets] of groups) {
   const value=totals.get(group)??{sets:0,last:null,latestSets:0};
   if (session.at>=now-7*86400000) value.sets+=sets;
   if (value.last===null || session.at>value.last) {value.last=session.at;value.latestSets=sets;}
   totals.set(group,value);
  }
 }
 return atlasMuscles.map(m=>{
  const v=totals.get(m.group);
  return {key:m.key,group:m.group,sets:v?.sets??0,lastTrained:v?.last??null,target:targetFor(m.group),
   freshness:v?.last==null?0:Math.max(0,1-(now-v.last)/(fadeHours(m.group,v.latestSets)*3600000))};
 });
}
export function rollup(values: MuscleVolume[]) {
 return Object.fromEntries(values.map(v=>[v.group,v.sets]));
}
/** ColorBrewer Blues with original dark adaptations (see assets/atlas/SOURCES.md).
 * Luminance, exact numbers, and outlines carry meaning.
 * Recency is an overlay; volume remains visible after the overlay fades. */
export function heatFill(v: MuscleVolume, dark: boolean) {
 const scale=dark?['#263746','#5685a2','#8dbbd6','#c6dbef']:['#deebf7','#9ecae1','#4292c6','#08519c'];
 return scale[v.sets===0?0:v.sets<v.target[0]?1:v.sets<=v.target[1]?2:3];
}
