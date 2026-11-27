import type { Part } from './model';

/*
 * The arc readouts' widths, worked out here rather than left to the SVG engine. On iOS, react-native-svg anchors only the
 * first run of a <textPath> (so a centred "SLEEP 9h 03m" pushed its value right, off the screen for Food) and lays a run
 * with a smaller font over the next one (the h of 9h 03m under the 03). So each run is its own text on the path, placed
 * from these advance widths (Plus Jakarta Sans, in thousandths of an em, read from the bundled font files).
 */
const ADV: Record<'bold' | 'semi', [string, number[]]> = {
  bold: [" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2022\u2013\u00b7", [178,371,498,915,647,1046,793,311,379,379,540,660,357,600,378,506,708,403,597,611,654,615,602,559,632,602,378,398,660,660,660,583,927,712,691,774,740,595,586,808,733,279,393,679,543,893,741,878,648,878,661,647,542,718,697,1020,661,660,571,416,506,416,660,663,381,580,672,608,672,612,406,652,593,252,252,577,252,924,593,652,672,672,374,514,413,593,566,883,558,586,481,398,395,398,660,658,655,378]],
  semi: [" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2022\u2013\u00b7", [175,341,464,873,647,1022,774,289,351,351,520,642,328,566,347,481,716,392,598,611,646,615,601,554,631,601,347,367,642,642,642,555,928,692,692,777,741,601,584,813,734,272,390,671,539,874,739,878,646,878,654,647,532,712,682,1008,640,648,576,382,481,382,642,641,372,578,670,606,670,613,402,655,586,245,245,567,245,919,586,653,670,670,362,512,405,586,550,855,535,569,471,371,363,371,642,617,626,347]],
};
const tables = { bold: new Map<string, number>(), semi: new Map<string, number>() };
for (const k of ['bold', 'semi'] as const) { const [chars, w] = ADV[k]; [...chars].forEach((c, i) => tables[k].set(c, w[i] / 1000)); }

/** The width of `text` at `size` pt with `spacing` pt after each character, as SVG draws it. Unknown characters count as an M. */
export function textWidth(text: string, size: number, spacing = 0, weight: 'bold' | 'semi' = 'bold') {
  let em = 0;
  for (const c of text) em += tables[weight].get(c) ?? 0.92;
  return em * size + spacing * [...text].length;
}

export interface Run { text: string; at: number; kind: 'name' | 'v' | 'u' | 'of' | 'cap' }
/** The readout's type: the pillar name, the numbers and the units on the line above the limb. */
export const NAME = { size: 9.5, spacing: 1.235 } as const, NUM = { size: 13, spacing: -0.13 } as const, UNIT = { size: 9.5, spacing: 0 } as const;
export const OF = { size: 9.5, spacing: 0.19 } as const, CAP = { size: 10, spacing: 0 } as const;

/** Keeps a line `width` long that would start at `start` inside [lo, hi] along its path, as far as it fits. */
const keepIn = (start: number, width: number, lo: number, hi: number) => Math.max(lo, Math.min(start, hi - width));

/** "SLEEP 9h 03m" centred on `center` along the value path, each run at its own offset, kept inside [lo, hi]. */
export function valueRuns(name: string, parts: readonly Part[], center: number, lo: number, hi: number): Run[] {
  const runs: { text: string; kind: Run['kind']; w: number; gap: number }[] = [{ text: name, kind: 'name', w: textWidth(name, NAME.size, NAME.spacing), gap: 0 }];
  parts.forEach(([s, kind, dx], i) => {
    const t = kind === 'u' ? UNIT : NUM;
    runs.push({ text: s, kind, w: textWidth(s, t.size, t.spacing), gap: i === 0 ? 6 : dx });
  });
  const total = runs.reduce((a, r) => a + r.gap + r.w, 0);
  let at = keepIn(center - total / 2, total, lo, hi);
  return runs.map(r => { at += r.gap; const run = { text: r.text, kind: r.kind, at }; at += r.w; return run; });
}

/** "of 8h" ending at `end` along the goal path, kept inside [lo, hi]. */
export function goalRuns(of: string, cap: string, end: number, lo: number, hi: number): Run[] {
  const wo = textWidth(of, OF.size, OF.spacing, 'semi'), wc = textWidth(cap, CAP.size, CAP.spacing);
  const start = keepIn(end - wo - wc, wo + wc, lo, hi);
  return [{ text: of, kind: 'of', at: start }, { text: cap, kind: 'cap', at: start + wo }];
}
