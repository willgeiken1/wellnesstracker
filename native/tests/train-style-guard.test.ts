import fs from 'fs';
import path from 'path';
const root=path.resolve(__dirname,'../src');
const files=[...fs.readdirSync(path.join(root,'features/workout')).filter(f=>f.endsWith('.tsx')).map(f=>`features/workout/${f}`),...fs.readdirSync(path.join(root,'app/workout')).filter(f=>f.endsWith('.tsx')).map(f=>`app/workout/${f}`),'app/(tabs)/workouts/index.tsx'];
test.each(files)('%s uses token colours and no decorative pastel slabs', file => {
 const source=fs.readFileSync(path.join(root,file),'utf8');
 expect(source).not.toMatch(/['"`]#[\da-f]{3,8}\b|\brgba?\s*\(/i);
 expect(source).not.toMatch(/backgroundColor\s*:\s*(?:['"](?:lilac|lime|pink|lavender|lightgreen)['"]|(?:colors|tokens)\s*(?:\.\s*(?:swatches|pastel)|\[\s*['"](?:accent-2|ring-oura)['"]))/i);
});
