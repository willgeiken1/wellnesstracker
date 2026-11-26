/**
 * The Home map's terrain, as pure maths. One hill per pillar (Training, Food, Sleep); a hill's height is that pillar's progress
 * toward today's goal (0 to 1.05). A pillar at 0 has no hill; at 1 or more its goal is met. Contour levels run from a low
 * shoreline (0.06) to just under the goal (0.995), so the top ring only appears once the goal is met.
 * x and y run 0 to 1 across the map (x right, y away from the viewer); the map is twice as wide as it is deep.
 * Every layer (the hero's curtains, the week and the lines behind Home) traces the same isolines from here.
 */
export type Triple = readonly [number, number, number];
export interface Pillar { value: number; x: number; y: number }
export interface FieldData { pillars: readonly [Pillar, Pillar, Pillar] }
export interface IsoLine { pts: number[]; closed: boolean }
export interface IsoLevel { level: number; k: number; lines: IsoLine[] }

/** Where each pillar's hill stands on the map: Training, Food, Sleep. */
export const HILLS: readonly (readonly [number, number])[] = [[0.30, 0.40], [0.70, 0.36], [0.52, 0.72]];
const SD = 0.17, ASPECT = 2;
/* each hill seen as a cyclone: its own rotation, swirl and stretch, so the isobars curl (only their shape changes, never the peak) */
const ROT = [-0.55, 0.45, 0.06], SWIRL = [1.25, -1.15, 1.0], STR = [[1.34, 0.82], [1.3, 0.84], [1.42, 0.8]];

export const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
export const c01 = (v: number) => clamp(v, 0, 1);

