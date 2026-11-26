/* The welcome map (pages/settings.js contourArt): four hills, one per strand, traced by marching squares into
 * three bands of lines per hill. Pure, so it is drawn once and tested without a screen. */
export type Strand = 'training' | 'sleep' | 'food' | 'recovery';
export type Mark = 'c' | 's' | 't' | 'd';
export const WELCOME_PEAKS: { x: number; y: number; s: number; a: number; c: Strand; mk: Mark }[] = [
  { x: 0.26, y: 0.44, s: 92, a: 1, c: 'training', mk: 'c' }, { x: 0.82, y: 0.3, s: 84, a: 0.92, c: 'sleep', mk: 's' },
  { x: 0.66, y: 0.84, s: 88, a: 0.86, c: 'food', mk: 't' }, { x: 0.02, y: 0.96, s: 78, a: 0.72, c: 'recovery', mk: 'd' },
];
export const BAND_OPACITY = [0.32, 0.58, 0.9], BAND_WIDTH = [1.1, 1.3, 1.6];
const EDGES: Record<number, [number, number][]> = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[0, 1], [3, 2]], 6: [[0, 2]], 7: [[3, 0]],
  8: [[3, 0]], 9: [[0, 2]], 10: [[0, 3], [2, 1]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };

export type WelcomeArt = { paths: { d: string; c: Strand; band: number }[]; marks: { x: number; y: number; c: Strand; mk: Mark }[] };

export function welcomeArt(W = 393, H = 430): WelcomeArt {
  const peaks = WELCOME_PEAKS, st = 6, nx = Math.ceil(W / st) + 1, ny = Math.ceil(H / st) + 1, F = new Float32Array(nx * ny);
  const contrib = (p: typeof peaks[number], x: number, y: number) => { const dx = x - p.x * W, dy = (y - p.y * H) * 1.12; return p.a * Math.exp(-(dx * dx + dy * dy) / (2 * p.s * p.s)); };
  const f = (x: number, y: number) => peaks.reduce((v, p) => v + contrib(p, x, y), 0) + 0.04 * Math.sin(x / 33 + y / 59) + 0.03 * Math.cos(y / 27 - x / 71);
  const dom = (x: number, y: number) => { let b = 0, bv = -1; peaks.forEach((p, i) => { const v = contrib(p, x, y); if (v > bv) { bv = v; b = i; } }); return b; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[j * nx + i] = f(i * st, j * st);
  const buckets = new Map<string, string>(), levels: number[] = [];
  for (let L = 0.1; L < 1.02; L += 0.068) levels.push(L);
  levels.forEach((L, li) => {
    const band = li < 4 ? 0 : li < 9 ? 1 : 2;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = F[j * nx + i], b = F[j * nx + i + 1], c = F[(j + 1) * nx + i + 1], d = F[(j + 1) * nx + i];
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (!idx || idx === 15) continue;
      const pt = (e: number): [number, number] => e === 0 ? [i + (L - a) / (b - a), j] : e === 1 ? [i + 1, j + (L - b) / (c - b)]
        : e === 2 ? [i + (L - d) / (c - d), j + 1] : [i, j + (L - a) / (d - a)];
      for (const [e1, e2] of EDGES[idx]) {
        const p1 = pt(e1), p2 = pt(e2), key = dom((p1[0] + p2[0]) / 2 * st, (p1[1] + p2[1]) / 2 * st) + '_' + band;
        buckets.set(key, (buckets.get(key) ?? '') + 'M' + (p1[0] * st).toFixed(1) + ' ' + (p1[1] * st).toFixed(1) + 'L' + (p2[0] * st).toFixed(1) + ' ' + (p2[1] * st).toFixed(1));
      }
    }
  });
  const paths = [...buckets].map(([k, d]) => { const [pi, bd] = k.split('_').map(Number); return { d, c: peaks[pi].c, band: bd }; });
  const marks = peaks.filter(p => !(p.y * H > H - 10 || p.x * W < 10)).map(p => ({ x: p.x * W, y: p.y * H, c: p.c, mk: p.mk }));
  return { paths, marks };
}
