import { stableJson } from '../../../../supabase/functions/_shared/pwa-import';
import type { Repository } from '../../data/repository';
import { syncedTables } from '../../data/rows';
import { sampleRow } from '../../../fixtures/demo';
import { today } from './model';
import { t } from '../../i18n/en';
import { WATER_KEY, readWater } from '../food/water';
import { ROUTINES_KEY, readStoredRoutines } from '../routines/store';
import { commitRoutinesState } from '../routines/data/sqlite-store';
import { demoState, emptyState, type RoutinesState } from '../routines/model';
/** Unknown legacy provenance is rejected before an account request as well as
 * at the transfer boundary. Nothing is erased and no sample can be enqueued. */
export function assertDemoTransferSafe(source:Repository) {
  if(source.localGet('loggerFixture')&&!source.localGet('demoFixtureSamplesTracked'))throw new Error('Unmarked legacy fixture.');
  if(!source.localGet('demoSamples')&&syncedTables.some(table=>source.list(table).length))throw new Error('Unmarked legacy demo.');
}
/** Runs synchronously before the destination is handed to SyncEngine. Shared SQLite
 * atomic guards commit user rows and source erasure together, so retries are safe. */
export function promoteDemo(source:Repository,destination:Repository) {
  if(source.owner!=='demo'||['demo','guest','device'].includes(destination.owner))throw new Error('Invalid demo transfer.');
  assertDemoTransferSafe(source);
  const samples=source.localGet<string[]>('demoSamples');
  const existingProfile=destination.list('profile').length>0;
  const existingHome=destination.list('home_layout',true).length>0;
  const skip=new Set<string>(['profile','food_targets','weigh_ins'].filter(table=>destination.list(table as 'profile'|'food_targets'|'weigh_ins').length>0));
  if(source.localGet('pwaHomeImported')&&existingHome)skip.add('home_layout');
  const rows=syncedTables.filter(table=>table!=='purges').flatMap(table=>source.list(table));
  const excluded=new Set(rows.filter(row=>samples?.includes(row.id)||sampleRow(row)).map(row=>row.id));
  const weighInsSkipped=skip.has('weigh_ins')&&rows.some(row=>row.table==='weigh_ins'&&!excluded.has(row.id));
  destination.atomic(()=>{
    const replacements=new Map<string,string>();
    const entries=new Map<string,string>();
    const sessionFor=(parent:string)=>{
      let id=replacements.get(parent);
      if(!id){id=destination.save('sessions',{name:t('carriedWorkout'),day:today(),origin:'empty'}).id;replacements.set(parent,id);}
      return id;
    };
    const userRows=rows.filter(row=>!excluded.has(row.id)&&!skip.has(row.table));
    const userIds=new Set(userRows.map(row=>row.id));
    const routines=new Map<string,string>();
    for(const row of userRows.filter(row=>row.table==='routine_exercises'&&excluded.has(String(row.data.routine_id)))) {
      const parent=String(row.data.routine_id);
      if(!routines.has(parent))routines.set(parent,destination.save('routines',{name:t('carriedRoutine'),position:destination.list('routines').length}).id);
    }
    for(const row of userRows) {
      const data={...row.data};
      if(excluded.has(String(data.routine_id)))data.routine_id=routines.get(String(data.routine_id))??null;
      if(row.table==='entries'&&excluded.has(String(data.session_id))) {
        data.session_id=sessionFor(String(data.session_id));
      }
      if(row.table==='sets'&&excluded.has(String(data.entry_id))) {
        const parent=String(data.entry_id);
        let id=entries.get(parent);
        if(!id){
          const sample=source.get('entries',parent);
          const sourceSession=String(sample?.data.session_id);
          const session=excluded.has(sourceSession)?sessionFor(sourceSession):sourceSession;
          // Only the exercise taxonomy is retained as context. Sample identities,
          // weights, reps, notes and other sample values are never copied.
          id=destination.save('entries',{session_id:session,exercise:String(sample?.data.exercise??t('carriedExercise')),position:0}).id;
          entries.set(parent,id);
        }
        data.entry_id=id;
      }
      // Preserve stable user identities and their references; never copy sample IDs.
      if(!destination.get(row.table,row.id))destination.save(row.table,data,row.id);
    }
    const extra=source.localGet('profileExtras');if(extra&&!existingProfile)destination.localSave('profileExtras',extra);
    // Preserve local custom definitions while the v1 flag is OFF. Existing
    // account definitions win name collisions; these values stay off the wire.
    const customs=source.localGet<{name:string}[]>('customLifts');
    if(customs) {
      const existing=destination.localGet<{name:string}[]>('customLifts')??[];
      const names=new Set(existing.map(item=>item.name.toLowerCase()));
      destination.localSave('customLifts',[...existing,...customs.filter(item=>!names.has(item.name.toLowerCase()))]);
    }
    // Values keyed by user row IDs are safe to retain. Fixture controls,
    // caches, active-workout pointers and consent never transfer.
    for(const [key,value] of Object.entries(source.localSnapshot())) {
      if(key.split(':').some(part=>userIds.has(part)))destination.localSave(key,value);
    }
    // File-import archives are user data. Keep review flags and one-time metadata
    // when an imported backup was opened during Look around first.
    const importIssues=source.localGet<unknown[]>('pwaImportIssues');
    if(importIssues){const old=destination.localGet<unknown[]>('pwaImportIssues')??[];destination.localSave('pwaImportIssues',[...new Map([...old,...importIssues].map(i=>[stableJson(i),i])).values()]);}
    const importIds=source.localGet<string[]>('pwaImportedIds');
    if(importIds)destination.localSave('pwaImportedIds',[...new Set([...(destination.localGet<string[]>('pwaImportedIds')??[]),...importIds])]);
    if(source.localGet('pwaHomeImported')){destination.localSave('pwaHomeImported',true);if(!existingHome){const home=source.localGet('pwaHomeV2');if(home)destination.localSave('pwaHomeV2',home);}}
    // Drinks logged during Look around first are the person's own; the sample's drinks (ids starting wdemo) stay behind.
    // They join the account's water log without replacing its containers, unit or goal.
    if(source.localGet(WATER_KEY)) {
      const mine=Object.entries(readWater(source).log).map(([day,list])=>[day,(Array.isArray(list)?list:[]).filter(d=>d&&typeof d.id==='string'&&!d.id.startsWith('wdemo'))] as const).filter(([,list])=>list.length);
      if(mine.length) {
        const into=readWater(destination), log={...into.log};
        for(const [day,list] of mine){const have=new Set((log[day]??[]).map(d=>d.id));log[day]=[...(log[day]??[]),...list.filter(d=>!have.has(d.id))].sort((a,b)=>a.at-b.at);}
        destination.localSave(WATER_KEY,{...into,log});
      }
    }
    carryRoutines(source,destination);
    // wipe() cannot run in atomic(); replace with the narrow transfer eraser.
    source.clearDemoForTransfer();
  });
  return {weighInsSkipped};
}


