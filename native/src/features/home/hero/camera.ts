/**
 * The hero's camera: a globe of radius R whose centre sits R below the origin, seen from above at a fixed elevation. The camera
 * is fitted so the map fills the hero's width and the limb (the globe's edge) sits at the same height on every screen, then
 * the limb is traced as a curve in hero points for the gauge text, its tap targets and the day score at its apex.
 */
export const R = 5.0, EL = 0.6, FOV = 27, HERO_H = 352, HZ = 0.5, HS = 0.32, CH = 0.24;
export type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const CEN: V3 = [0, -R, 0];

export interface Cam { pos: V3; right: V3; up: V3; fwd: V3; tanY: number; aspect: number; w: number; h: number }
/** The camera at distance d from its target (0, ty, 0), turned by yaw a around the globe's axis. */
export function place(d: number, ty: number, a: number, w: number, h: number): Cam {
  const ce = Math.cos(EL), pos: V3 = [Math.sin(a) * ce * d, ty + Math.sin(EL) * d, Math.cos(a) * ce * d];
  const fwd = norm(sub([0, ty, 0], pos)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  return { pos, right, up, fwd, tanY: Math.tan(FOV / 2 * Math.PI / 180), aspect: w / h, w, h };
}
/** A world point in normalised device coordinates (x right, y up, -1..1) and its depth in front of the camera. */
export function ndc(c: Cam, p: V3) {
  const d = sub(p, c.pos), z = dot(d, c.fwd);
  return { x: dot(d, c.right) / (z * c.tanY * c.aspect), y: dot(d, c.up) / (z * c.tanY), z };
}
/** A world point in hero points. */
export function toScreen(c: Cam, p: V3) { const q = ndc(c, p); return { x: (q.x * 0.5 + 0.5) * c.w, y: (-q.y * 0.5 + 0.5) * c.h, z: q.z }; }
function horizon(c: Cam) {
  let best = -9;
  const yaw = Math.atan2(c.pos[0], c.pos[2]), dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  for (let q = 0; q <= 60; q++) {
    const ph = q / 60 * 1.3, y = ndc(c, [CEN[0] + R * Math.sin(ph) * dx, CEN[1] + R * Math.cos(ph), CEN[2] + R * Math.sin(ph) * dz]).y;
    if (y > best) best = y;
  }
  return best;
}
/** Distance and target height so the map's edge just fills the width and the limb's top stands at HZ. */
export function fit(w: number, h = HERO_H) {
  let camD = 3, camTy = 0;
  for (let it = 0; it < 4; it++) {
    let lo = 1.2, hi = 9, m: number;
    for (let q = 0; q < 24; q++) { m = (lo + hi) / 2; if (Math.abs(ndc(place(m, camTy, 0, w, h), [0.92, -0.06, 0.3]).x) > 1.12) lo = m; else hi = m; }
    camD = hi; lo = -1.5; hi = 1.5;
    for (let q = 0; q < 24; q++) { m = (lo + hi) / 2; if (horizon(place(camD, m, 0, w, h)) < HZ) hi = m; else lo = m; }
    camTy = (lo + hi) / 2;
  }
  return { camD, camTy };
}
/** A map point (x, y in 0..1) raised h above the globe: its world position and the outward normal there. */
export function sphere(x: number, y: number, h: number) {
  const X = (x - 0.5) * 2, Z = y - 0.5, l = Math.sqrt(X * X + R * R + Z * Z), r = R + h * HS;
  return { p: [X / l * r, R / l * r - R, Z / l * r] as V3, n: [X / l, R / l, Z / l] as V3 };
}
export interface ArcPt { x: number; y: number; P: V3 }
/** The limb in hero points: the exact silhouette circle of the globe seen from the camera, left to right. */
export function limb(c: Cam): ArcPt[] {
  const oc = sub(c.pos, CEN), d = Math.hypot(oc[0], oc[1], oc[2]), n: V3 = [oc[0] / d, oc[1] / d, oc[2] / d];
  const cc = add(CEN, n, R * R / d), rr = R * Math.sqrt(1 - R * R / (d * d));
  const e1 = norm(cross([0, 1, 0], n)), e2 = norm(cross(n, e1)), pts: ArcPt[] = [];
  for (let q = -240; q <= 240; q++) {
    const th = q / 240 * 1.5, P = add(add(cc, e2, rr * Math.cos(th)), e1, rr * Math.sin(th)), s = toScreen(c, P);
    if (s.x > -60 && s.x < c.w + 60 && s.z > 0) pts.push({ x: s.x, y: s.y, P });
  }
  return pts.sort((a, b) => a.x - b.x);
}
/** The limb at hero x: its height, slope and the world point there. */
export function arcAt(pts: ArcPt[], x: number) {
  if (pts.length < 2) return null;
  let i = 1;
  while (i < pts.length - 1 && pts[i].x < x) i++;
  const a = pts[i - 1], b = pts[i], dx = (b.x - a.x) || 1, t = (x - a.x) / dx;
  return { x, y: a.y + (b.y - a.y) * t, sl: (b.y - a.y) / dx, P: [a.P[0] + (b.P[0] - a.P[0]) * t, a.P[1] + (b.P[1] - a.P[1]) * t, a.P[2] + (b.P[2] - a.P[2]) * t] as V3 };
}
