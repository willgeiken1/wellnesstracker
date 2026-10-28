import { atlasGeometry, hitTest } from '../src/features/atlas/geometry';
import { heatmap, targetFor, fadeHours, rollup } from '../src/features/atlas/volume';
import { atlasMuscles } from '../src/features/atlas/muscles';
const now = Date.UTC(2026, 9, 28, 12);
const session = (hours: number, sets: number, main = 'chest', helpers = ['triceps']) => ({ at: now-hours*3600000, exercises: [{main,helpers,sets}] });
test('all 44 canonical keys have exactly one path per body type and both layers', () => {
 expect(atlasMuscles).toHaveLength(44);
 for (const sex of ['male','female'] as const) {
  const paths = (['front','back'] as const).flatMap(side => atlasGeometry[sex][side].muscles);
  expect(paths.map(p=>p.id).sort()).toEqual(atlasMuscles.map(m=>m.key).sort());
  expect(atlasGeometry[sex].front.skin).toBeTruthy(); expect(atlasGeometry[sex].back.skin).toBeTruthy();
 }
});
test('exact polygon hit test: centers, mirrored halves, edges and background', () => {
 expect(hitTest('male','front',80,80)).toBe('pecUpper'); expect(hitTest('male','front',120,80)).toBe('pecUpper');
 expect(hitTest('male','front',70,76)).toBe('pecUpper'); expect(hitTest('male','front',1,1)).toBeNull();
 expect(hitTest('male','back',80,80)).not.toBe('pecUpper'); expect(hitTest('female','front',80,80)).toBe('pecUpper');
});
test('weekly sets use main 1/helper .5 and ignore old/future/invalid sets', () => {
 const map=heatmap([session(1,4),session(169,20),session(-1,10),session(2,NaN)],now);
 expect(map.find(m=>m.key==='pecUpper')?.sets).toBe(4); expect(map.find(m=>m.key==='tricepsLong')?.sets).toBe(2);
 expect(rollup(map).chest).toBe(4); expect(rollup(map).triceps).toBe(2);
});
test.each([['chest',10,20,48],['rearDelts',6,12,36],['sideDelts',6,12,36],['forearms',6,12,36],['calves',6,12,36],['abs',6,12,36],['neck',6,12,36]] as const)('targets and normal fade %s', (group,min,max,hours) => {
 expect(targetFor(group)).toEqual([min,max]); expect(fadeHours(group,9)).toBe(hours); expect(fadeHours(group,10)).toBe(72);
});
test('fade fixtures include high-volume sessions, boundary and old last-trained',()=>{
 expect(heatmap([session(24,4)],now).find(m=>m.key==='pecUpper')?.freshness).toBe(.5);
 expect(heatmap([session(36,10)],now).find(m=>m.key==='pecUpper')?.freshness).toBe(.5);
 expect(heatmap([session(18,4,'calves',[])],now).find(m=>m.key==='gastroc')?.freshness).toBe(.5);
 expect(heatmap([session(48,4)],now).find(m=>m.key==='pecUpper')?.freshness).toBe(0);
 const old=heatmap([session(200,4)],now).find(m=>m.key==='pecUpper')!;
 expect(old.sets).toBe(0); expect(old.lastTrained).toBe(now-200*3600000);
});
test('session totals drive 72h fade across exercises; duplicate helpers never double count',()=>{
 const map=heatmap([{at:now-36*3600000,exercises:[{main:'chest',helpers:['chest','triceps','triceps'],sets:5},{main:'chest',helpers:[],sets:5}]}],now);
 expect(map.find(m=>m.key==='pecUpper')?.freshness).toBe(.5); expect(map.find(m=>m.key==='tricepsLong')?.sets).toBe(2.5);
});
test('every region has exposed hit area in both bodies, not just a declared ID',()=>{
 for(const body of ['male','female'] as const)for(const side of ['front','back'] as const){
  for(const region of atlasGeometry[body][side].muscles){
   const points=region.polygons[0], xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   let hits=0;
   for(let y=Math.min(...ys);y<=Math.max(...ys);y++)for(let x=Math.min(...xs);x<=Math.max(...xs);x++)if(hitTest(body,side,x,y)===region.id)hits++;
   expect({key:region.id,hittable:hits>0}).toEqual({key:region.id,hittable:true});
  }
 }
});
test('seven day inclusive boundary and helper-only attribution',()=>{
 const map=heatmap([{at:now-7*86400000,exercises:[{helpers:['abs'],sets:2}]}],now);
 expect(map.find(v=>v.key==='rectusAbs')?.sets).toBe(1);
 expect(map.find(v=>v.key==='rectusAbs')?.freshness).toBe(0);
 expect(heatmap([],now).every(v=>v.sets===0&&v.lastTrained===null&&v.freshness===0)).toBe(true);
});
