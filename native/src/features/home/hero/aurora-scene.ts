import { BlendMode, VertexMode, type SkCanvas, type SkRuntimeEffect, type Skia as SkiaApi } from '@shopify/react-native-skia';
import { CEN, CH, R, arcAt, fit, limb, place, sphere, toScreen, type ArcPt, type Cam, type V3 } from './camera';
import { HILLS, c01, field, fieldData, isolines, levelValue, pillarH, type Triple } from './field';
import { SKY_SKSL, SPRITE_SKSL } from './shaders';
import { hexRgb, tones, type HeroColors } from './tones';

/**
 * The Aurora hero, drawn with Skia: one runtime shader for the globe, sky and limb gauge; the isobar curtains as one mesh of
 * coloured triangles (rebuilt only while something moves); and the lit points of met goals. Everything here is plain state
 * and drawing, so the same code renders on a phone, on the web and in a check with CanvasKit.
 */
export type Sk = typeof SkiaApi;
/** Gauge arcs in screen order (Training, Sleep, Food), as fractions of the hero's width; SLOT maps each arc to its pillar. */
export const SLOT = [0, 2, 1] as const;
export const SEG: readonly (readonly [number, number])[] = [[0.07, 0.335], [0.37, 0.63], [0.665, 0.93]];
export const HERO_H = 352;
const AIR_K: V3 = [0.95, 0.3, 0.1];

export interface SceneFrame {
  /** Globe surfacing 0..1, rim reveal 0..1, gauge 0..1, field grow 0..1. */
  globe: number; rim: number; gauge: number; grow: number;
  /** Current curtains' rise (0..2, 1.05 is fully up) and fade; incoming curtains (a day change) rise over them. */
  curT: number; curFade: number; nextT: number; nextFade: number;
  phase: number; yaw: number;
  /** Per pillar (Training, Food, Sleep): arc fill 0..1, met light 0..1, ignition 0..1, rest. Focus dim per screen arc. */
  fill: Triple; lit: Triple; ign: Triple; rest: Triple; dim: Triple;
  /** Values the globe's colour wash and seeds follow (they spring between days). */
  values: Triple;
  /** The all met join: front of the light in points (-100 none, 1e4 done) and its glint. */
  join: number; joinGlint: number;
}
interface Curtain { n: number; pos: Float32Array; up: Float32Array; side: Float32Array; s: Float32Array; k: Float32Array; w: Float32Array; lines: { start: number; n: number; closed: boolean }[] }

const smooth = (a: number, b: number, x: number) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const outCubic = (x: number) => 1 - Math.pow(1 - c01(x), 3);

export class AuroraScene {
  readonly w: number; readonly h = HERO_H; dpr: number; mode: 'dark' | 'light';
  cam!: Cam; arc: ArcPt[] = []; camD = 3; camTy = 0;
  levels: number; glow: number;
  private sky: SkRuntimeEffect | null; private sprite: SkRuntimeEffect | null;
  private col: HeroColors; private cur: Curtain | null = null; private next: Curtain | null = null;
  private seeds: Triple = [1, 1, 1]; private peaks: Triple = [0, 0, 0];
  private cache: { key: string; verts: unknown } | null = null;

  constructor(private Sk: Sk, o: { w: number; dpr: number; mode: 'dark' | 'light'; colors: Record<string, string>; levels?: number; glow?: number }) {
    this.w = o.w; this.dpr = Math.min(3, o.dpr || 1); this.mode = o.mode; this.levels = o.levels ?? 9; this.glow = o.glow ?? 1;
    this.col = tones(o.colors, o.mode);
    this.sky = Sk.RuntimeEffect.Make(SKY_SKSL); this.sprite = Sk.RuntimeEffect.Make(SPRITE_SKSL);
    const f = fit(this.w, this.h); this.camD = f.camD; this.camTy = f.camTy;
    this.cam = place(this.camD, this.camTy, 0, this.w, this.h); this.arc = limb(this.cam);
  }
  /** True when the device can run the hero's shaders. */
  get ok() { return !!this.sky && !!this.sprite; }
  setColors(colors: Record<string, string>, mode: 'dark' | 'light') { this.mode = mode; this.col = tones(colors, mode); this.cache = null; }
  /** New day data: rebuilds the curtains. `incoming` keeps the old ones to cross over (a day change). */
  setData(values: Triple, incoming: boolean) {
    const data = fieldData(values), c = this.buildCurtains(data);
    if (incoming) this.next = c; else { this.cur = c; this.next = null; }
    this.seeds = [values[0] > 0 ? 0 : 1, values[1] > 0 ? 0 : 1, values[2] > 0 ? 0 : 1];
    this.peaks = [0, 1, 2].map(i => data.pillars[i].value > 0 ? data.pillars[i].value + 0.07 : 0) as unknown as Triple;
    this.cache = null;
  }
  /** The incoming curtains become the current ones (a day change finished). */
  settle() { if (this.next) { this.cur = this.next; this.next = null; this.cache = null; } }
  /** The limb at a hero x, for text and targets. */
  arcAt(x: number) { return arcAt(this.arc, x); }

