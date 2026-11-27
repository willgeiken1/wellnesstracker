import { HERO_H, arcAt, fit, limb, place, type ArcPt } from './camera';
import { SEG, SLOT } from './motion';

/**
 * Where the Aurora hero's words sit, from the same camera the scene draws with: the limb as a curve in hero points, a path
 * 10.5 pt above it that the values ride, a path 19 pt under it where each goal hangs under its end cap, the three 44 pt arc
 * targets and the apex where the day score stands. Pure, so it is measured once per width and checked without a phone.
 */
export interface ArcTarget { pillar: number; x: number; y: number; w: number; h: number }
export interface HeroLayout {
  w: number; h: number; arc: ArcPt[];
  /** SVG path data for the value line (above the limb) and the goal line (under it). */
  above: string; under: string;
  /** Per screen arc (Training, Sleep, Food): where its value is centred on `above` and its goal ends on `under`, in path length. */
  valueAt: [number, number, number]; goalAt: [number, number, number];
  /** How far along each path the screen's 12 pt margins fall: a readout stays between them. */
  aboveSpan: [number, number]; underSpan: [number, number];
  targets: ArcTarget[];
  /** The limb's highest point: the day score's foot stands 28 pt above it. */
  apex: { x: number; y: number };
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function heroLayout(w: number, h = HERO_H): HeroLayout {
  const { camD, camTy } = fit(w, h), arc = limb(place(camD, camTy, 0, w, h));
  const off = 10.5, off2 = -19, L: [number, number][] = [], L2: [number, number][] = [];
  let above = '', under = '', acc = 0, acc2 = 0, prev: [number, number] | null = null, prev2: [number, number] | null = null;
  for (let x = -20; x <= w + 20; x += 4) {
    const a = arcAt(arc, x);
    if (!a) continue;
    const nl = Math.sqrt(1 + a.sl * a.sl);
    const px = x + a.sl / nl * off, py = a.y - off / nl;
    if (prev) acc += Math.hypot(px - prev[0], py - prev[1]);
    L.push([x, acc]); above += `${prev ? 'L' : 'M'}${f1(px)} ${f1(py)}`; prev = [px, py];
    const qx = x + a.sl / nl * off2, qy = a.y - off2 / nl;
    if (prev2) acc2 += Math.hypot(qx - prev2[0], qy - prev2[1]);
    L2.push([x, acc2]); under += `${prev2 ? 'L' : 'M'}${f1(qx)} ${f1(qy)}`; prev2 = [qx, qy];
  }
  const at = (list: [number, number][], x: number) => { let k = 0; while (k < list.length - 1 && list[k][0] < x) k++; return list[k]?.[1] ?? 0; };
  const valueAt = SEG.map(s => at(L, (s[0] + s[1]) / 2 * w)) as [number, number, number];
  const goalAt = SEG.map(s => at(L2, s[1] * w) + 3.5) as [number, number, number];
  const targets: ArcTarget[] = SEG.map((s, j) => {
    const x0 = s[0] * w - 6, x1 = s[1] * w + 6, am = arcAt(arc, (x0 + x1) / 2);
    return { pillar: SLOT[j], x: x0, y: (am?.y ?? 0) - 29, w: x1 - x0, h: 46 };
  });
  const EDGE = 12, aboveSpan: [number, number] = [at(L, EDGE), at(L, w - EDGE)], underSpan: [number, number] = [at(L2, EDGE), at(L2, w - EDGE)];
  const top = arc.reduce((m, p) => p.y < m.y ? p : m, { x: w / 2, y: 1e9 } as { x: number; y: number });
  return { w, h, arc, above, under, valueAt, goalAt, aboveSpan, underSpan, targets, apex: { x: top.x, y: top.y } };
}
