import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import baseline from './ins-09-atlas-base.json';
const root = path.resolve(__dirname, '../..');
function filesIn(dir: string): string[] {
 return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
test(`body map bytes and file inventory match INS-04 base ${baseline.base}`, () => {
 const current = ['native/src/features/atlas', 'native/assets/atlas', 'native/src/app/muscle'].flatMap(dir => filesIn(path.join(root, dir)));
 expect(current.map(file => path.relative(root, file)).sort()).toEqual(Object.keys(baseline.files).sort());
 for (const [file, hash] of Object.entries(baseline.files)) expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')).toBe(hash);
 const insights = fs.readFileSync(path.join(root, 'native/src/app/(tabs)/insights/index.tsx'), 'utf8');
 expect(insights.match(/<BodyAtlas\b[^\n]+?\/>/g)).toEqual([baseline.element]);
 // Direct return: no added frame, style, scaling or padding around the atlas.
 expect(insights).toContain(`return ${baseline.element};`);
});
test('INS-09 surfaces use token colours and neutral panels without decorative pastel slabs or cards', () => {
 const files = ['native/src/app/(tabs)/progress/index.tsx', 'native/src/app/(tabs)/insights/index.tsx',
  ...filesIn(path.join(root, 'native/src/features/body')).filter(file => file.endsWith('.tsx')).map(file => path.relative(root, file))];
 for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\s*\(|hsla?\s*\(/i);
  expect(source).not.toMatch(/(?:backgroundColor|background)\s*:\s*(?:['"]|colors\.(?:accent|success|warning|danger)|colors\[['"](?:accent-tint|accent-2|ring-oura)['"]\])/);
  expect(source).not.toMatch(/(?:import.*\bCard\b|<Card\b|elevation\s*:|shadow\w*\s*:|boxShadow\s*:)/);
 }
 const panel = fs.readFileSync(path.join(root, 'native/src/features/body/presentation.tsx'), 'utf8');
 expect(panel).toContain("backgroundColor: colors['surface-2']");
 expect(panel).not.toMatch(/borderWidth|borderColor|shadow|elevation/);
});