  private buildCurtains(data: ReturnType<typeof fieldData>): Curtain {
    const iso = isolines({ L: this.levels, nx: 120, ny: 60, smooth: 1, fn: (x, y) => field(x, y, data) });
    const pos: number[] = [], up: number[] = [], side: number[] = [], ss: number[] = [], kk: number[] = [], ww: number[] = [], lines: Curtain['lines'] = [];
    for (const lv of iso) for (const ln of lv.lines) {
      const p = ln.pts, n = p.length / 2;
      if (n < 3) continue;
      lines.push({ start: ss.length, n, closed: ln.closed });
      let s = 0;
      for (let i = 0; i < n; i++) {
        const x = p[i * 2], y = p[i * 2 + 1];
        const ia = ln.closed ? (i - 1 + n) % n : Math.max(0, i - 1), ib = ln.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
        if (i > 0) { const dx = (x - p[i * 2 - 2]) * 2, dy = y - p[i * 2 - 1]; s += Math.sqrt(dx * dx + dy * dy); }
        const sp = sphere(x, y, lv.level);
        let tx = (p[ib * 2] - p[ia * 2]) * 2, tz = p[ib * 2 + 1] - p[ia * 2 + 1];
        const tl = Math.sqrt(tx * tx + tz * tz) || 1; tx /= tl; tz /= tl;
        const u = sp.n;
        let wa = pillarH(data.pillars[0], 0, x, y), wb = pillarH(data.pillars[1], 1, x, y), wc = pillarH(data.pillars[2], 2, x, y);
        wa *= wa; wb *= wb; wc *= wc; const sum = wa + wb + wc || 1;
        pos.push(...sp.p); up.push(...u); side.push(u[1] * tz, u[2] * tx - u[0] * tz, -u[1] * tx); ss.push(s); kk.push(lv.k); ww.push(wa / sum, wb / sum, wc / sum);
      }
    }
    return { n: ss.length, pos: new Float32Array(pos), up: new Float32Array(up), side: new Float32Array(side), s: new Float32Array(ss), k: new Float32Array(kk), w: new Float32Array(ww), lines };
  }

  /** Draws one frame into the canvas, in hero points. */
  draw(canvas: SkCanvas, f: SceneFrame) {
    const Sk = this.Sk;
    if (!this.sky || !this.sprite) return;
    const cam = place(this.camD, this.camTy, f.yaw, this.w, this.h); this.cam = cam;
    const paint = Sk.Paint();
    paint.setShader(this.sky.makeShader(this.uniforms(cam, f)));
    canvas.drawRect(Sk.XYWHRect(0, 0, this.w, this.h), paint);
    if (this.cur && f.curFade > 0.002) this.drawCurtain(canvas, this.cur, cam, f.curT, f.curFade, f.phase);
    if (this.next && f.nextFade > 0.002) this.drawCurtain(canvas, this.next, cam, f.nextT, f.nextFade, f.phase);
    this.drawSprites(canvas, cam, f);
  }

  private uniforms(cam: Cam, f: SceneFrame): number[] {
    const c = this.col, dk = this.mode === 'dark', P = (h: string) => hexRgb(h);
    const gc = SLOT.map(i => P(c.pillar[i]));
    const bySlot = (t: Triple) => SLOT.map(i => t[i]);
    return [
      this.w, this.h, this.dpr,
      ...cam.pos, ...cam.right, ...cam.up, ...cam.fwd, cam.tanY * cam.aspect, cam.tanY,
      ...CEN, R,
      dk ? 1 : 0, f.rim, f.globe, f.grow,
      ...P(c.pillar[0]), ...P(c.pillar[1]), ...P(c.pillar[2]),
      ...f.values, ...this.seeds,
      ...P(c.base), ...P(c.limb), ...P(c.air), ...P(c.air2), ...P(c.grid),
      SEG[0][0], SEG[1][0], SEG[2][0], SEG[0][1], SEG[1][1], SEG[2][1],
      ...bySlot(f.fill), ...bySlot(f.lit), ...bySlot(f.rest),
      ...gc[0], ...gc[1], ...gc[2],
      f.gauge, this.w, ...f.dim, f.join, f.joinGlint,
      ...AIR_K, this.glow,
    ];
  }

