import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASE_ROLES,
  GENERATED_END,
  GRAPHIC_PAIRS,
  GENERATED_START,
  MEANING_ROLES,
  MIN_DISTINCT_DE,
  MIN_GRAPHICS,
  MIN_TEXT,
  PALETTES,
  TEXT_PAIRS,
  WATER_PLACEHOLDER,
  contrast,
  deltaE,
  luminance,
  mix,
  nearDuplicates,
  passes,
  proposePalette,
  renderReport,
  scorePairs,
  type Palette,
} from '../scripts/ins01-palette-contrast';

const root = path.join(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('INS-01 contrast math', () => {
  it('matches WCAG reference ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('grades coloured pairs, in either order', () => {
    expect(contrast('#FF0000', '#FFFFFF')).toBeCloseTo(3.998, 3);
    expect(contrast('#0000FF', '#FFFFFF')).toBeCloseTo(8.592, 3);
    expect(contrast('#00FF00', '#000000')).toBeCloseTo(15.304, 3);
    expect(contrast('#FFFFFF', '#FF0000')).toBe(contrast('#FF0000', '#FFFFFF'));
  });

  it('uses the linear branch for very dark channels (<= 0.04045) and the power curve above it', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#0A0A0A')).toBeCloseTo(10 / 255 / 12.92, 12);
    expect(luminance('#0B0B0B')).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 12);
    expect(luminance('#010000')).toBeCloseTo((0.2126 * (1 / 255)) / 12.92, 12);
    expect(luminance('#000001')).toBeCloseTo((0.0722 * (1 / 255)) / 12.92, 12);
    expect(luminance('#0B0B0B')).toBeGreaterThan(luminance('#0A0A0A'));
  });

  it('mixes in sRGB with rounding to the nearest channel value', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#FF0000');
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#0000FF');
    expect(mix('#FF0000', '#0000FF', 0.25)).toBe('#BF0040');
    expect(mix('#142124', '#5FD8BC', 0.16)).toBe('#203E3C');
  });

  it('passes a pair at exactly the floor and fails just under it', () => {
    expect(passes(MIN_TEXT, MIN_TEXT)).toBe(true);
    expect(passes(MIN_TEXT - 1e-9, MIN_TEXT)).toBe(false);
    expect(passes(MIN_GRAPHICS, MIN_GRAPHICS)).toBe(true);
    expect(passes(MIN_GRAPHICS - 1e-9, MIN_GRAPHICS)).toBe(false);
    // Nearest greys either side of each floor on white.
    expect(passes(contrast('#767676', '#FFFFFF'), MIN_TEXT)).toBe(true);
    expect(passes(contrast('#777777', '#FFFFFF'), MIN_TEXT)).toBe(false);
    expect(passes(contrast('#949494', '#FFFFFF'), MIN_GRAPHICS)).toBe(true);
    expect(passes(contrast('#959595', '#FFFFFF'), MIN_GRAPHICS)).toBe(false);
  });
});

describe('INS-01 graded pairs', () => {
  it('grades 15 text and 24 graphics pairs per mode', () => {
    expect(TEXT_PAIRS).toHaveLength(15);
    expect(GRAPHIC_PAIRS).toHaveLength(24);
    const scored = scorePairs(proposePalette(PALETTES[0]));
    expect(scored).toHaveLength(2 * (TEXT_PAIRS.length + GRAPHIC_PAIRS.length));
  });
});

describe('INS-01 accent fixes', () => {
  // Made-up palette (not a v2 palette): the light accent is too pale for 3:1 on white, and the grey onAccent
  // only clears 4.5:1 while the accent stays pale. Darkening the accent for graphics used to leave onAccent failing.
  const madeUp: Palette = {
    ...PALETTES[0],
    id: 'madeUpPaleAccent',
    name: 'Made-up pale accent',
    light: { ...PALETTES[0].light, accent: '#C8D8FF', onAccent: '#444444', muted: '#6E6E6E' },
  };

  it('starts with onAccent passing on the pale accent and the accent failing 3:1', () => {
    expect(contrast(madeUp.light.onAccent, madeUp.light.accent)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(contrast(madeUp.light.accent, madeUp.light.surface)).toBeLessThan(MIN_GRAPHICS);
  });

  it('re-checks onAccent and text on accentSoft after the accent moves', () => {
    const proposed = proposePalette(madeUp);
    expect(proposed.changes).toContainEqual(expect.objectContaining({ mode: 'light', role: 'accent' }));
    const c = proposed.light;
    expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(MIN_TEXT);
    for (const role of ['text', 'muted'] as const) expect(contrast(c[role], c.accentSoft)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(scorePairs(proposed).filter(pair => !pair.pass)).toEqual([]);
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

  it('states pair counts that match the graded arrays', () => {
    const doc = read('design/INS-01-TOKEN-PROPOSAL.md');
    const perMode = TEXT_PAIRS.length + GRAPHIC_PAIRS.length;
    expect(doc).toContain(`Pairs graded per mode: ${TEXT_PAIRS.length} text pairs (4.5:1) and ${GRAPHIC_PAIRS.length} graphics pairs (3:1), ${perMode} per mode, ${perMode * 2} per palette.`);
    expect(doc).toContain(`- [x] Every graded pair has a contrast value: ${perMode} per mode, ${perMode * 2} per palette, v2 and proposed.`);
  });
});
