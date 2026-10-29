import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASE_ROLES,
  GENERATED_END,
  GENERATED_START,
  MEANING_ROLES,
  MIN_DISTINCT_DE,
  PALETTES,
  WATER_PLACEHOLDER,
  contrast,
  deltaE,
  nearDuplicates,
  proposePalette,
  renderReport,
  scorePairs,
} from '../scripts/ins01-palette-contrast';

const root = path.join(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('INS-01 contrast math', () => {
  it('matches WCAG reference ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe('INS-01 palettes', () => {
  it('copies all 13 v2 palettes verbatim from REDESIGN.md §5', () => {
    const rows = read('design/REDESIGN.md')
      .split('\n')
      .filter(line => /^\| \d+ \| /.test(line) && line.split('|').length === 17)
      .map(line => line.split('|').map(cell => cell.trim()).slice(2, -1));
    expect(rows).toHaveLength(13);
    expect(PALETTES).toHaveLength(13);
    rows.forEach((cells, index) => {
      const palette = PALETTES[index];
      expect(cells[1]).toBe(`\`${palette.id}\``);
      expect(cells[0].replace(/ \(secret.*\)$/, '')).toBe(palette.name);
      BASE_ROLES.forEach((role, roleIndex) => {
        expect(cells[2 + roleIndex]).toBe(`${palette.dark[role]} / ${palette.light[role]}`);
      });
    });
  });

  it('proposes values where every text and graphics pair passes D6', () => {
    for (const palette of PALETTES) {
      const failing = scorePairs(proposePalette(palette)).filter(pair => !pair.pass);
      expect({ id: palette.id, failing }).toEqual({ id: palette.id, failing: [] });
    }
  });

  it('gives every palette its own water colour, distinct from recovery and every other meaning colour', () => {
    for (const palette of PALETTES) {
      const proposed = proposePalette(palette);
      for (const mode of ['dark', 'light'] as const) {
        const c = proposed[mode];
        expect(c.water.toUpperCase()).not.toBe(WATER_PLACEHOLDER);
        for (const role of MEANING_ROLES.filter(r => r !== 'water')) {
          expect({ id: palette.id, mode, role, de: deltaE(c.water, c[role]) >= MIN_DISTINCT_DE }).toEqual({ id: palette.id, mode, role, de: true });
        }
      }
    }
  });

  it('resolves both duplicate-colour notes: accent is never also a pillar, and the moved pillar is distinct', () => {
    const moved = { springCitrus: 'training', lotusGarden: 'food' } as const;
    for (const palette of PALETTES) {
      const proposed = proposePalette(palette);
      for (const mode of ['dark', 'light'] as const) {
        const c = proposed[mode];
        for (const pillar of ['training', 'food', 'recovery', 'sleep', 'water'] as const) {
          expect(c[pillar].toUpperCase()).not.toBe(c.accent.toUpperCase());
        }
      }
      const role = moved[palette.id as keyof typeof moved];
      if (!role) continue;
      expect(palette.dark[role]).toBe(palette.dark.accent);
      for (const mode of ['dark', 'light'] as const) {
        for (const other of MEANING_ROLES.filter(r => r !== role)) {
          expect(deltaE(proposed[mode][role], proposed[mode][other])).toBeGreaterThanOrEqual(MIN_DISTINCT_DE);
        }
      }
    }
  });

  it('flags near-duplicate meaning colours it does not fix', () => {
    const chrome = PALETTES.find(p => p.id === 'holographicChrome')!;
    expect(nearDuplicates(proposePalette(chrome))).toContainEqual(expect.objectContaining({ mode: 'light', a: 'accent', b: 'sleep' }));
  });
});

describe('INS-01 proposal doc', () => {
  it('embeds the table this script computes, unchanged', () => {
    const doc = read('design/INS-01-TOKEN-PROPOSAL.md');
    expect(doc).toContain('DRAFT - not applied; needs Elliot\'s proposal PR + Will\'s save tap');
    const start = doc.indexOf(GENERATED_START);
    const end = doc.indexOf(GENERATED_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(doc.slice(start + GENERATED_START.length, end).trim()).toBe(renderReport().trim());
  });
});