  /** One curtain mesh: each isobar rises as a ribbon, its base a bright line with a short glow, its face a soft falloff. */
  private drawCurtain(canvas: SkCanvas, c: Curtain, cam: Cam, uT: number, fade: number, phase: number) {
    const Sk = this.Sk, dk = this.mode === 'dark', dpr = this.dpr, col = this.col;
    const pc = [hexRgb(col.pillar[0]), hexRgb(col.pillar[1]), hexRgb(col.pillar[2])], hi = hexRgb(col.hi), ink = hexRgb(col.ink);
    // Rows up each column: the line and its glow at fixed distances in points, then the face at fractions of its height.
    // A row just under the base fades the line out below it, so the line is anti-aliased on both sides.
    const GLOW = [0, 0.5, 1.1, 2.2, 4.5, 9], FACE = [0.22, 0.45, 0.7, 1], UNDER = 0.7;
    const ROWS = 1 + GLOW.length + FACE.length;
    const bx = new Float32Array(c.n), by = new Float32Array(c.n), tx = new Float32Array(c.n), ty = new Float32Array(c.n), g = new Float32Array(c.n);
    for (let i = 0; i < c.n; i++) {
      const k = c.k[i], s = c.s[i], top = k >= 8.5 ? 1 : 0;
      let gi = c01((uT - (k - 1) * 0.07) / 0.44); gi = 1 - Math.pow(1 - gi, 3); g[i] = gi;
      const hm = 0.74 + 0.16 * Math.sin(s * 9 + phase + k * 1.7) + 0.10 * Math.sin(s * 23 - phase * 1.6 + k);
      const ch = CH * (0.42 + 0.58 * k / 9) * hm * (1 + 0.35 * top) * (0.35 + 0.65 * fade);
      const wob = gi * 0.016 * Math.sin(s * 6 + phase * 0.8 + k * 2.1), o = i * 3;
      const P: V3 = [c.pos[o], c.pos[o + 1], c.pos[o + 2]];
      const T: V3 = [P[0] + c.up[o] * ch * gi + c.side[o] * wob, P[1] + c.up[o + 1] * ch * gi + c.side[o + 1] * wob, P[2] + c.up[o + 2] * ch * gi + c.side[o + 2] * wob];
      const b = toScreen(cam, P), t = toScreen(cam, T);
      bx[i] = b.x; by[i] = b.y; tx[i] = t.x; ty[i] = t.y;
    }
    let positions: { x: number; y: number }[] = [], colors: Float32Array[] = [], indices: number[] = [];
    const paint = Sk.Paint();
    paint.setBlendMode(dk ? BlendMode.Plus : BlendMode.SrcOver);
    // Skia indexes vertices with 16 bits, so the mesh goes out in batches.
    const flush = () => {
      if (positions.length) canvas.drawVertices(Sk.MakeVertices(VertexMode.Triangles, positions, null, colors, indices, true), BlendMode.Dst, paint);
      positions = []; colors = []; indices = [];
    };
    for (const ln of c.lines) {
      if (positions.length + ln.n * ROWS > 60000) flush();
      const base = positions.length;
      for (let j = 0; j < ln.n; j++) {
        const i = ln.start + j, k = c.k[i], top = k >= 8.5 ? 1 : 0, lv = k / 9, vG = g[i] * fade;
        const hx = tx[i] - bx[i], hy = ty[i] - by[i], hl = Math.hypot(hx, hy);
        // seen edge on, a ribbon is thinner than a pixel and would sparkle: fade it as its length along the line crowds
        const ia = ln.start + (ln.closed ? (j - 1 + ln.n) % ln.n : Math.max(0, j - 1)), ib = ln.start + (ln.closed ? (j + 1) % ln.n : Math.min(ln.n - 1, j + 1));
        let dsv = c.s[ib] - c.s[ia];
        if (dsv <= 0) dsv = 2 * Math.abs(j > 0 ? c.s[i] - c.s[i - 1] : c.s[ib] - c.s[i]) || 1e-6;
        const Bx = (bx[ib] - bx[ia]) / dsv, By = (by[ib] - by[ia]) / dsv;
        const pxPerS = hl > 0.05 ? Math.abs(Bx * hy - By * hx) / hl : Math.hypot(Bx, By);
        const eo = smooth(5, 22, pxPerS);
        const w0 = c.w[i * 3], w1 = c.w[i * 3 + 1], w2 = c.w[i * 3 + 2], ws = w0 + w1 + w2 || 1;
        const cr = (pc[0][0] * w0 + pc[1][0] * w1 + pc[2][0] * w2) / ws, cg = (pc[0][1] * w0 + pc[1][1] * w1 + pc[2][1] * w2) / ws, cb = (pc[0][2] * w0 + pc[1][2] * w1 + pc[2][2] * w2) / ws;
        const vs: number[] = [hl > 0.01 ? -UNDER / hl : 0];
        for (const d of GLOW) vs.push(hl > 0.01 ? Math.min(1, d / hl) : 0);
        for (const v of FACE) vs.push(v);
        vs.sort((a, b) => a - b);
        for (const v of vs) {
          const under = v < 0 ? 0 : 1;
          positions.push({ x: bx[i] + hx * v, y: by[i] + hy * v });
          const dpx = Math.max(0, v) * hl * dpr, cw = (0.5 + 0.5 * top) * dpr;
          const core = 1 - smooth(cw, cw + 1.2, dpx), glowL = Math.exp(-dpx / ((2.6 + 2 * top) * dpr));
          const fall = Math.pow(Math.max(0, 1 - v), 1.9) * smooth(0, 0.05, v + 0.02), lower = Math.exp(-v * 9), cur = fall * 0.62 + lower * 0.5;
          const hiT = smooth(0.25, 0.95, v) * 0.55, ccr = cr + (hi[0] - cr) * hiT, ccg = cg + (hi[1] - cg) * hiT, ccb = cb + (hi[2] - cb) * hiT;
          let r: number, gg: number, bb: number, a: number;
          if (dk) {
            const ht = 0.35 + 0.25 * lv + 0.15 * top, li = (0.75 + 0.4 * lv) * (1 + 1.2 * top), q = (0.28 + 0.14 * lv) * (1 + 0.25 * top);
            r = ((cr + (1 - cr) * ht) * core * 1.15 + cr * glowL * 0.42) * li + ccr * cur * q;
            gg = ((cg + (1 - cg) * ht) * core * 1.15 + cg * glowL * 0.42) * li + ccg * cur * q;
            bb = ((cb + (1 - cb) * ht) * core * 1.15 + cb * glowL * 0.42) * li + ccb * cur * q;
            const m = vG * eo * under; r *= m; gg *= m; bb *= m; a = 1;
          } else {
            const it = 0.18 - 0.18 * top, ir = cr + (ink[0] - cr) * it, ig = cg + (ink[1] - cg) * it, ib2 = cb + (ink[2] - cb) * it;
            const la = c01(core * (0.78 + 0.22 * lv + 0.3 * top)), ca = c01(cur * (0.17 + 0.07 * lv) * (1 + 0.35 * top) + glowL * (0.08 + 0.12 * top));
            a = (la + ca * (1 - la)) * vG * eo * under;
            const pr = ir * la + ccr * ca * (1 - la), pg = ig * la + ccg * ca * (1 - la), pb = ib2 * la + ccb * ca * (1 - la);
            const al = la + ca * (1 - la) || 1;
            r = pr / al; gg = pg / al; bb = pb / al;
          }
          colors.push(Float32Array.of(c01(r), c01(gg), c01(bb), c01(a)));
        }
      }
      const cols = ln.closed ? ln.n : ln.n - 1;
      for (let j = 0; j < cols; j++) {
        const a0 = base + j * ROWS, b0 = base + ((j + 1) % ln.n) * ROWS;
        for (let r = 0; r < ROWS - 1; r++) indices.push(a0 + r, b0 + r, a0 + r + 1, a0 + r + 1, b0 + r, b0 + r + 1);
      }
    }
    flush();
  }

