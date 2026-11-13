// Contrast guards the palette tests did not cover (A11Y-18): what may be drawn on the accent tint, the edges of
// fields and switches, and pillar colours used as text. Checked in every palette, light and dark.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { contrast } from '../src/core/contrast';
import { createTheme, palettes } from '../src/design/tokens';

const MODES = ['light', 'dark'] as const;
const themes = palettes.flatMap(palette => MODES.map(mode => ({ name: `${palette} ${mode}`, colors: createTheme(mode, palette) })));
const below = (floor: number, pairs: [string, string, string][]) =>
  pairs.map(([name, fg, bg]) => ({ name, ratio: Math.round(contrast(fg, bg) * 100) / 100 })).filter(pair => pair.ratio < floor);

test('there are 11 palettes in two modes', () => expect(themes).toHaveLength(22));

test('text drawn on the accent tint (a done set, the AI card, a chosen tile) reads at 4.5:1 in text, muted and accent-2', () => {
  expect(below(4.5, themes.flatMap(({ name, colors }) => (['text', 'text-muted', 'accent-2'] as const)
    .map(role => [`${role} on accent-tint, ${name}`, colors[role], colors['accent-tint']] as [string, string, string])))).toEqual([]);
});

test('icons in the accent on the accent tint clear 3:1; accent is not used for words there', () => {
  // Plain accent on the tint is 4.03 to 4.47 in six light palettes: fine for an icon, short of 4.5 for text.
  expect(below(3, themes.map(({ name, colors }) => [`accent on accent-tint, ${name}`, colors.accent, colors['accent-tint']]))).toEqual([]);
});

test('the field outline (Increase Contrast) and the switch track clear 3:1 against every surface they sit on', () => {
  expect(below(3, themes.flatMap(({ name, colors }) => (['bg', 'surface', 'surface-2'] as const)
    .map(surface => [`text-muted edge on ${surface}, ${name}`, colors['text-muted'], colors[surface]] as [string, string, string])))).toEqual([]);
});

// Source checks. Each allowed line names who is fixing it; delete the line when the fix lands.
const SRC = path.join(__dirname, '..', 'src');
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
});
const lines = files(SRC).flatMap(file => readFileSync(file, 'utf8').split('\n').map((text, i) => ({ where: `${path.relative(SRC, file)}:${i + 1}`, text })));

test('pillar colours are never used as a text colour (they are tuned for strokes and fills, not words)', () => {
  const PENDING = new Set([
    'features/connections/screen.tsx', // A11Y-13, Oura thread: monogram letters move to text / accent-2.
  ]);
  const pillar = /[^a-zA-Z]color:\s*colors(\.(training|food|recovery|sleep|water)\b|\[(pillar|PILLAR\[[^\]]+\]|'(training|food|recovery|sleep|water)')\])/;
  const found = lines.filter(line => pillar.test(line.text) && !/backgroundColor|borderColor|stroke|fill/.test(line.text.match(pillar)?.[0] ?? ''))
    .map(line => line.where).filter(where => !PENDING.has(where.split(':')[0]));
  expect(found).toEqual([]);
});

test('switches use ThemedSwitch, whose off track clears 3:1 (the plain one is 1.6:1 against the page)', () => {
  const PENDING = new Set([
    'features/onboarding/fields.tsx', // A11Y-05, App Store thread.
    'features/workout/finish.tsx', // A11Y-05, App Store thread once #182 lands.
  ]);
  const raw = lines.filter(line => /<Switch\b/.test(line.text)).map(line => line.where.split(':')[0])
    .filter(file => file !== 'features/settings/parts.tsx' && !PENDING.has(file));
  expect(raw).toEqual([]);
});
