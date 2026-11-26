import { stableJson } from '../../../../supabase/functions/_shared/pwa-import';
import type { Repository } from '../../data/repository';
import { syncedTables } from '../../data/rows';
import { sampleRow } from '../../../fixtures/demo';
import { today } from './model';
import { t } from '../../i18n/en';
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
    // wipe() cannot run in atomic(); replace with the narrow transfer eraser.
    source.clearDemoForTransfer();
  });
  return {weighInsSkipped};
}

