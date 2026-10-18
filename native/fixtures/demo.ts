import type { Repository } from '../src/data/repository';
/** Entirely synthetic. Demo is a separate owner namespace and never has a Transport. */
export function seedDemo(repo: Repository) {
  if(repo.owner!=='demo')throw new Error('Demo namespace required.');
  if(repo.list('routines').length)return;
  repo.save('routines',{name:'Demo full body',position:0});
  repo.save('sessions',{name:'Demo workout',day:'2026-01-01',origin:'routine',finished_at:1767272400000});
}
