import type { HeroView, Part } from './model';

/**
 * Ridgeline, the 2D map style: a quiet layered horizon. Far ranges fade toward the sky; the front ridge carries three peaks
 * that rise to each pillar's value (Training, Food, Sleep). A goal tick hangs over every peak with a dotted plumb line for the
 * climb left; a met goal closes the line and the summit takes a lit marker. Under each peak, its label, real value and goal;
 * above, the caption and the day score. Pure: it returns SVG markup for one moment of the scene.
 */
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const c01 = (v: number) => clamp(v, 0, 1);
const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (n: number) => (Math.round(n * 10) / 10).toString();
export const smooth = (a: number, b: number, x: number) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const outCubic = (x: number) => 1 - Math.pow(1 - c01(x), 3);
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function rgb(h: string) { let s = String(h || '#000').replace('#', ''); if (s.length === 3) s = s.replace(/./g, '$&$&'); return [0, 2, 4].map(i => parseInt(s.substr(i, 2), 16) || 0); }
function hex(c: number[]) { return '#' + c.map(v => { const x = clamp(Math.round(v), 0, 255); return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
export function mix(a: string, b: string, t: number) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); }
function lum(h: string) { return rgb(h).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
export function ratio(a: string, b: string) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** The colour moved toward the text colour until it reads at `min`:1 on bg (AA for small text). */
export function ink(c: string, bg: string, txt: string, min: number) { let t = 0, o = c; while (ratio(o, bg) < min && t < 1) { t += 0.06; o = mix(c, txt, t); } return o; }
function hash(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
/** Smooth deterministic 1D noise in -1..1. */
function wave(x: number, seed: number, oct: number) { let s = 0, a = 1, fr = 1, nm = 0; for (let k = 0; k < oct; k++) { s += a * Math.sin(x * fr + hash(seed * 13 + k) * 6.2832); nm += a; a *= 0.52; fr *= 2.07; } return s / nm; }
function poly(p: number[][]) { let d = ''; for (let i = 0; i < p.length; i++) d += (i ? 'L' : 'M') + f(p[i][0]) + ' ' + f(p[i][1]); return d; }
/** Path trim for the entrance: the first rr of the path is drawn. */
function trim(rr: number) { return rr >= 0.999 ? '' : ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${(1 - c01(rr)).toFixed(4)}"`; }

export interface RidgeColors { dk: boolean; bg: string; text: string; muted: string; c: string[]; ink: string[] }
export function ridgeColors(p: Record<string, string>, mode: 'dark' | 'light'): RidgeColors {
  const c = [p.training, p.food, p.sleep];
  return { dk: mode !== 'light', bg: p.bg, text: p.text, muted: ink(p['text-muted'], p.bg, p.text, 4.5), c, ink: c.map(x => ink(x, p.bg, p.text, 4.5)) };
}

/* ---------- real values: what each pillar's value line is, so it can count between days ---------- */
export type Kind = 'min' | 'kcal' | 'kj' | 'sleep' | 'rest' | 'mask';
export function kindOf(arc: readonly Part[], rest: boolean): Kind {
  if (rest) return 'rest';
  if (arc.some(t => t[1] === 'v' && !/\d/.test(String(t[0])))) return 'mask';
  const u = arc.filter(t => t[1] === 'u').map(t => t[0]);
  return u.includes('kcal') ? 'kcal' : u.includes('kJ') ? 'kj' : u.includes('h') || u.includes('m') ? 'sleep' : 'min';
}
export function amountOf(arc: readonly Part[], rest: boolean) {
  const k = kindOf(arc, rest), v = arc.filter(t => t[1] === 'v').map(t => parseFloat(String(t[0]).replace(/,/g, '')) || 0);
  if (k === 'rest' || k === 'mask') return 0;
  if (k === 'sleep') return (v[0] || 0) * 60 + (v[1] || 0);
  return v[0] || 0;
}
const comma = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** The value line for an amount on its way to the day's real one. */
export function tokens(k: Kind, a: number): Part[] {
  a = Math.max(0, a);
  if (k === 'kcal') return [[comma(a), 'v', 0], ['kcal', 'u', 2.5]];
  if (k === 'kj') return [[comma(Math.round(a / 10) * 10), 'v', 0], ['kJ', 'u', 2.5]];
  if (k === 'sleep') { const m = Math.round(a), h = Math.floor(m / 60), mm = m % 60; return mm ? [[String(h), 'v', 0], ['h', 'u', 0.5], [(mm < 10 ? '0' : '') + mm, 'v', 3], ['m', 'u', 0.5]] : [[String(h), 'v', 0], ['h', 'u', 0.5]]; }
  return [[String(Math.round(a)), 'v', 0], ['min', 'u', 2.5]];
}

export interface RidgeState {
  v: number[]; met: number[]; rest: boolean[]; tok: Part[][]; of: string[]; label: string[]; pct: string; cap: string;
  /** Entrance reveal 0..1, text reveal 0..1 and each readout's focus (1 or 0.38). */
  r: number; ta: number; f: number[];
}
export function staticRidgeState(view: HeroView, ofWord: string, recovery: string): RidgeState {
  return {
    v: view.pillars.map(p => p.rest ? 0 : clamp(p.value, 0, 1.06)), met: view.pillars.map(p => p.met && !p.rest ? 1 : 0),
    rest: view.pillars.map(p => p.rest), tok: view.pillars.map(p => p.arc), of: view.pillars.map(p => p.rest ? (p.status || recovery) : p.goal ? ofWord + p.goal : ''),
    label: view.pillars.map(p => p.label), pct: String(view.pct), cap: view.caption, r: 1, ta: 1, f: [1, 1, 1],
  };
}

const DISP = 'PlusJakartaSans_700Bold', BODY5 = 'PlusJakartaSans_500Medium', BODY6 = 'PlusJakartaSans_600SemiBold';
function valueText(tok: Part[], x: number, y: number, anchor: string, fs: number, K: RidgeColors) {
  let s = `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">`;
  for (const t of tok) {
    const g = t[2] ? ` dx="${f(t[2] * fs / 22)}"` : '';
    s += t[1] === 'v' ? `<tspan${g} font-family="${DISP}" letter-spacing="${f(-0.01 * fs)}" font-size="${f(fs)}" fill="${K.text}">${esc(t[0])}</tspan>`
      : `<tspan${g} font-family="${BODY6}" font-size="${f(fs * 0.56)}" fill="${K.muted}">${esc(t[0])}</tspan>`;
  }
  return s + '</text>';
}
function bodyText(t: string, x: number, y: number, anchor: string, fs: number, fill: string, family: string, extra = '') {
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="${family}" font-size="${fs}" fill="${fill}"${extra}>${esc(t)}</text>`;
}
function readout(S: RidgeState, K: RidgeColors, i: number, x: number, y: number, fs: number) {
  return `<g opacity="${r2(S.ta * S.f[i])}" transform="translate(0 ${f((1 - S.ta) * 6)})">` +
    bodyText(S.label[i], x, y, 'middle', 12, K.ink[i], BODY6, ' letter-spacing="0.12"') +
    valueText(S.tok[i], x, y + fs + 4, 'middle', fs, K) +
    bodyText(S.of[i], x, y + fs + 22, 'middle', 12, K.muted, BODY5) + '</g>';
}
function score(S: RidgeState, K: RidgeColors, x: number, y: number, fs: number) {
  return `<g opacity="${r2(S.ta)}">` + bodyText(S.cap, x, y - fs * 0.94, 'middle', 13, K.muted, BODY6, ' letter-spacing="0.13"') +
    `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" font-family="${BODY5}" letter-spacing="${f(-0.035 * fs)}" font-size="${fs}" fill="${K.text}">${esc(S.pct)}</text></g>`;
}
function blur(id: string, sd: number, wide = false) {
  const a = wide ? '-150%' : '-20%', b = wide ? '400%' : '140%';
  return `<filter id="${id}" x="${a}" y="${wide ? a : '-60%'}" width="${b}" height="${wide ? b : '220%'}"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
}

/** Where each peak stands (x) and the band under it that a tap on its readout covers. */
export function ridgePeaks(W: number, H: number) {
  const yb = Math.round(H * 0.705);
  return { xs: [0.19, 0.5, 0.81].map(v => v * W), yb };
}

export function ridgeScene(W: number, H: number, S: RidgeState, K: RidgeColors, o: { uid: string; detail: 0 | 1 | 2; labels: boolean; glow: number }) {
  const u = o.uid, k = 1, dk = K.dk;
  let out = '';
  const yb = Math.round(H * 0.705), top = H * 0.405, hg = yb - top, sp = W * 0.082, xs = [0.19, 0.5, 0.81].map(v => v * W);
  const pk = (d: number) => Math.exp(-Math.pow(Math.abs(d), 1.42) * 1.15);
  const data = (x: number, sh = 0, wd = 1) => { let h = 0; for (let j = 0; j < 3; j++) h += S.v[j] * hg * pk((x - xs[j] - sh) / (sp * wd)); return h; };
  const front = (x: number) => { const h = data(x); return yb - 1.5 - h - h * 0.05 * wave(x / W * 30, 3, 3) - 2.4 * wave(x / W * 7, 1, 3); };
  const pts = (fn: (x: number) => number) => { const p: number[][] = []; for (let x = -4; x <= W + 4; x += 2) p.push([x, fn(x)]); return p; };
  const L = [3, 4, 7][o.detail], gl = o.glow * (dk ? 1 : 0.55);
  out += `<defs><linearGradient id="${u}h" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">` +
    `<stop offset="0" stop-color="${K.c[0]}"/><stop offset=".19" stop-color="${K.c[0]}"/><stop offset=".5" stop-color="${K.c[1]}"/><stop offset=".81" stop-color="${K.c[2]}"/><stop offset="1" stop-color="${K.c[2]}"/></linearGradient>` +
    `<linearGradient id="${u}v" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top - 6)}" x2="0" y2="${f(yb + 46)}"><stop offset="0" stop-color="#fff" stop-opacity="${dk ? 0.2 : 0.14}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="${u}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${u}v)"/></mask>` +
    blur(u + 'b', 4) + blur(u + 's', 3, true) + '</defs>';
  // Far ranges, back to front.
  for (let kk = L; kk >= 1; kk--) {
    const t = kk / L, base = yb - 7 - 60 * t, amp = 5 + 11 * t, ech = 0.32 * (1 - 0.55 * t), sh = (kk % 2 ? 1 : -1) * (8 + kk * 5);
    const d = poly(pts(x => base - amp * (0.5 + 0.5 * wave(x / W * (3.1 + kk * 0.45), 10 + kk, 4)) - ech * data(x, sh, 1.75)));
    const rr = c01(S.r * 1.5 - (L - kk) * 0.06), col = mix(K.muted, K.bg, (dk ? 0.38 : 0.5) + (dk ? 0.46 : 0.4) * t);
    out += `<path d="${d}L${W + 4} ${H}L-4 ${H}Z" fill="${K.bg}"/>`;
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f((0.75 + 0.25 * (1 - t)) * k)}" stroke-linejoin="round"${trim(rr)}/>`;
  }
  // The front ridge.
  const fd = poly(pts(front)), fr = c01(S.r * 1.25 - 0.08);
  out += `<path d="${fd}L${W + 4} ${H}L-4 ${H}Z" fill="${K.bg}"/>`;
  out += `<path d="${fd}L${W + 4} ${H}L-4 ${H}Z" fill="url(#${u}h)" mask="url(#${u}m)" opacity="${r2(fr)}"/>`;
  if (gl > 0.01) out += `<path d="${fd}" fill="none" stroke="url(#${u}h)" stroke-width="${2.5 * k}" opacity="${r2(gl * 0.55)}" filter="url(#${u}b)"${trim(fr)}/>`;
  out += `<path d="${fd}" fill="none" stroke="url(#${u}h)" stroke-width="${1.5 * k}" stroke-linejoin="round" stroke-linecap="round"${trim(fr)}/>`;
  // Goal ticks, plumb lines and summits.
  const gy = yb - hg;
  for (let i = 0; i < 3; i++) {
    if (S.rest[i]) continue;
    const px = xs[i], py = front(px), m = S.met[i], a = S.ta * S.f[i], c = K.c[i];
    out += `<g opacity="${r2(a)}">`;
    out += `<path d="M${f(px - 9)} ${f(gy)}H${f(px + 9)}" stroke="${mix(K.muted, c, m)}" stroke-opacity="${r2((0.75 + 0.25 * m))}" stroke-width="${k}" stroke-linecap="round"/>`;
    if (py - gy > 5 && m < 0.99) out += `<path d="M${f(px)} ${f(gy + 4)}V${f(py - 5)}" stroke="${c}" stroke-opacity="${r2(0.7 * (1 - m))}" stroke-width="${k}" stroke-dasharray="0.01 3.2" stroke-linecap="round"/>`;
    if (m > 0.01) {
      if (gl > 0.01) out += `<circle cx="${f(px)}" cy="${f(py)}" r="6" fill="${c}" opacity="${r2(gl * 0.7 * m)}" filter="url(#${u}s)"/>`;
      out += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(6.5 * m)}" fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="${0.75 * k}"/><circle cx="${f(px)}" cy="${f(py)}" r="${f(2.8 * m)}" fill="${c}"/>`;
    } else out += `<circle cx="${f(px)}" cy="${f(py)}" r="1.6" fill="${c}"/>`;
    out += '</g>';
  }
  if (o.labels) for (let i = 0; i < 3; i++) out += readout(S, K, i, xs[i], yb + 34, 22);
  return out + score(S, K, W / 2, 108, 62);
}
