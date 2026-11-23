import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { DEFAULT_BLOCK_IDS, routinePlacementId } from '../src/features/routines/model/ids';
import { seedDefaultRoutines } from '../src/features/routines/store';
import { routinesHomeText, t } from '../src/i18n/en';
export const DEMO_ROUTINE_ID='de000000-0000-4000-8000-000000000001';
export const DEMO_SESSION_ID='de000000-0000-4000-8000-000000000002';

/* Sample routine items for "Look around first". Every one is a plain check: no amount, no unit and no compound,
   so nothing here can read as a suggestion of what to take. The ids are reserved, like the workout samples. */
const demoItemId = (n: number) => `de000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
export const DEMO_ROUTINE_ITEMS = [
  { id: demoItemId(1), block: DEFAULT_BLOCK_IDS.morning, name: 'sampleStretch', time_min: 7 * 60 },
  { id: demoItemId(2), block: DEFAULT_BLOCK_IDS.morning, name: 'sampleWalk', time_min: 7 * 60 + 30 },
  { id: demoItemId(3), block: DEFAULT_BLOCK_IDS.night, name: 'sampleRead', time_min: 21 * 60 + 30 },
  { id: demoItemId(4), block: DEFAULT_BLOCK_IDS.night, name: 'sampleLights', time_min: 22 * 60 + 30 },
] as const;
const DEMO_ROUTINE_ITEM_IDS: readonly string[] = DEMO_ROUTINE_ITEMS.map(item => item.id);
const DEMO_ROUTINE_PLACEMENT_IDS: readonly string[] = DEMO_ROUTINE_ITEMS.map(item => routinePlacementId(item.block, item.id));
/** Set once the sample routine items were offered, so one the person removes never comes back. */
export const DEMO_ROUTINES_KEY = 'demoRoutineSamples';

/** Reserved identities survive edits. Exact original seed shapes recognize #70's
 * random-ID samples; names alone never identify samples. */
export function sampleRow(row:Row,legacy=false) {
  if([DEMO_ROUTINE_ID,DEMO_SESSION_ID].includes(row.id))return true;
  // A sample routine item, where it sits, and any tick put on it while looking around: none of it is the person's.
  if(DEMO_ROUTINE_ITEM_IDS.includes(row.id)||DEMO_ROUTINE_PLACEMENT_IDS.includes(row.id))return true;
  if((row.table==='daily_placements'||row.table==='daily_logs')&&DEMO_ROUTINE_ITEM_IDS.includes(String(row.data.item_id)))return true;
  if(!legacy)return false;
  const meaningful=Object.entries(row.data).filter(([,value])=>value!==null);
  return row.table==='routines'&&meaningful.length===2&&row.data.name==='Demo full body'&&row.data.position===0 ||
    row.table==='sessions'&&meaningful.length===4&&row.data.name==='Demo workout'&&row.data.day==='2026-01-01'&&row.data.origin==='routine'&&row.data.finished_at===1767272400000;
}
/** Entirely synthetic; demo never has a Transport. */
export function seedDemo(repo: Repository) {
  if(repo.owner!=='demo')throw new Error('Demo namespace required.');
  seedDemoWorkout(repo);
  seedDemoRoutines(repo);
}

/** Morning and Night with two sample checks each, once. Only where the workout samples are tracked, so a demo of
 * unknown provenance stays refused at promotion; and only where no routine item was ever made, so the person's
 * own items are never mixed with samples. The ids join the tracked samples and are left behind at promotion. */
function seedDemoRoutines(repo: Repository) {
  const tracked = repo.localGet<string[]>('demoSamples');
  if (!Array.isArray(tracked) || repo.localGet(DEMO_ROUTINES_KEY)) return;
  repo.atomic(() => {
    const added: string[] = [];
    if (!repo.list('daily_items', true).length) {
      seedDefaultRoutines(repo);
      const live = new Set(repo.list('daily_blocks').map(row => row.id));
      DEMO_ROUTINE_ITEMS.filter(item => live.has(item.block)).forEach((item, position) => {
        const placement = routinePlacementId(item.block, item.id);
        repo.save('daily_items', { name: routinesHomeText(item.name), kind: 'check', time_min: item.time_min }, item.id);
        repo.save('daily_placements', { block_id: item.block, item_id: item.id, position }, placement);
        added.push(item.id, placement);
      });
    }
    if (added.length) repo.localSave('demoSamples', [...new Set([...tracked, ...added])]);
    repo.localSave(DEMO_ROUTINES_KEY, true);
  });
}

function seedDemoWorkout(repo: Repository) {
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
