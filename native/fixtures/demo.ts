import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { t } from '../src/i18n/en';
export const DEMO_ROUTINE_ID='de000000-0000-4000-8000-000000000001';
export const DEMO_SESSION_ID='de000000-0000-4000-8000-000000000002';
/** Reserved identities survive edits. Exact original seed shapes recognize #70's
 * random-ID samples; names alone never identify samples. */
export function sampleRow(row:Row,legacy=false) {
  if([DEMO_ROUTINE_ID,DEMO_SESSION_ID].includes(row.id))return true;
  if(!legacy)return false;
  const meaningful=Object.entries(row.data).filter(([,value])=>value!==null);
  return row.table==='routines'&&meaningful.length===2&&row.data.name==='Demo full body'&&row.data.position===0 ||
    row.table==='sessions'&&meaningful.length===4&&row.data.name==='Demo workout'&&row.data.day==='2026-01-01'&&row.data.origin==='routine'&&row.data.finished_at===1767272400000;
}
/** Entirely synthetic; demo never has a Transport. */
export function seedDemo(repo: Repository) {
  if(repo.owner!=='demo')throw new Error('Demo namespace required.');
  if(repo.localGet('demoSamples'))return;
  const legacy=['routines','sessions'].flatMap(table=>repo.list(table as 'routines'|'sessions')).filter(row=>sampleRow(row,true));
  if(legacy.length===2&&new Set(legacy.map(row=>row.table)).size===2){repo.localSave('demoSamples',legacy.map(row=>row.id));return;}
  // A partial/edited old seed has no trustworthy provenance. Keep it available
  // locally, but promotion will refuse it rather than guess which rows are samples.
  if(repo.list('routines',true).length||repo.list('sessions',true).length)return;
  if(repo.list('routines').length)return;
  repo.atomic(()=>{
    repo.save('routines',{name:t('demoFullBody'),position:0},DEMO_ROUTINE_ID);
    repo.save('sessions',{name:t('demoWorkoutName'),day:'2026-01-01',origin:'routine',finished_at:1767272400000},DEMO_SESSION_ID);
    repo.localSave('demoSamples',[DEMO_ROUTINE_ID,DEMO_SESSION_ID]);
  });
}
