import { c01, type Triple } from './field';

/**
 * The Aurora hero's clock, as plain state: the opening build, a day change, a met goal's glint, the all met light along the
 * limb, the focus dim on the arcs and the globe's turn after a drag. `frame(now)` gives the scene's values for a moment and
 * whether anything still moves, so frames only run while something does. Reduce Motion (and calm motion) start at the end.
 */
export const ENT = { globe: [0, 480], rim: [100, 760], gauge: [260, 700], fill: [420, 1240], grow: [240, 1080], flare: 1240, end: 1960 } as const;
export const MORPH = 780, SWEEP = 1100, GLINT = 760;
/** Screen order of the arcs (Training, Sleep, Food) as pillar indexes, and each arc's span as fractions of the width. */
export const SLOT = [0, 2, 1] as const;
export const SEG: readonly (readonly [number, number])[] = [[0.07, 0.335], [0.37, 0.63], [0.665, 0.93]];

export const outCubic = (x: number) => 1 - Math.pow(1 - c01(x), 3);
export const inOutCubic = (x: number) => { const t = c01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const span = (T: number, a: readonly [number, number]) => c01((T - a[0]) / (a[1] - a[0]));
type T3 = [number, number, number];

export interface DayState {
  /** Each pillar's progress (0 to 1.05); rest days leave Training at 0. */
  values: Triple; rest: boolean;
}
export interface MotionFrame {
  globe: number; rim: number; gauge: number; grow: number;
  curT: number; curFade: number; nextT: number; nextFade: number;
  phase: number; yaw: number;
  fill: Triple; lit: Triple; ign: Triple; rest: Triple; dim: Triple; values: Triple;
  join: number; joinGlint: number;
}

export class HeroMotion {
  private rm: boolean;
  private ent = { on: false, t0: 0, flared: true };
  // fadeFrom: the leaving day's fade when this change began; tFrom: how far the rising day was already up; curT0: the leaving
  // day's height (2 when fully up); yaw0: the globe's turn handed over from a swipe or the last change.
  private morph = { on: false, t0: 0, dir: 0, flared: true, fadeFrom: 1, tFrom: 0, curT0: 2, yaw0: 0 };
  private gf = { cur: [0, 0, 0] as T3, to: [0, 0, 0] as T3, from: [0, 0, 0] as T3, rest: [0, 0, 0] as T3 };
  private vt = { from: [0, 0, 0] as T3, to: [0, 0, 0] as T3, p: 1 };
  private lit: T3 = [0, 0, 0]; private glint: T3 = [-1, -1, -1]; private met = [false, false, false];
  private join = { t0: -1, done: false };
  private foc = { cur: [1, 1, 1] as T3, to: [1, 1, 1] as T3 };
  private last = 0; private phase = 0;
  /** The globe's turn from a drag, -0.5..0.5; it eases back to 0 once let go. */
  az = 0; dragging = false;
  /** Called when a day change has finished, so the scene can keep the new curtains as its own. */
  onSettle: () => void = () => {};

  constructor(private width: number, o: { reduceMotion: boolean }) { this.rm = o.reduceMotion; }

  get entering() { return this.ent.on; }
  get morphing() { return this.morph.on; }
  setWidth(w: number) { this.width = w; }

  private stats(d: DayState) {
    const v = d.values;
    this.met = [v[0] >= 1, v[1] >= 1, v[2] >= 1];
    this.vt.to = [v[0], v[1], v[2]];
    this.gf.to = [d.rest ? 0 : Math.min(1, v[0]), Math.min(1, v[1]), Math.min(1, v[2])];
    this.gf.rest = [d.rest ? 1 : 0, 0, 0];
  }
  private get allMet() { return this.met[0] && this.met[1] && this.met[2]; }
  private joinNow() { this.join.t0 = -1; this.join.done = this.allMet; }
  private litNow() { this.lit = this.met.map(m => m ? 1 : 0) as T3; this.glint = [-1, -1, -1]; this.joinNow(); }
  private igniteMet(now: number) {
    for (let i = 0; i < 3; i++) if (this.met[i] && this.lit[i] < 1) { if (this.rm) this.lit[i] = 1; else this.glint[i] = now; }
    if (this.allMet && !this.join.done && this.join.t0 < 0) { if (this.rm) this.join.done = true; else this.join.t0 = now + 320; }
  }

  /** The first day, with the opening build unless Reduce Motion is on or `calm` skips it. */
  start(d: DayState, now: number, calm = false) {
    this.stats(d); this.vt.from = this.vt.to.slice() as T3; this.vt.p = 1; this.morph.on = false;
    if (this.rm || calm) { this.ent.on = false; this.gf.cur = this.gf.to.slice() as T3; this.litNow(); return; }
    this.ent = { on: true, t0: now, flared: false }; this.lit = [0, 0, 0]; this.glint = [-1, -1, -1]; this.join = { t0: -1, done: false };
    this.gf.cur = [0, 0, 0];
  }
  /** Ends the opening build at once (a touch, a scroll). */
  finishEntrance() {
    if (!this.ent.on) return;
    this.ent.on = false; this.gf.cur = this.gf.to.slice() as T3;
    if (!this.ent.flared) { this.ent.flared = true; this.litNow(); }
  }
  /** The crossing at `now`: the leaving day's height and fade, the rising day's height and the view's turn. */
  private crossing(now: number) {
    const m = this.morph, mt = now - m.t0, p = c01(mt / MORPH), d = m.tFrom > 0 ? 0 : 110;
    const rise = outCubic((mt - d) / (MORPH - d));
    return { mt, p, rise, curT: m.curT0, curFade: m.fadeFrom * (1 - outCubic(mt / 300)), nextT: m.tFrom + (1.05 - m.tFrom) * rise,
      yaw: m.yaw0 * (1 - inOutCubic(p)) + m.dir * 0.16 * Math.sin(Math.PI * p) };
  }
  /**
   * A new day: with `animate`, the old curtains sink while the new ones rise and the arcs slide; dir swings the view toward the new
   * day and `turn` is the globe's turn handed over from a swipe, which eases out as the view swings. A change in the middle of another
   * carries on from what is on screen instead of snapping: the rising day keeps its height (it becomes the leaving day once a third
   * up; before that it takes the new day's shape and keeps rising), the leaving day keeps its fade, and the fills, values and turn
   * slide on from where they are. Returns 'cross' for a fresh crossing, 'promote' when the scene should first keep its incoming
   * curtains as the leaving ones, 'replace' when it should swap the incoming curtains for the new day's, or false for no motion.
   */
  setDay(d: DayState, animate: boolean, dir: number, now: number, turn = this.handoff): 'cross' | 'promote' | 'replace' | false {
    this.handoff = 0;
    if (!animate || this.rm) {
      if (this.morph.on) this.finishMorph();
      this.stats(d); this.gf.cur = this.gf.to.slice() as T3; this.vt.from = this.vt.to.slice() as T3; this.vt.p = 1; this.litNow(); return false;
    }
    let mode: 'cross' | 'promote' | 'replace' = 'cross', fadeFrom = 1, tFrom = 0, curT0 = 2, yaw0 = turn;
    if (this.morph.on) {
      const c = this.crossing(now);
      yaw0 += c.yaw;
      if (c.nextT >= 0.35) { mode = 'promote'; curT0 = c.nextT; }
      else { mode = 'replace'; fadeFrom = c.curFade; tFrom = c.nextT; curT0 = c.curT; }
    }
    const vp0 = outCubic(this.vt.p);
    this.vt.from = this.vt.from.map((v, i) => v + (this.vt.to[i] - v) * vp0) as T3; this.vt.p = 0;
    this.join = { t0: -1, done: false };
    this.gf.from = this.gf.cur.slice() as T3; this.stats(d);
    this.lit = [0, 0, 0]; this.glint = [-1, -1, -1];
    this.morph = { on: true, t0: now, dir, flared: false, fadeFrom, tFrom, curT0, yaw0 };
    return mode;
  }
  /** A swipe that changes the day hands its turn to the change, which eases it out as the view swings toward the new day. */
  takeTurn() { this.handoff = this.az; this.az = 0; this.dragging = false; this.rest(); }
  private handoff = 0;
  private kicker: () => void = () => {};
  /** Asks the canvas for frames (it hands its own in with setKick). */
  kick() { this.kicker(); }
  setKick(fn: () => void) { this.kicker = fn; }
  private finishMorph() {
    if (!this.morph.on) return;
    this.morph.on = false; this.gf.cur = this.gf.to.slice() as T3; this.vt.p = 1;
    if (!this.morph.flared) { this.morph.flared = true; this.litNow(); }
    this.onSettle();
  }
  /** One pillar's full readout: the other arcs dim to 38%. -1 shows them all. */
  focus(pi: number) {
    for (let j = 0; j < 3; j++) { this.foc.to[j] = pi < 0 || SLOT[j] === pi ? 1 : 0.38; if (this.rm) this.foc.cur[j] = this.foc.to[j]; }
  }
  setReduceMotion(on: boolean) {
    this.rm = on;
    if (on) { this.finishEntrance(); this.finishMorph(); this.az = 0; this.dragging = false; this.foc.cur = this.foc.to.slice() as T3; this.litNow(); }
  }
  /** Forget the frame time, so the next frame after a pause doesn't jump. */
  rest() { this.last = 0; }
  /** A horizontal drag starts: the turn it starts from. */
  beginDrag() { this.dragging = true; this.handoff = 0; return this.az; }
  /** The drag's turn, held to -0.5..0.5. */
  dragTo(az: number) { this.az = Math.max(-0.5, Math.min(0.5, az)); }
  /** Let go: the turn eases back to 0. */
  endDrag() { this.dragging = false; this.rest(); }
  /** Who hears that a day change has finished. */
  setOnSettle(fn: () => void) { this.onSettle = fn; }

  /** The scene's values at `now`, and whether another frame is needed. */
  frame(now: number): { f: MotionFrame; busy: boolean } {
    const dt = Math.min(64, now - (this.last || now)); this.last = now;
    let busy = false, globe = 1, rim = 1, gauge = 1, grow = 1, curT = 2, curFade = 1, nextT = 0, nextFade = 0, swing = 0;
    if (this.ent.on) {
      const T = now - this.ent.t0;
      if (T >= ENT.end) this.finishEntrance();
      else {
        busy = true;
        globe = outCubic(span(T, ENT.globe)); rim = inOutCubic(span(T, ENT.rim)); gauge = outCubic(span(T, ENT.gauge));
        grow = outCubic(span(T, ENT.grow)); curT = grow * 1.05; this.phase = T * 0.0021;
        const gq = outCubic(span(T, ENT.fill));
        for (let i = 0; i < 3; i++) this.gf.cur[i] = this.gf.to[i] * gq;
        if (!this.ent.flared && T >= ENT.flare) { this.ent.flared = true; this.igniteMet(now); }
      }
    }
    if (this.morph.on) {
      const c = this.crossing(now);
      curT = c.curT; curFade = c.curFade; nextFade = 1; nextT = c.nextT; this.phase += dt * 0.0024;
      for (let i = 0; i < 3; i++) this.gf.cur[i] = this.gf.from[i] + (this.gf.to[i] - this.gf.from[i]) * c.rise;
      this.vt.p = c01((c.mt - 60) / (MORPH - 60));
      swing = c.yaw;
      if (!this.morph.flared && c.p >= 0.78) { this.morph.flared = true; if (!this.ent.on || this.ent.flared) this.igniteMet(now); }
      if (c.p >= 1) { this.finishMorph(); curT = 2; curFade = 1; nextT = 0; nextFade = 0; swing = 0; } else busy = true;
    }
    if (this.dragging) this.phase += dt * 0.0012;
    else if (this.az !== 0) { this.az *= Math.exp(-dt / 160); this.phase += dt * 0.0012; if (Math.abs(this.az) < 0.0008) this.az = 0; else busy = true; }
    const ign: T3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) if (this.glint[i] >= 0) {
      const gp = c01((now - this.glint[i]) / GLINT);
      this.lit[i] = Math.max(this.lit[i], c01(gp / 0.2)); ign[i] = gp < 0.2 ? gp / 0.2 : Math.pow(1 - (gp - 0.2) / 0.8, 1.6);
      if (now - this.glint[i] >= GLINT) { this.glint[i] = -1; this.lit[i] = 1; ign[i] = 0; } else busy = true;
    }
    let join = this.join.done ? 1e4 : -100, joinGlint = 0;
    if (this.join.t0 >= 0) {
      const jp = (now - this.join.t0) / SWEEP;
      if (jp >= 1) { this.join.t0 = -1; this.join.done = true; join = 1e4; }
      else { busy = true; if (jp > 0) { join = (SEG[0][0] + (SEG[2][1] - SEG[0][0]) * inOutCubic(jp)) * this.width; joinGlint = Math.sin(Math.PI * jp); } }
    }
    for (let i = 0; i < 3; i++) {
      const fd = this.foc.to[i] - this.foc.cur[i];
      if (Math.abs(fd) > 0.004) { this.foc.cur[i] += fd * (1 - Math.exp(-dt / 75)); busy = true; } else this.foc.cur[i] = this.foc.to[i];
    }
    const vp = outCubic(this.vt.p), values = this.vt.from.map((v, i) => v + (this.vt.to[i] - v) * vp) as T3;
    return {
      busy,
      f: {
        globe, rim, gauge, grow, curT, curFade, nextT, nextFade, phase: this.phase, yaw: this.az + swing,
        fill: this.gf.cur.slice() as T3, lit: this.lit.slice() as T3, ign, rest: this.gf.rest.slice() as T3, dim: this.foc.cur.slice() as T3, values,
        join, joinGlint,
      },
    };
  }
}
