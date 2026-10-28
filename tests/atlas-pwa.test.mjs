import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../logger/js/runtime.js';
import '../logger/js/data/body.js';
import '../logger/js/shared/muscles.js';
import {atlasGeometry} from '../logger/js/data/atlas-geometry.js';
test('live PWA advanced atlas renders the same original path source for all four views',()=>{
 for(const body of ['male','female'])for(const side of ['front','back']){
  const svg=app.advBodySVG(body,side,new Map([['pecUpper',4],['lats',10]]));
  assert.match(svg,/viewBox="0 0 200 440"/);
  assert.ok(svg.includes(atlasGeometry[body][side].skin));
  for(const region of atlasGeometry[body][side].muscles){
   assert.ok(svg.includes(`id="${region.id}"`));
   assert.ok(svg.includes(`data-m="${region.id}"`));
   assert.ok(svg.includes(`d="${region.d}"`));
  }
 }
});