  /** Lit points: each met arc's end cap and its hill's summit, with a star flare while they ignite. */
  private drawSprites(canvas: SkCanvas, cam: Cam, f: SceneFrame) {
    const Sk = this.Sk, dk = this.mode === 'dark';
    for (let i = 0; i < 3; i++) {
      if (f.lit[i] < 0.003 && f.ign[i] < 0.003) continue;
      const j = (SLOT as readonly number[]).indexOf(i), rgb = hexRgb(this.col.pillar[i]);
      const sp = sphere(HILLS[i][0], HILLS[i][1], this.peaks[i]), hp: V3 = [sp.p[0] + sp.n[0] * 0.004, sp.p[1] + sp.n[1] * 0.004, sp.p[2] + sp.n[2] * 0.004];
      const at = [{ p: toScreen(cam, hp), lit: f.lit[i], ign: f.ign[i] * 0.7 }];
      const cp = arcAt(this.arc, SEG[j][1] * this.w);
      if (cp) at.push({ p: { ...toScreen(cam, cp.P) }, lit: 0, ign: f.ign[i] });
      for (const s of at) {
        if (s.lit < 0.003 && s.ign < 0.003) continue;
        const box = 70, paint = Sk.Paint();
        paint.setShader(this.sprite!.makeShader([box, dk ? 1 : 0, this.glow, s.lit, s.ign, ...rgb]));
        canvas.save(); canvas.translate(s.p.x - box / 2, s.p.y - box / 2);
        canvas.drawRect(Sk.XYWHRect(0, 0, box, box), paint);
        canvas.restore();
      }
    }
  }
}
export { levelValue, outCubic };
