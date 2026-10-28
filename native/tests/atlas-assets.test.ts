import fs from 'node:fs';
import path from 'node:path';
import { atlasGeometry } from '../src/features/atlas/geometry';
import { atlasMuscles } from '../src/features/atlas/muscles';
const root=path.join(__dirname,'../..');
test('stable keys and group mappings equal PWA exercise bank',()=>{
 const source=fs.readFileSync(path.join(root,'logger/js/data/body.js'),'utf8');
 const assets=JSON.parse(source.match(/const ASSETS = (.*);/)![1]);
 expect(Object.fromEntries(atlasMuscles.map(m=>[m.key,m.group]))).toEqual(assets.advToBasic);
 expect(atlasMuscles.every(m=>m.name&&m.scientific)).toBe(true);
});
test('native SVG layers match native geometry and stay within the 300KB cap',()=>{
 let bytes=0;
 for(const body of ['male','female'] as const) for(const side of ['front','back'] as const){
  const svg=fs.readFileSync(path.join(root,`native/assets/atlas/${body}-${side}.svg`),'utf8');bytes+=Buffer.byteLength(svg);
  expect(svg).toContain('id="skin"');expect(svg).toContain('id="muscles"');
  const shape=atlasGeometry[body][side]; expect(svg).toContain(`d="${shape.skin}"`);
  for(const m of shape.muscles){expect(svg).toContain(`id="${m.id}"`);expect(svg).toContain(`d="${m.d}"`);}
 }
 expect(bytes).toBeLessThanOrEqual(300*1024);
});