/**
 * Routines and items made during Look around first are the person's own, with their check-offs; the sample's routines
 * and items (the fixture's fixed ids) and anything done to them stay behind. They join the account's routines without
 * replacing any it already has. An item keeps only the routines the account will have.
 */
function carryRoutines(source:Repository,destination:Repository) {
  const from=readStoredRoutines(source);
  if(!from)return;
  const sample=demoState();
  const fixture=new Set([...sample.routines,...sample.hidden,...sample.items].map(x=>x.id));
  const routines=[...from.routines,...from.hidden.map(({sub:_sub,...r})=>{void _sub;return r;})].filter(r=>!fixture.has(r.id));
  const items=from.items.filter(i=>!fixture.has(i.id));
  if(!routines.length&&!items.length)return;
  const stored=readStoredRoutines(destination),into:RoutinesState=stored??emptyState();
  const haveR=new Set([...into.routines,...into.hidden].map(r=>r.id)),haveI=new Set(into.items.map(i=>i.id));
  const newR=routines.filter(r=>!haveR.has(r.id)),newI=items.filter(i=>!haveI.has(i.id));
  if(!newR.length&&!newI.length)return;
  const known=new Set([...haveR,...newR.map(r=>r.id)]),ids=new Set(newI.map(i=>i.id));
  const pick=<T,>(byDay:Record<string,Record<string,T>>|undefined,base:Record<string,Record<string,T>>|undefined)=>{
    const out:Record<string,Record<string,T>>={...(base??{})};
    for(const [day,marks] of Object.entries(byDay??{})){
      const mine=Object.entries(marks).filter(([id])=>ids.has(id));
      if(mine.length)out[day]={...(out[day]??{}),...Object.fromEntries(mine)};
    }
    return out;
  };
  const next:RoutinesState={...into,routines:[...into.routines,...newR],items:[...into.items,...newI.map(i=>({...i,routines:i.routines.filter(r=>known.has(r))}))],log:pick(from.log,into.log)};
  const used=pick(from.used,into.used);
  if(Object.keys(used).length)next.used=used;
  // The routines live in the account's own daily_* tables; a document still under the old key is now in `next`.
  commitRoutinesState(destination,next,null);
  if(destination.localGet(ROUTINES_KEY)!=null)destination.localSave(ROUTINES_KEY,null);
}
