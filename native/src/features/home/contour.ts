/** Contour map engine, ported from the Oct 23 prototype (contour.js): hills on one height field,
 * traced into contour lines by marching squares, each line owned by the nearest hill. Pure maths:
 * it returns SVG path data and never touches stored data. */
export interface ContourLine { hill: number; d: string; width: number; opacity: number }
export interface ContourMarker { hill: number; x: number; y: number; summit: boolean }
export interface Terrain { lines: ContourLine[]; markers: ContourMarker[] }
export interface TerrainOptions {
  mini?: boolean; levels?: number; sd?: number; strokeWidth?: number; grid?: number; wobble?: number; seed?: number;
  /** Where each hill sits, as fractions of width and height. */
  positions?: readonly (readonly [number, number])[];
}
type Point = [number, number];

export const HILL_POSITIONS = [[0.30, 0.40], [0.70, 0.36], [0.52, 0.72]] as const;
export const MINI: TerrainOptions = { mini: true, levels: 3, grid: 16, strokeWidth: 0.9, sd: 0.2 };

function hash(i: number, j: number, s: number) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const CASES: Record<number, [number, number][]> = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]],
  8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
};
function marchingSquares(f: number[][], cols: number, rows: number, level: number, emit: (p: Point, q: Point) => void) {
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = f[j][i], b = f[j][i + 1], c = f[j + 1][i + 1], e = f[j + 1][i];
    const index = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (e > level ? 1 : 0);
    if (index === 0 || index === 15) continue;
    // Edge crossings: top, right, bottom, left.
    const edges: Point[] = [[i + (level - a) / (b - a), j], [i + 1, j + (level - b) / (c - b)], [i + (level - e) / (c - e), j + 1], [i, j + (level - a) / (e - a)]];
    for (const [from, to] of CASES[index]) emit(edges[from], edges[to]);
  }
}

/** `progress` is one value per hill, 0 to about 1.05. A hill at 0 is absent; a hill at 1 or more gets a summit marker. */
export function terrain(progress: readonly number[], width: number, height: number, options: TerrainOptions = {}): Terrain {
  const levels = options.levels ?? 5, sd = options.sd ?? 0.17, sw = options.strokeWidth ?? 1.35, cols = options.grid ?? 56;
  const wobble = options.wobble ?? 0.12, seed = options.seed ?? 17, positions = options.positions ?? HILL_POSITIONS;
  const aspect = width / height, rows = Math.max(8, Math.round(cols * height / width));
  const hills = progress.map((p, i) => ({ x: positions[i][0], y: positions[i][1], h: p > 0 ? p + 0.07 : 0 }));
  const bump = (k: { x: number; y: number; h: number }, x: number, y: number) => {
    const dx = (x - k.x) * aspect, dy = y - k.y;
    return k.h * Math.exp(-(dx * dx + dy * dy) / (2 * sd * sd));
  };
  const f: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: number[] = [];
    for (let i = 0; i <= cols; i++) {
      const x = i / cols, y = j / rows;
      let h = 0;
      for (const k of hills) if (k.h) h += bump(k, x, y);
      row.push(h + wobble * (noise(3.2 * x * aspect, 3.2 * y, seed) - 0.5) * Math.min(1, 3 * h));
    }
    f.push(row);
  }
  const owner = (x: number, y: number) => {
    let best = 0, value = -1;
    hills.forEach((k, i) => { const v = bump(k, x, y); if (v > value) { value = v; best = i; } });
    return best;
  };
  const X = (v: number) => (v * width / cols).toFixed(1), Y = (v: number) => (v * height / rows).toFixed(1);
  const paths = hills.map(() => Array<string>(levels).fill(''));
  for (let k = 1; k <= levels; k++) marchingSquares(f, cols, rows, k / levels, (p, q) => {
    paths[owner((p[0] + q[0]) / 2 / cols, (p[1] + q[1]) / 2 / rows)][k - 1] += `M${X(p[0])} ${Y(p[1])}L${X(q[0])} ${Y(q[1])}`;
  });
  const lines: ContourLine[] = [];
  paths.forEach((byLevel, hill) => byLevel.forEach((d, i) => {
    if (d) lines.push({ hill, d, width: i + 1 === levels ? sw * 1.9 : sw, opacity: 0.35 + 0.65 * (i + 1) / levels });
  }));
  const markers: ContourMarker[] = options.mini ? [] : hills.flatMap((k, hill) => progress[hill] > 0
    ? [{ hill, x: k.x * width, y: k.y * height, summit: progress[hill] >= 1 }] : []);
  return { lines, markers };
}