export function hash(i: number, j: number, s: number) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function noise(x: number, y: number, s: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** A fixed pseudo-random 0..1 for an index (stars and the like). */
export function hsh(i: number) {
  let n = Math.imul(i | 0, 374761393) ^ 0x5bd1e995; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Field data for three pillar values (Training, Food, Sleep), each clamped to 0..1.05. */
export function fieldData(values: Triple): FieldData {
  const p = (i: number): Pillar => ({ value: clamp(Number(values[i]) || 0, 0, 1.05), x: HILLS[i][0], y: HILLS[i][1] });
  return { pillars: [p(0), p(1), p(2)] };
}
/** One hill's own height at (x, y). */
export function hill(p: Pillar, x: number, y: number) {
  if (!p.value) return 0;
  const dx = (x - p.x) * ASPECT, dy = y - p.y, h = p.value + 0.07;
  return h * Math.exp(-(dx * dx + dy * dy) / (2 * SD * SD));
}
/** A pillar's hill in its cyclone frame: same peak height as `hill`, curled isobars. */
export function pillarH(p: Pillar, i: number, x: number, y: number) {
  if (!(p.value > 0)) return 0;
  const lx = (x - p.x) * 2, ly = y - p.y, r2 = lx * lx + ly * ly, th = SWIRL[i] * Math.exp(-r2 / (2 * 0.15 * 0.15)) + ROT[i];
  const c = Math.cos(th), s = Math.sin(th), ax = (c * lx - s * ly) / STR[i][0], ay = (s * lx + c * ly) / STR[i][1];
  return hill(p, p.x + ax / 2, p.y + ay);
}
/** The swirled terrain at (x, y): the three hills and a gentle noise that only shows where there is ground. */
export function field(x: number, y: number, d: FieldData) {
  let h = 0;
  for (let i = 0; i < 3; i++) h += pillarH(d.pillars[i], i, x, y);
  return h + 0.12 * (noise(6.4 * x, 3.2 * y, 17) - 0.5) * Math.min(1, 3 * h);
}
/** The height of contour level k of L (1-based). */
export const levelValue = (k: number, L: number) => L < 2 ? 0.06 : 0.06 + (k - 1) / (L - 1) * (0.995 - 0.06);

export interface IsoOptions {
  fn: (x: number, y: number) => number;
  L?: number; levels?: number[]; nx?: number; ny?: number; x0?: number; x1?: number; y0?: number; y1?: number; smooth?: number;
}
/* marching squares cases: edge pairs (0 top, 1 right, 2 bottom, 3 left); 5 and 10 are the saddles, settled by the cell centre */
const T: ([number, number][] | null)[] = [null, [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[3, 0]], [[3, 0]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], null];

/** Contour polylines by marching squares, joined into lines, optionally smoothed (Chaikin). Points are in the x0..x1 / y0..y1 space. */
export function isolines(o: IsoOptions): IsoLevel[] {
  const nx = o.nx ?? 96, ny = o.ny ?? 48, x0 = o.x0 ?? 0, x1 = o.x1 ?? 1, y0 = o.y0 ?? 0, y1 = o.y1 ?? 1, L = o.L ?? 9;
  const levels = o.levels ?? Array.from({ length: L }, (_, i) => levelValue(i + 1, L));
  const W = nx + 1, g = new Float32Array(W * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) g[j * W + i] = o.fn(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny);
  return levels.map((lv, li) => {
    // Each crossing is keyed by its grid edge so neighbouring cells share it; segments are then chained into lines.
    const segX: number[] = [], segY: number[] = [], segK: number[] = [], used: boolean[] = [], ends = new Map<number, number[]>();
    const V = (ii: number, jj: number) => g[jj * W + ii];
    const edge = (ii: number, jj: number, e: number, out: number) => {
      let ax: number, ay: number, bx: number, by: number, horizontal: boolean;
      if (e === 0) { ax = ii; ay = jj; bx = ii + 1; by = jj; horizontal = true; }
      else if (e === 1) { ax = ii + 1; ay = jj; bx = ii + 1; by = jj + 1; horizontal = false; }
      else if (e === 2) { ax = ii; ay = jj + 1; bx = ii + 1; by = jj + 1; horizontal = true; }
      else { ax = ii; ay = jj; bx = ii; by = jj + 1; horizontal = false; }
      const va = V(ax, ay), vb = V(bx, by), t = va === vb ? 0.5 : c01((lv - va) / (vb - va));
      segX[out] = x0 + (x1 - x0) * (ax + (bx - ax) * t) / nx; segY[out] = y0 + (y1 - y0) * (ay + (by - ay) * t) / ny;
      segK[out] = ((ay * W + ax) << 1) | (horizontal ? 0 : 1);
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      const idx = (a >= lv ? 8 : 0) | (b >= lv ? 4 : 0) | (c >= lv ? 2 : 0) | (d >= lv ? 1 : 0);
      let pairs = T[idx];
      if (idx === 5 || idx === 10) { const mid = (a + b + c + d) / 4 >= lv; pairs = (idx === 5) === mid ? [[0, 1], [3, 2]] : [[3, 0], [2, 1]]; }
      if (!pairs) continue;
      for (const [e0, e1] of pairs) {
        const id = used.length, p0 = id * 2, p1 = p0 + 1;
        edge(i, j, e0, p0); edge(i, j, e1, p1); used.push(false);
        for (const p of [p0, p1]) { const list = ends.get(segK[p]); if (list) list.push(id); else ends.set(segK[p], [id]); }
      }
    }
    const lines: IsoLine[] = [];
    for (let s = 0; s < used.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      const pts: number[] = [s * 2, s * 2 + 1]; // point indices into segX/segY
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const tail = pts[pts.length - 1], list = ends.get(segK[tail]) ?? [];
          const nb = list.find(n => !used[n]);
          if (nb === undefined) break;
          used[nb] = true;
          pts.push(segK[nb * 2] === segK[tail] ? nb * 2 + 1 : nb * 2);
        }
        pts.reverse();
      }
      const closed = pts.length > 3 && segK[pts[0]] === segK[pts[pts.length - 1]];
      if (closed) pts.pop();
      let flat: number[] = [];
      for (const p of pts) flat.push(segX[p], segY[p]);
      for (let sm = 0; sm < (o.smooth ?? 0); sm++) flat = chaikin(flat, closed);
      lines.push({ pts: flat, closed });
    }
    return { level: lv, k: li + 1, lines };
  });
}
export function chaikin(f: number[], closed: boolean): number[] {
  const n = f.length / 2, out: number[] = [];
  if (n < 3) return f;
  if (!closed) out.push(f[0], f[1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    out.push(0.75 * f[a] + 0.25 * f[b], 0.75 * f[a + 1] + 0.25 * f[b + 1], 0.25 * f[a] + 0.75 * f[b], 0.25 * f[a + 1] + 0.75 * f[b + 1]);
  }
  if (!closed) out.push(f[f.length - 2], f[f.length - 1]);
  return out;
}
const f1 = (n: number) => n.toFixed(1);
/** SVG path data for isolines in a w x h box (x0..x1, y0..y1 mapped onto it). */
export function svgPath(lines: IsoLine[], w: number, h: number, box: { x0?: number; x1?: number; y0?: number; y1?: number } = {}) {
  const x0 = box.x0 ?? 0, x1 = box.x1 ?? 1, y0 = box.y0 ?? 0, y1 = box.y1 ?? 1;
  let s = '';
  for (const ln of lines) {
    const p = ln.pts;
    for (let i = 0; i < p.length; i += 2) s += (i ? 'L' : 'M') + f1((p[i] - x0) / (x1 - x0) * w) + ' ' + f1((p[i + 1] - y0) / (y1 - y0) * h);
    if (ln.closed) s += 'Z';
  }
  return s;
}
