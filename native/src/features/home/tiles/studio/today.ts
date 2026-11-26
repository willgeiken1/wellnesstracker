// @ts-nocheck -- generated tile drawing code: each style is a pure function from options and data to markup.
/* Home tiles: Insight Score, This week, Next and Next up. Each style draws the whole tile (frame, header and body) as markup that ./markup.tsx turns into
   native views and SVG. Materials come from ./depth (one light from above: raised fills, recessed tracks, neutral plates). */
export function install(window) {
  const INS = window.INS;

  const TS2 = window.TS2, DP = TS2.depth;
  let PI = Math.PI;
  let MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let PILLARS = [
    { k: 'training', n: 'Training', sh: 'circle' },
    { k: 'food', n: 'Food', sh: 'tri' },
    { k: 'recovery', n: 'Recovery', sh: 'dia' }
  ];

  /* ---------- small pure helpers ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fin(a) { let o = []; for (let i = 0; i < a.length; i++) if (typeof a[i] === 'number' && isFinite(a[i])) o.push(a[i]); return o; } /* days with no reading are left out */
  function mean(a) { a = fin(a); let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fh(ctx) { return ctx.type.fontHeading.replace(/"/g, "'"); }
  function fb(ctx) { return ctx.type.fontBody.replace(/"/g, "'"); }
  function num(ctx, size, color) { return 'font-family:' + fh(ctx) + ';font-weight:700;font-size:' + size + 'px;letter-spacing:' + (size >= 28 ? '-0.035em' : size >= 18 ? '-0.018em' : '0') + ';font-variant-numeric:tabular-nums;color:' + color + ';'; }
  function lab(ctx, size, color, weight) { return 'font-family:' + fb(ctx) + ';font-weight:' + (weight || 500) + ';font-size:' + size + 'px;color:' + color + ';'; }
  function box(x, y, w, h, style, inner) { return '<div style="position:absolute;left:' + r2(x) + 'px;top:' + r2(y) + 'px;width:' + r2(w) + 'px;height:' + r2(h) + 'px;box-sizing:border-box;' + (style || '') + '">' + (inner || '') + '</div>'; }
  /* single-line text block; never wraps, never overflows its width */
  function line(x, y, w, style, html, align) { return '<div style="position:absolute;left:' + r2(x) + 'px;top:' + r2(y) + 'px;width:' + r2(w) + 'px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (align ? 'text-align:' + align + ';' : '') + style + '">' + html + '</div>'; }
  function span(style, html) { return '<span style="' + style + '">' + html + '</span>'; }
  function svg(x, y, w, h, inner) { return '<svg style="position:absolute;left:' + r2(x) + 'px;top:' + r2(y) + 'px;display:block;overflow:visible" width="' + r2(w) + '" height="' + r2(h) + '" viewBox="0 0 ' + r2(w) + ' ' + r2(h) + '" aria-hidden="true">' + inner + '</svg>'; }
  function stext(ctx, x, y, str, size, fill, anchor, heading, weight) { return '<text x="' + r2(x) + '" y="' + r2(y) + '" font-size="' + size + '" fill="' + fill + '" text-anchor="' + (anchor || 'start') + '" font-family="' + (heading ? fh(ctx) : fb(ctx)) + '" font-weight="' + (weight || (heading ? (size <= 12 ? 600 : 700) : 500)) + '"' + (heading ? ' style="font-variant-numeric:tabular-nums"' : '') + '>' + esc(str) + '</text>'; }

  /* pillar shape inside an svg: training circle, food triangle, recovery diamond */
  function shape(sh, cx, cy, r, attrs) {
    if (sh === 'tri') return '<path d="M' + r2(cx) + ' ' + r2(cy - r) + 'L' + r2(cx + r * 0.95) + ' ' + r2(cy + r * 0.8) + 'L' + r2(cx - r * 0.95) + ' ' + r2(cy + r * 0.8) + 'Z" stroke-linejoin="round" ' + attrs + '/>';
    if (sh === 'dia') return '<path d="M' + r2(cx) + ' ' + r2(cy - r) + 'L' + r2(cx + r) + ' ' + r2(cy) + 'L' + r2(cx) + ' ' + r2(cy + r) + 'L' + r2(cx - r) + ' ' + r2(cy) + 'Z" stroke-linejoin="round" ' + attrs + '/>';
    return '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r * 0.9) + '" ' + attrs + '/>';
  }
  function marker(sh, x, y, color) { return svg(x, y, 10, 10, shape(sh, 5, 5, 4.5, 'fill="' + color + '"')); }
  function markerInline(sh, color) { return '<svg width="10" height="10" viewBox="0 0 10 10" style="display:inline-block;vertical-align:-1px;margin-right:5px" aria-hidden="true">' + shape(sh, 5, 5, 4.5, 'fill="' + color + '"') + '</svg>'; }

  /* ---------- radial helpers (degrees clockwise from 12 o'clock) ---------- */
  function polar(cx, cy, r, deg) { let a = (deg - 90) * PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arcD(cx, cy, r, d0, d1) {
    if (d1 - d0 >= 359.9) d1 = d0 + 359.9;
    let a = polar(cx, cy, r, d0), b = polar(cx, cy, r, d1);
    return 'M' + r2(a[0]) + ' ' + r2(a[1]) + 'A' + r2(r) + ' ' + r2(r) + ' 0 ' + (d1 - d0 > 180 ? 1 : 0) + ' 1 ' + r2(b[0]) + ' ' + r2(b[1]);
  }
  function wedge(cx, cy, r0, r1, a0, a1) {
    let p0 = polar(cx, cy, r1, a0), p1 = polar(cx, cy, r1, a1), q1 = polar(cx, cy, r0, a1), q0 = polar(cx, cy, r0, a0), lg = a1 - a0 > 180 ? 1 : 0;
    return 'M' + r2(p0[0]) + ' ' + r2(p0[1]) + 'A' + r2(r1) + ' ' + r2(r1) + ' 0 ' + lg + ' 1 ' + r2(p1[0]) + ' ' + r2(p1[1]) +
      'L' + r2(q1[0]) + ' ' + r2(q1[1]) + 'A' + r2(r0) + ' ' + r2(r0) + ' 0 ' + lg + ' 0 ' + r2(q0[0]) + ' ' + r2(q0[1]) + 'Z';
  }

  /* ---------- materials (TS2.depth) ----------
     One defs block per tile (hidden 0x0 svg at the root), shared by every svg in the tile: filters #uid-lift, #uid-sink, #uid-glow
     and a top-lit gradient #uid-g-<i> for each palette colour. The filters run in user space so thin strokes and small marks keep
     their shadow (a bounding-box filter region would clip them). */
  function isDark(ctx) { return ctx.theme !== 'light'; }
  function uidOf(ctx) { return 'tt' + String(ctx.uid || '0').replace(/[^A-Za-z0-9_-]/g, ''); }
  function palette(ctx) {
    let T = ctx.T, dk = isDark(ctx);
    return [T.accent, T.training, T.food, T.recovery, T.success,
      dk ? '#E6E7F3' : '#FFFFFF', /* 5 knob: the thumb on a track */
      dk ? DP.mix(T.surface, '#FFFFFF', 0.2) : '#FFFFFF', /* 6 neutral raised piece */
      DP.mix(T.accent, T.surface, dk ? 0.3 : 0.5), /* 7 accent, quieter */
      DP.mix(T.accent, T.surface, dk ? 0.62 : 0.7)]; /* 8 accent, quietest: the resting tone beside one bright mark */
  }
  function KNOB(ctx) { return palette(ctx)[5]; }
  function NEUTRAL(ctx) { return palette(ctx)[6]; }
  function SOFT(ctx) { return palette(ctx)[7]; }
  function QUIET(ctx) { return palette(ctx)[8]; }
  function defsSvg(ctx) {
    let d = DP.defs(ctx.T, uidOf(ctx), palette(ctx)).replace(/<filter id="([^"]+)"[^>]*>/g, '<filter id="$1" filterUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="520">');
    return '<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">' + d + '</svg>';
  }
  function grad(ctx, col) { let i = palette(ctx).indexOf(col); return i < 0 ? col : 'url(#' + uidOf(ctx) + '-g-' + i + ')'; }
  function flt(ctx, name) { return ' filter="url(#' + uidOf(ctx) + '-' + name + ')"'; }
  /* the colour of a recessed track; the sink filter adds its top inner shadow */
  function wellC(ctx) { let T = ctx.T; return isDark(ctx) ? DP.mix(T.surface, '#000000', 0.24) : DP.mix(T.bg, '#161728', 0.07); }
  function sTrack(ctx, d, sw, cap) { return '<path d="' + d + '" fill="none" stroke="' + wellC(ctx) + '" stroke-width="' + r2(sw) + '" stroke-linecap="' + (cap || 'round') + '"' + flt(ctx, 'sink') + '/>'; }
  function sArc(ctx, d, sw, col, cap) { return '<path d="' + d + '" fill="none" stroke="' + grad(ctx, col) + '" stroke-width="' + r2(sw) + '" stroke-linecap="' + (cap || 'round') + '"' + flt(ctx, 'lift') + '/>'; }
  function sRingTrack(ctx, cx, cy, r, sw) { return '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '" fill="none" stroke="' + wellC(ctx) + '" stroke-width="' + r2(sw) + '"' + flt(ctx, 'sink') + '/>'; }
  /* a small soft halo behind the end cap of a single hero arc */
  function capGlow(ctx, x, y, r, col) { return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + col + '" opacity="' + (isDark(ctx) ? 0.55 : 0.35) + '"' + flt(ctx, 'glow') + '/>'; }
  /* a raised thumb on a track */
  function knob(ctx, x, y, r, col) {
    let c = col || KNOB(ctx);
    return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + grad(ctx, c) + '"' + flt(ctx, 'lift') + '/>' +
      (!isDark(ctx) && c === KNOB(ctx) ? '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r - 0.4) + '" fill="none" stroke="rgba(22,23,40,.12)" stroke-width="0.8"/>' : '');
  }
  /* HTML: a recessed bar with a raised fill */
  function wellBar(ctx, x, y, w, h, frac, col) {
    let f = clamp(frac, 0, 1), fw = f > 0 ? Math.max(h, w * f) : 0;
    return box(x, y, w, h, DP.well(ctx.T, h / 2), fw ? box(0, 0, fw, h, DP.raised(col, ctx.T, h / 2)) : '');
  }
  /* HTML: a row of recessed slots, the first `done` raised, the next one ringed */
  function slots(ctx, x, y, w, h, done, total, col, gap) {
    let out = '', g = gap == null ? 3 : gap, sw = (w - g * (total - 1)) / total, rr = Math.min(h / 2, 4);
    for (let i = 0; i < total; i++) {
      let sx = x + i * (sw + g);
      out += i < done ? box(sx, y, sw, h, DP.raised(col, ctx.T, rr))
        : box(sx, y, sw, h, DP.well(ctx.T, rr) + (i === done ? 'border:1.5px solid ' + DP.rgba(col, 0.85) + ';' : ''));
    }
    return out;
  }

  /* ---------- shared tile chrome ---------- */
  function header(ctx, icon, color, title, meta) {
    return '<div style="position:absolute;left:16px;top:16px;right:16px;height:20px;display:flex;align-items:center;gap:6px">' +
      ctx.icon(icon, 18, color) +
      '<span style="' + lab(ctx, 14, ctx.T.text, 600) + 'line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">' + esc(title) + '</span>' +
      (meta ? '<span style="' + lab(ctx, 13, ctx.T.muted, 500) + 'line-height:20px;margin-left:auto;white-space:nowrap;flex:none;padding-left:2px">' + meta + '</span>' : '') +
      '</div>';
  }
  function tile(ctx, cls, aria, head, body) {
    let f = ctx.frame;
    return '<div class="' + cls + '" role="group" aria-label="' + esc(aria) + '" style="position:relative;box-sizing:border-box;width:' + f.w + 'px;height:' + f.h + 'px;border-radius:20px;overflow:hidden;' + DP.tile(ctx.T) + '">' +
      defsSvg(ctx) + head + '<div style="position:absolute;left:16px;top:42px;width:' + (f.w - 32) + 'px;height:' + (f.h - 58) + 'px">' + body + '</div></div>';
  }
  /* button: filled (raised, primary), tinted (plate, coloured label), quiet (plate, e.g. Undo) */
  function button(ctx, x, y, w, h, label, o) {
    let T = ctx.T, col = o.col || T.accent, st = o.style || 'filled';
    let fg = st === 'filled' ? T.onAccent : st === 'tinted' ? col : T.text;
    let bg = st === 'filled' ? DP.raised(col, T, 14) : DP.plate(T, 14);
    let left = '<span style="display:flex;align-items:center;gap:6px">' + (o.icon ? ctx.icon(o.icon, 18, fg) : '') + '<span style="' + lab(ctx, 15, fg, 700) + 'line-height:1.2;white-space:nowrap">' + esc(label) + '</span></span>';
    let right = o.trail ? '<span style="' + lab(ctx, 13, fg, 600) + 'opacity:.75;line-height:1.2;white-space:nowrap">' + esc(o.trail) + '</span>' : '';
    return box(x, y, w, h, bg + 'display:flex;align-items:center;justify-content:' + (o.trail ? 'space-between;padding:0 16px' : 'center') + ';" role="button" aria-label="' + esc(o.aria || label), left + right);
  }
  /* rows: marker, label, recessed bar with a raised fill, value */
  function pillarBars(ctx, x, y, w, rowH, list, o) {
    let T = ctx.T, out = '', lw = o.labelW || 64, vw = o.valueW || 26, bh = o.bh || 6;
    let tx = x + 16 + lw + 4, tw = w - 16 - lw - 4 - 12 - vw;
    list.forEach(function (p, i) {
      let cy = y + i * rowH + rowH / 2;
      out += marker(p.sh, x, cy - 5, T[p.k]);
      out += line(x + 16, cy - 8, lw, lab(ctx, 13, T.text, 500), p.n);
      out += wellBar(ctx, tx, cy - bh / 2, tw, bh, p.v / 100, T[p.k]);
      out += line(x + w - vw, cy - 9, vw, num(ctx, 15, T.text), p.v, 'right');
    });
    return out;
  }
  /* rows: marker, label, value at the right edge */
  function pillarList(ctx, x, y, w, step, list, valueOf, big) {
    let T = ctx.T, out = '';
    list.forEach(function (p, i) {
      let yy = y + i * step;
      out += marker(p.sh, x, yy + 4, T[p.k]) + line(x + 16, yy, w - 60, lab(ctx, 13, T.text, 500), p.n);
      out += line(x + w - 44, yy - (big ? 2 : 1), 44, num(ctx, big ? 17 : 15, T.text), valueOf(p), 'right');
    });
    return out;
  }
  /* three facts side by side on one plate */
  function statPlate(ctx, x, y, w, h, stats) {
    let T = ctx.T, cw = w / stats.length, inner = '';
    stats.forEach(function (st, i) {
      inner += line(14 + i * cw, h / 2 - 17, cw - 18, lab(ctx, 11, T.muted, 500), st[0]);
      inner += line(14 + i * cw, h / 2 - 1, cw - 18, num(ctx, 17, T.text), st[1]);
    });
    return box(x, y, w, h, DP.plate(T, 14), inner);
  }
  function fmtDelta(d) { return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; }
  /* units follow Settings (INS.prefs): energy in kcal or kJ and the clock in 12 or 24 hours. Data stays in kcal and "h:mm AM". */
  function PF() { return window.INS && INS.prefs; }
  function ek(kcal) { let p = PF(); return p ? p.enParts(kcal).n : comma(kcal); }
  function eu() { let p = PF(); return p ? p.enU() : 'kcal'; }
  function h24() { let p = PF(); return !!p && p.get('units.clock') === '24'; }
  function clkS(t) { let p = PF(); return t && p ? p.clkStr(t) : t; }
  function clkT(s) { let p = PF(); return p ? p.clkText(s) : s; }
  function hh24(h) { return ('0' + (((h % 24) + 24) % 24)).slice(-2) + ':00'; }
  function fmtTime(h) { let hh = Math.floor(h + 1e-6), m = Math.round((h - hh) * 60); if (h24()) return PF().clk(hh, m); let ap = hh % 24 >= 12 ? 'PM' : 'AM', h12 = hh % 12 === 0 ? 12 : hh % 12; return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; }
  function parseTime(s) { let m = /(\d+):(\d+)\s*(AM|PM)/.exec(s); if (!m) return 0; let h = (+m[1]) % 12 + (m[3] === 'PM' ? 12 : 0); return h + (+m[2]) / 60; }
  function nowHours(D) { return D.now.getHours() + D.now.getMinutes() / 60; }
  function deltaLine(ctx, x, y, w, d, words, big, align) {
    return line(x, y, w, '', span(num(ctx, big, ctx.T.text), fmtDelta(d)) + span(lab(ctx, big >= 15 ? 13 : 11, ctx.T.muted, 500), ' ' + words), align);
  }

  /* 270 degree gauge: recessed track, raised top-lit arc with a soft halo at its end cap, optional mark; or lit segments */
  let A0 = -135, SWEEP = 270;
  function gauge(ctx, cx, cy, r, sw, frac, col, o) {
    o = o || {};
    let g = '';
    if (o.segments) {
      let n = o.segments, gapDeg = o.gapDeg || 3, each = (SWEEP - gapDeg * (n - 1)) / n, tr = '', lit = '';
      for (let i = 0; i < n; i++) {
        let s0 = A0 + i * (each + gapDeg), d = arcD(cx, cy, r, s0, s0 + each);
        if (i < o.done) lit += '<path d="' + d + '" fill="none" stroke="' + grad(ctx, col) + '" stroke-width="' + sw + '"/>';
        else tr += '<path d="' + d + '" fill="none" stroke="' + (i === o.done ? DP.mix(col, wellC(ctx), 0.55) : wellC(ctx)) + '" stroke-width="' + sw + '"/>';
      }
      return '<g' + flt(ctx, 'sink') + '>' + tr + '</g><g' + flt(ctx, 'lift') + '>' + lit + '</g>';
    }
    g += sTrack(ctx, arcD(cx, cy, r, A0, A0 + SWEEP), sw);
    let f = clamp(frac, 0, 1);
    if (f > 0.003) {
      let end = A0 + SWEEP * f, ep = polar(cx, cy, r, end);
      g += capGlow(ctx, ep[0], ep[1], sw * 0.7, col);
      g += sArc(ctx, arcD(cx, cy, r, A0, end), sw, col);
    }
    if (o.mark != null) {
      let md = A0 + SWEEP * clamp(o.mark, 0, 1), m0 = polar(cx, cy, r - sw / 2 - 2.5, md), m1 = polar(cx, cy, r + sw / 2 + 2.5, md);
      g += '<line x1="' + r2(m0[0]) + '" y1="' + r2(m0[1]) + '" x2="' + r2(m1[0]) + '" y2="' + r2(m1[1]) + '" stroke="' + ctx.T.text + '" stroke-opacity="0.9" stroke-width="2" stroke-linecap="round"' + flt(ctx, 'lift') + '/>';
    }
    return g;
  }
  /* concentric rings, outermost first: items [{v:0..1, col}] */
  function ringSet(ctx, cx, cy, R, sw, gap, items) {
    let g = '';
    items.forEach(function (it, i) {
      let r = R - sw / 2 - i * (sw + gap), v = clamp(it.v, 0, 1);
      g += sRingTrack(ctx, cx, cy, r, sw);
      if (v > 0.005) g += sArc(ctx, arcD(cx, cy, r, 0, 360 * v), sw, it.col);
    });
    return g;
  }

  /* =====================================================================
     1. INSIGHT SCORE (shown as a bare number; the scale stays internal)
     ===================================================================== */
  function scoreInfo(D) {
    let s = D.score.series, p = D.score.pillars;
    /* v is what a pillar shows (a dash when it has no reading, never a 0); vv is its fill */
    let list = PILLARS.map(function (q) { let x = p[q.k], ok = typeof x === 'number' && isFinite(x); return { k: q.k, n: q.n, sh: q.sh, v: ok ? x : '\u2013', vv: ok ? x : 0, ok: ok }; });
    /* each pillar is a third of the score: contributions rounded so they add up to today's score */
    let raw = list.map(function (q) { return q.vv / 3; }), fl = raw.map(Math.floor);
    let rest = D.score.today - fl.reduce(function (a, b) { return a + b; }, 0);
    let idx = raw.map(function (v, i) { return i; }).sort(function (a, b) { return (raw[b] - fl[b]) - (raw[a] - fl[a]); });
    for (let i = 0; i < idx.length && rest > 0; i++, rest--) fl[idx[i]]++;
    list.forEach(function (q, j) { q.c = fl[j]; });
    let low = list.filter(function (q) { return q.ok; }).sort(function (a, b) { return a.vv - b.vv; })[0] || list[0];
    return { today: D.score.today, yesterday: D.score.yesterday, avg7: Math.round(mean(s.slice(-7))), avg30: Math.round(mean(s)), list: list, low: low };
  }
  function scoreAria(si) { return 'Insight Score ' + si.today + ', ' + (si.today >= si.yesterday ? 'up ' : 'down ') + Math.abs(si.today - si.yesterday) + ' from yesterday. Training ' + si.list[0].v + ', food ' + si.list[1].v + ', recovery ' + si.list[2].v + '.'; }
  let SIZE3 = { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] };

  let scoreA = {
    key: 'A', name: 'Dial',

    options: [
      SIZE3,
      { id: 'compare', label: 'Mark', choices: [['yesterday', 'Yesterday'], ['avg', '30-day average']] },
      { id: 'show', label: 'Shows', choices: [['pillars', 'Pillars'], ['readouts', 'Readouts']] }
    ],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, si = scoreInfo(D), sz = o.size, bw = ctx.frame.w - 32;
      let isAvg = o.compare === 'avg', cmp = isAvg ? si.avg30 : si.yesterday, d = si.today - cmp;
      let words = isAvg ? 'vs 30-day average' : 'vs yesterday', h = '';
      let readouts = [['Yesterday', si.yesterday], ['7-day avg', si.avg7], ['30-day avg', si.avg30]];
      if (sz === 'S') {
        h += svg(0, 0, bw, 90, gauge(ctx, bw / 2, 47, 39, 8, si.today / 100, T.accent, { mark: cmp / 100 }));
        h += line(0, 30, bw, num(ctx, 28, T.text), si.today, 'center');
        h += deltaLine(ctx, 0, 96, bw, d, isAvg ? 'vs 30-day avg' : 'vs yesterday', 13, 'center');
      } else if (sz === 'M') {
        h += svg(0, 0, 118, 118, gauge(ctx, 58, 58, 47, 9, si.today / 100, T.accent, { mark: cmp / 100 }));
        h += line(8, 41, 100, num(ctx, 28, T.text), si.today, 'center');
        h += deltaLine(ctx, 138, 2, bw - 138, d, words, 17);
        if (o.show === 'readouts') readouts.forEach(function (r, i) {
          let y = 42 + i * 26;
          h += line(138, y, 120, lab(ctx, 13, T.muted, 500), r[0]) + line(bw - 40, y - 1, 40, num(ctx, 15, T.text), r[1], 'right');
        });
        else h += pillarBars(ctx, 138, 34, bw - 138, 28, si.list, {});
      } else {
        h += svg(0, 0, bw, 160, gauge(ctx, bw / 2, 86, 76, 13, si.today / 100, T.accent, { mark: cmp / 100 }));
        h += line(0, 62, bw, num(ctx, 40, T.text), si.today, 'center');
        h += deltaLine(ctx, 0, 158, bw, d, words, 15, 'center');
        if (o.show === 'readouts') h += statPlate(ctx, 0, 198, bw, 60, readouts);
        else si.list.forEach(function (p, i) {
          let cw = (bw - 24) / 3, x = i * (cw + 12);
          h += line(x, 200, cw, lab(ctx, 11, T.muted, 500), markerInline(p.sh, T[p.k]) + p.n);
          h += line(x, 217, cw, num(ctx, 22, T.text), p.v);
          h += wellBar(ctx, x, 250, cw, 6, p.vv / 100, T[p.k]);
        });
      }
      return tile(ctx, 'ts2-score-A', scoreAria(si), header(ctx, 'score', T.accent, 'Insight Score', sz === 'S' ? '' : 'Today'), h);
    }
  };

  let scoreB = {
    key: 'B', name: 'Rings',

    options: [
      SIZE3,
      { id: 'center', label: 'Centre', choices: [['score', 'Score'], ['change', 'Change vs yesterday']] }
    ],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, si = scoreInfo(D), sz = o.size, bw = ctx.frame.w - 32, d = si.today - si.yesterday, h = '';
      let items = si.list.map(function (p) { return { v: p.vv / 100, col: T[p.k] }; }), chg = o.center === 'change';
      let top = chg ? fmtDelta(d) : String(si.today);
      if (sz === 'S') {
        h += svg(0, 0, bw, 118, ringSet(ctx, bw / 2, 58, 56, 9, 3, items));
        h += line(0, 44, bw, num(ctx, 24, T.text), top, 'center');
      } else if (sz === 'M') {
        h += svg(0, 0, 120, 118, ringSet(ctx, 59, 59, 59, 10, 3, items));
        h += line(9, 42, 100, num(ctx, 28, T.text), top, 'center');
        h += chg ? line(140, 2, bw - 140, '', span(num(ctx, 17, T.text), si.today) + span(lab(ctx, 13, T.muted, 500), ' today'))
          : deltaLine(ctx, 140, 2, bw - 140, d, 'vs yesterday', 17);
        h += pillarList(ctx, 140, 44, bw - 140, 26, si.list, function (p) { return p.v; }, false);
      } else {
        h += svg(0, 0, bw, 180, ringSet(ctx, bw / 2, 90, 89, 15, 4, items));
        h += line(0, 66, bw, num(ctx, 40, T.text), top, 'center');
        h += chg ? line(0, 190, bw, lab(ctx, 13, T.muted, 500), span(num(ctx, 15, T.text), si.today) + ' today · ' + si.low.n + ' is lowest', 'center')
          : deltaLine(ctx, 0, 190, bw, d, 'vs yesterday · ' + si.low.n + ' is lowest', 15, 'center');
        si.list.forEach(function (p, i) {
          let x = i * (bw / 3);
          h += line(x, 222, bw / 3, lab(ctx, 11, T.muted, 500), markerInline(p.sh, T[p.k]) + p.n, 'center');
          h += line(x, 238, bw / 3, num(ctx, 17, T.text), p.v, 'center');
        });
      }
      return tile(ctx, 'ts2-score-B', scoreAria(si) + ' ' + si.low.n + ' is the lowest pillar.', header(ctx, 'score', T.accent, 'Insight Score', sz === 'S' ? (chg ? String(si.today) : fmtDelta(d)) : 'Today'), h);
    }
  };

  /* Each day is a recessed slot with a raised bead at that day's score: beads above your average are lit, the rest are neutral.
     The dashed hairline is the average. Reads like a row of sliders. */
  function beads(ctx, x, y, w, h, n, o) {
    let T = ctx.T, D = ctx.data, s = D.score.series.slice(-n), avg = mean(s);
    let lo = Math.min.apply(null, fin(s)) - 3, hi = Math.max.apply(null, fin(s)) + 3, pr = o.label ? 26 : 0, pw = w - pr, step = pw / n;
    let ww = clamp(step * 0.4, 3, 7), rb = clamp(step * 0.34, 2.4, 5), top = y + rb + 1, bot = y + h - rb - 1;
    function Y(v) { return bot - (v - lo) / (hi - lo) * (bot - top); }
    let wells = '', bs = '', g = '';
    s.forEach(function (v, i) {
      let cx = x + step * (i + 0.5), last = i === s.length - 1;
      wells += '<rect x="' + r2(cx - ww / 2) + '" y="' + r2(y) + '" width="' + r2(ww) + '" height="' + r2(h) + '" rx="' + r2(ww / 2) + '" fill="' + wellC(ctx) + '"/>';
      if (v != null) bs += '<circle cx="' + r2(cx) + '" cy="' + r2(Y(v)) + '" r="' + r2(last ? rb + 1.4 : rb) + '" fill="' + grad(ctx, v >= avg || last ? T.accent : NEUTRAL(ctx)) + '"/>';
    });
    g += '<g' + flt(ctx, 'sink') + '>' + wells + '</g>';
    g += '<line x1="' + r2(x) + '" y1="' + r2(Y(avg)) + '" x2="' + r2(x + pw) + '" y2="' + r2(Y(avg)) + '" stroke="' + T.muted + '" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="2 3"/>';
    g += '<g' + flt(ctx, 'lift') + '>' + bs + '</g>';
    if (o.label) g += stext(ctx, x + w, Y(avg) + 4, Math.round(avg), 11, T.muted, 'end', true);
    return g;
  }
  let scoreC = {
    key: 'C', name: 'Trend',

    options: [
      SIZE3,
      { id: 'range', label: 'Range', choices: [['14', '14 days'], ['7', '7 days'], ['30', '30 days']] }
    ],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, si = scoreInfo(D), bw = ctx.frame.w - 32, n = +o.range || 14, sz = o.size;
      if (sz === 'S') n = Math.min(n, 14);
      let s = D.score.series.slice(-n), avg = Math.round(mean(s)), d = si.today - avg, days = D.days.slice(-n), h = '';
      let above = s.filter(function (v) { return v != null && v >= mean(s); }).length;
      if (sz === 'S') {
        h += line(0, 0, bw, num(ctx, 28, T.text), si.today);
        h += deltaLine(ctx, 0, 36, bw, d, 'vs ' + n + '-day avg', 11);
        h += svg(0, 60, bw, 58, beads(ctx, 0, 0, bw, 58, n, {}));
      } else if (sz === 'M') {
        h += line(0, 18, 110, num(ctx, 28, T.text), si.today);
        h += line(0, 58, 110, num(ctx, 15, T.text), fmtDelta(d));
        h += line(0, 78, 110, lab(ctx, 11, T.muted, 500), 'vs ' + n + '-day average');
        h += svg(122, 2, bw - 122, 114, beads(ctx, 0, 0, bw - 122, 114, n, { label: true }));
      } else {
        h += line(0, 0, 150, num(ctx, 40, T.text), si.today);
        h += deltaLine(ctx, bw - 190, 4, 190, d, 'vs ' + n + '-day average', 15, 'right');
        h += line(bw - 190, 26, 190, lab(ctx, 13, T.muted, 500), above + ' of ' + n + ' days above it', 'right');
        h += svg(0, 68, bw, 164, beads(ctx, 0, 0, bw, 164, n, { label: true }));
        h += line(0, 244, 120, lab(ctx, 11, T.muted, 500), MONTHS[days[0].getMonth()] + ' ' + days[0].getDate());
        h += line(bw - 146, 244, 120, lab(ctx, 11, T.muted, 500), 'Today', 'right');
      }
      return tile(ctx, 'ts2-score-C', 'Insight Score ' + si.today + ', ' + (d >= 0 ? d + ' above' : Math.abs(d) + ' below') + ' your ' + n + '-day average of ' + avg + '. ' + above + ' of ' + n + ' days were at or above average.', header(ctx, 'score', T.accent, 'Insight Score', sz === 'S' ? '' : n + ' days'), h);
    }
  };

  /* Three axes from the centre, one per pillar: Training at the top, Food lower right, Recovery lower left. The recessed triangle
     is a perfect day on every axis; the raised triangle reaches each pillar's score today, so a lopsided shape shows at once which
     pillar is holding the day back. Axes run from 40 at the centre to 100 at the corner so real differences read as shape.
     Corners are rounded so it reads as one soft shape, not a chart. */
  let AX0 = 40;
  function axisF(v) { return clamp((v - AX0) / (100 - AX0), 0.06, 1); }
  function roundTri(pts, rr) {
    let d = '';
    for (let i = 0; i < 3; i++) {
      let p = pts[(i + 2) % 3], c = pts[i], n = pts[(i + 1) % 3];
      let lp = Math.hypot(p[0] - c[0], p[1] - c[1]), ln = Math.hypot(n[0] - c[0], n[1] - c[1]);
      let tp = Math.min(0.45, rr / lp), tn = Math.min(0.45, rr / ln);
      let a = [c[0] + (p[0] - c[0]) * tp, c[1] + (p[1] - c[1]) * tp], b = [c[0] + (n[0] - c[0]) * tn, c[1] + (n[1] - c[1]) * tn];
      d += (i ? 'L' : 'M') + r2(a[0]) + ' ' + r2(a[1]) + 'Q' + r2(c[0]) + ' ' + r2(c[1]) + ' ' + r2(b[0]) + ' ' + r2(b[1]);
    }
    return d + 'Z';
  }
  let TRI = [0, 120, 240];
  function balance(ctx, si, cx, cy, R, o) {
    let T = ctx.T, g = '', dk = isDark(ctx), rr = R * 0.16;
    function pts(fs) { return fs.map(function (f, k) { return polar(cx, cy, R * f, TRI[k]); }); }
    g += '<path d="' + roundTri(pts([1, 1, 1]), rr) + '" fill="' + wellC(ctx) + '"' + flt(ctx, 'sink') + '/>';
    let spoke = DP.mix(wellC(ctx), T.muted, dk ? 0.18 : 0.22);
    TRI.forEach(function (a) { let e = polar(cx, cy, R - rr * 0.9, a); g += '<line x1="' + r2(cx) + '" y1="' + r2(cy) + '" x2="' + r2(e[0]) + '" y2="' + r2(e[1]) + '" stroke="' + spoke + '" stroke-width="1"/>'; });
    if (o.ghost) g += '<path d="' + roundTri(pts(o.ghost), rr * 0.6) + '" fill="none" stroke="' + T.muted + '" stroke-opacity="0.8" stroke-width="1.25" stroke-dasharray="3 3"/>';
    let vs = si.list.map(function (p) { return axisF(p.vv); }), sp = pts(vs);
    g += '<path d="' + roundTri(sp, rr * 0.7) + '" fill="' + grad(ctx, SOFT(ctx)) + '" fill-opacity="' + (dk ? 0.92 : 0.85) + '" stroke="' + T.accent + '" stroke-width="' + (R > 70 ? 2 : 1.5) + '" stroke-linejoin="round"' + flt(ctx, 'lift') + '/>';
    si.list.forEach(function (p, k) { g += knob(ctx, sp[k][0], sp[k][1], o.kr || 4, T[p.k]); });
    return g;
  }
  let scoreD = {
    key: 'D', name: 'Balance',

    options: [
      SIZE3,
      { id: 'ghost', label: 'Yesterday', choices: [['off', 'Hidden'], ['on', 'Dashed outline']] }
    ],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, si = scoreInfo(D), sz = o.size, bw = ctx.frame.w - 32, d = si.today - si.yesterday, h = '';
      let yd = D.week[D.week.length - 2], gh = o.ghost === 'on' && yd ? PILLARS.map(function (p) { return axisF(yd[p.k] * 100); }) : null;
      if (sz === 'S') {
        let Rs = 46, cys = 4 + Rs;
        h += svg(0, 0, bw, 76, balance(ctx, si, bw / 2, cys, Rs, { ghost: gh, kr: 3.6 }));
        h += line(0, 80, 70, num(ctx, 28, T.text), si.today);
        h += line(64, 82, bw - 64, num(ctx, 15, T.text), fmtDelta(d), 'right');
        h += line(64, 101, bw - 64, lab(ctx, 11, T.muted, 500), 'vs yesterday', 'right');
      } else if (sz === 'M') {
        let Rm = 62, cym = 59 + Rm / 4;
        h += svg(0, 0, 120, 118, balance(ctx, si, 59, cym, Rm, { ghost: gh, kr: 4.2 }));
        h += line(140, 0, 90, num(ctx, 28, T.text), si.today);
        h += deltaLine(ctx, bw - 130, 9, 130, d, 'vs yesterday', 15, 'right');
        h += pillarList(ctx, 140, 48, bw - 140, 24, si.list, function (p) { return p.v; }, false);
      } else {
        let R = 110, cx = bw / 2, cy = 76 + R;
        h += line(0, 0, 120, num(ctx, 40, T.text), si.today);
        h += deltaLine(ctx, bw - 200, 4, 200, d, 'vs yesterday', 15, 'right');
        h += line(bw - 200, 26, 200, lab(ctx, 13, T.muted, 500), si.low.n + ' is lowest', 'right');
        h += svg(0, 0, bw, 262, balance(ctx, si, cx, cy, R, { ghost: gh, kr: 5.5 }));
        let apex = polar(cx, cy, R, 0), br = polar(cx, cy, R, 120), bl = polar(cx, cy, R, 240);
        function tag(p, x, y, al) {
          return line(x, y, 110, lab(ctx, 11, T.muted, 500), markerInline(p.sh, T[p.k]) + p.n, al) + line(x, y + 16, 110, num(ctx, 22, T.text), p.v, al);
        }
        h += tag(si.list[0], apex[0] + 18, apex[1] - 4, 'left');
        h += tag(si.list[1], br[0] + 14, br[1] - 38, 'left');
        h += tag(si.list[2], bl[0] - 124, bl[1] - 38, 'right');
      }
      return tile(ctx, 'ts2-score-D', scoreAria(si) + ' ' + si.low.n + ' is the lowest pillar.', header(ctx, 'score', T.accent, 'Insight Score', sz === 'S' ? '' : 'Today'), h);
    }
  };

  TS2.tiles.push({
    id: 'score', title: 'Insight Score', group: 'Today',

    versions: [scoreA, scoreB, scoreC, scoreD]
  });

  /* =====================================================================
     2. THIS WEEK
     ===================================================================== */
  function weekInfo(D) {
    let wk = D.week, out = { days: wk, avg: {}, avgV: {}, has: {}, trainDays: 0, todayIdx: wk.length - 1 };
    /* a pillar with no reading all week shows a dash, never a 0 */
    PILLARS.forEach(function (p) {
      let v = wk.map(function (d) { return d[p.k]; });
      out.has[p.k] = fin(v).length > 0; out.avgV[p.k] = Math.round(mean(v) * 100); out.avg[p.k] = out.has[p.k] ? out.avgV[p.k] : '\u2013';
    });
    wk.forEach(function (d, i) { if (d.training > 0) out.trainDays++; if (d.today) out.todayIdx = i; });
    return out;
  }
  function weekAria(wi) { return 'This week: trained ' + wi.trainDays + ' of 7 days. Week averages: training ' + wi.avg.training + ', food ' + wi.avg.food + ', recovery ' + wi.avg.recovery + '.'; }
  function pct(v) { return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) : '\u2013'; }
  function dayAvg(d) { return mean([d.training, d.food, d.recovery]); }
  /* today's column sits on a raised plate */
  function todayPlate(ctx, x, y, w, h) { return box(x, y, w, h, DP.plate(ctx.T, 14)); }
  function legendAll(ctx, x, y, w, withAvg, wi) {
    let T = ctx.T, s = '';
    PILLARS.forEach(function (p, i) {
      s += '<span style="' + (i ? 'margin-left:14px;' : '') + '">' + markerInline(p.sh, T[p.k]) + p.n + (withAvg ? ' <span style="' + num(ctx, 11, T.text) + '">' + wi.avg[p.k] + '</span>' : '') + '</span>';
    });
    return line(x, y, w, lab(ctx, 11, T.muted, 500), s);
  }
  let WSIZE2 = { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['L', 'Large']] };

  let weekA = {
    key: 'A', name: 'Rings',

    options: [WSIZE2, { id: 'labels', label: 'Under each day', choices: [['date', 'Date'], ['none', 'Nothing']] }],
    sizes: ['M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, wi = weekInfo(D), bw = ctx.frame.w - 32, cw = bw / 7, L = o.size === 'L', dates = o.labels !== 'none';
      let R = L ? 19 : 17.5, cy = dates ? 48 : 54, g = '', h = '';
      wi.days.forEach(function (d, i) {
        let cx = cw * (i + 0.5);
        if (d.today) h += todayPlate(ctx, cx - cw / 2 + 1, -2, cw - 2, 102);
        g += stext(ctx, cx, 14, d.label, 11, d.today ? T.text : T.muted, 'middle', false, d.today ? 700 : 500);
        g += ringSet(ctx, cx, cy, R, L ? 4.5 : 4, 1.5, PILLARS.map(function (p) { return { v: d[p.k], col: T[p.k] }; }));
        if (dates) g += stext(ctx, cx, 89, d.date, 13, d.today ? T.text : T.muted, 'middle', true);
      });
      h += svg(0, 0, bw, 100, g);
      if (!L) h += legendAll(ctx, 0, 106, bw, true, wi);
      else {
        let td = wi.days[wi.todayIdx];
        h += line(0, 120, bw, lab(ctx, 11, T.muted, 600), 'Week average');
        PILLARS.forEach(function (p, i) {
          let x = i * (bw / 3), cx = bw / 6;
          h += svg(x, 140, bw / 3, 70, gauge(ctx, cx, 36, 30, 6, wi.avgV[p.k] / 100, T[p.k], {}));
          h += line(x, 162, bw / 3, num(ctx, 20, T.text), wi.avg[p.k], 'center');
          h += line(x, 212, bw / 3, lab(ctx, 13, T.text, 600), markerInline(p.sh, T[p.k]) + p.n, 'center');
          h += line(x, 231, bw / 3, lab(ctx, 11, T.muted, 500), 'Today ' + pct(td[p.k]), 'center');
        });
      }
      return tile(ctx, 'ts2-week-A', weekAria(wi), header(ctx, 'week', T.accent, 'This week', wi.trainDays + ' training days'), h);
    }
  };

  /* smooth path through points (Catmull-Rom as cubic Beziers), y clamped to the lane so the curve never overshoots */
  function smooth(pts, yMin, yMax) {
    let d = 'M' + r2(pts[0][0]) + ' ' + r2(pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      let p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, k = 6;
      let c1 = [p1[0] + (p2[0] - p0[0]) / k, clamp(p1[1] + (p2[1] - p0[1]) / k, yMin, yMax)];
      let c2 = [p2[0] - (p3[0] - p1[0]) / k, clamp(p2[1] - (p3[1] - p1[1]) / k, yMin, yMax)];
      d += 'C' + r2(c1[0]) + ' ' + r2(c1[1]) + ' ' + r2(c2[0]) + ' ' + r2(c2[1]) + ' ' + r2(p2[0]) + ' ' + r2(p2[1]);
    }
    return d;
  }
  /* Three recessed lanes, one per pillar: a raised line through the week over a soft wash of the same colour, today as the thumb. */
  function lanes(ctx, wi, x, y, w, laneH, gap, o) {
    let T = ctx.T, uid = uidOf(ctx), g = '<defs>', body = '', dk = isDark(ctx), pad = 8, n = wi.days.length;
    PILLARS.forEach(function (p, k) {
      g += '<linearGradient id="' + uid + '-wa-' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + T[p.k] + '" stop-opacity="' + (dk ? 0.34 : 0.26) + '"/><stop offset="1" stop-color="' + T[p.k] + '" stop-opacity="0"/></linearGradient>';
      g += '<clipPath id="' + uid + '-lc-' + k + '"><rect x="' + r2(x) + '" y="' + r2(y + k * (laneH + gap)) + '" width="' + r2(w) + '" height="' + r2(laneH) + '" rx="' + r2(Math.min(10, laneH / 2)) + '"/></clipPath>';
    });
    g += '</defs>';
    PILLARS.forEach(function (p, k) {
      let ly = y + k * (laneH + gap), top = ly + 7, bot = ly + laneH - 5, step = (w - pad * 2) / (n - 1);
      let pts = wi.days.map(function (d, i) { return [x + pad + i * step, bot - (bot - top) * clamp(d[p.k], 0, 1)]; });
      let ln = smooth(pts, top - 2, bot), last = pts[n - 1];
      body += '<rect x="' + r2(x) + '" y="' + r2(ly) + '" width="' + r2(w) + '" height="' + r2(laneH) + '" rx="' + r2(Math.min(10, laneH / 2)) + '" fill="' + wellC(ctx) + '"' + flt(ctx, 'sink') + '/>';
      if (!wi.has[p.k]) return;
      body += '<g clip-path="url(#' + uid + '-lc-' + k + ')"><path d="' + ln + 'L' + r2(last[0]) + ' ' + r2(ly + laneH) + 'L' + r2(pts[0][0]) + ' ' + r2(ly + laneH) + 'Z" fill="url(#' + uid + '-wa-' + k + ')"/></g>';
      body += '<path d="' + ln + '" fill="none" stroke="' + T[p.k] + '" stroke-width="' + (o.sw || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + flt(ctx, 'lift') + '/>';
      body += knob(ctx, last[0], last[1], o.kr || 3.6, T[p.k]);
    });
    return g + body;
  }
  let weekB = {
    key: 'B', name: 'Lanes',

    options: [SIZE3, { id: 'labels', label: 'Day labels', choices: [['on', 'Shown'], ['off', 'Hidden']] }],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, wi = weekInfo(D), bw = ctx.frame.w - 32, sz = o.size, S = sz === 'S', L = sz === 'L', h = '';
      let lx = S ? 16 : 86, rw = S ? 0 : 40, lw = bw - lx - rw - (S ? 0 : 10), days = o.labels !== 'off' && !S;
      let laneH = L ? 62 : S ? 30 : days ? 24 : 32, gap = L ? 14 : 8, y0 = L ? 4 : 0;
      h += svg(0, 0, bw, 240, lanes(ctx, wi, lx, y0, lw, laneH, gap, { sw: L ? 2.4 : 2, kr: L ? 4.4 : 3.6 }));
      PILLARS.forEach(function (p, k) {
        let cy = y0 + k * (laneH + gap) + laneH / 2;
        h += marker(p.sh, 0, cy - 5, T[p.k]);
        if (!S) {
          h += line(16, cy - 8, lx - 20, lab(ctx, 13, T.text, 500), p.n);
          h += line(bw - rw, cy - (L ? 13 : 10), rw, num(ctx, L ? 22 : 17, T.text), wi.avg[p.k], 'right');
        }
      });
      if (days) {
        let ly = y0 + 3 * (laneH + gap) - gap + (L ? 12 : 6), step = (lw - 16) / 6;
        wi.days.forEach(function (d, i) {
          h += line(lx + 8 + i * step - 16, ly, 32, lab(ctx, 11, d.today ? T.text : T.muted, d.today ? 700 : 500), L ? d.label : d.label.charAt(0), 'center');
        });
        if (L) h += line(bw - rw - 10, ly, rw + 10, lab(ctx, 11, T.muted, 500), 'Avg', 'right');
      }
      return tile(ctx, 'ts2-week-B', weekAria(wi), header(ctx, 'week', T.accent, 'This week', S ? wi.trainDays + ' of 7' : wi.trainDays + ' training days'), h);
    }
  };

  /* Each day is one slim capsule: Training at the base, then Food, then Recovery, each as tall as a third of that pillar's day,
     cut by hairline gaps. The groove behind is a full day. */
  function weekCols(ctx, wi, x, y, w, H, cw, o) {
    let T = ctx.T, uid = uidOf(ctx), pitch = w / 7, g = '<defs>', wells = '', fills = '', gap = o.gap || 2;
    wi.days.forEach(function (d, i) {
      let cx = x + pitch * (i + 0.5), cl = cx - cw / 2, tot = (d.training + d.food + d.recovery) / 3, th = H * tot, yy = y + H;
      g += '<clipPath id="' + uid + '-cc-' + i + '"><rect x="' + r2(cl) + '" y="' + r2(y + H - th) + '" width="' + r2(cw) + '" height="' + r2(th) + '" rx="' + r2(cw / 2) + '"/></clipPath>';
      wells += '<rect x="' + r2(cl) + '" y="' + r2(y) + '" width="' + r2(cw) + '" height="' + r2(H) + '" rx="' + r2(cw / 2) + '" fill="' + wellC(ctx) + '"/>';
      let seg = '';
      PILLARS.forEach(function (p, k) {
        let sh = H * d[p.k] / 3;
        if (sh < 0.5) return;
        let top = yy - sh, last = k === 2 || PILLARS.slice(k + 1).every(function (q) { return d[q.k] * H / 3 < 0.5; });
        seg += '<rect x="' + r2(cl) + '" y="' + r2(top + (last ? 0 : 0)) + '" width="' + r2(cw) + '" height="' + r2(Math.max(0.5, sh - (last ? 0 : gap))) + '" fill="' + grad(ctx, T[p.k]) + '"/>';
        yy = top;
      });
      fills += '<g clip-path="url(#' + uid + '-cc-' + i + ')">' + seg + '</g>';
    });
    return g + '</defs><g' + flt(ctx, 'sink') + '>' + wells + '</g><g' + flt(ctx, 'lift') + '>' + fills + '</g>';
  }
  let weekC = {
    key: 'C', name: 'Columns',

    options: [WSIZE2],
    sizes: ['M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, wi = weekInfo(D), bw = ctx.frame.w - 32, L = o.size === 'L', h = '';
      function dayLabels(x, y, w, full) {
        let s = '', pitch = w / 7;
        wi.days.forEach(function (d, i) { s += line(x + i * pitch, y, pitch, lab(ctx, 11, d.today ? T.text : T.muted, d.today ? 700 : 500), full ? d.label : d.label.charAt(0), 'center'); });
        return s;
      }
      if (!L) {
        let cwM = bw - 150;
        h += svg(0, 0, cwM, 96, weekCols(ctx, wi, 0, 2, cwM, 92, 12, {}));
        h += dayLabels(0, 102, cwM, false);
        h += pillarList(ctx, cwM + 26, 18, bw - cwM - 26, 30, PILLARS, function (p) { return wi.avg[p.k]; }, true);
      } else {
        h += svg(0, 0, bw, 180, weekCols(ctx, wi, 0, 4, bw, 172, 20, { gap: 2.5 }));
        h += dayLabels(0, 186, bw, true);
        PILLARS.forEach(function (p, i) {
          h += line(i * (bw / 3), 218, bw / 3 - 6, lab(ctx, 11, T.muted, 500), markerInline(p.sh, T[p.k]) + p.n + ' avg');
          h += line(i * (bw / 3), 234, bw / 3 - 6, num(ctx, 22, T.text), wi.avg[p.k]);
        });
      }
      return tile(ctx, 'ts2-week-C', weekAria(wi) + ' Each day is a column of Training, Food and Recovery.', header(ctx, 'week', T.accent, 'This week', wi.trainDays + ' training days'), h);
    }
  };

  /* A wedge with every corner rounded by rr: the shape is inset by rr (radial sides moved parallel, arcs moved in) and then stroked
     2rr wide with round joins in its own fill, which lands exactly on the original outline. Skia: same Path, stroke join round. */
  function rWedge(cx, cy, r0, r1, a0, a1, rr) {
    rr = Math.min(rr, (r1 - r0) / 2 - 0.01, 30);
    let i0 = r0 + rr, i1 = r1 - rr, d0 = Math.asin(Math.min(1, rr / i0)) * 180 / PI, d1 = Math.asin(Math.min(1, rr / i1)) * 180 / PI;
    let o0 = polar(cx, cy, i1, a0 + d1), o1 = polar(cx, cy, i1, a1 - d1), n1 = polar(cx, cy, i0, a1 - d0), n0 = polar(cx, cy, i0, a0 + d0);
    return { d: 'M' + r2(o0[0]) + ' ' + r2(o0[1]) + 'A' + r2(i1) + ' ' + r2(i1) + ' 0 0 1 ' + r2(o1[0]) + ' ' + r2(o1[1]) +
      'L' + r2(n1[0]) + ' ' + r2(n1[1]) + 'A' + r2(i0) + ' ' + r2(i0) + ' 0 0 0 ' + r2(n0[0]) + ' ' + r2(n0[1]) + 'Z', sw: r2(rr * 2) };
  }
  /* The week as a rose: seven rounded slices around the week's average, today at twelve o'clock and earlier days running back
     counter-clockwise. In each recessed slice one raised petal reaches as far as that day was full across all three pillars.
     Today is the one bright petal; the others share one quiet tone. */
  function rose(ctx, wi, cx, cy, R, o) {
    let T = ctx.T, n = wi.days.length, span7 = 360 / n, gp = o.gap || 4, tr = '', pet = '', g = '';
    wi.days.forEach(function (d, i) {
      let mid = (i - wi.todayIdx) * span7, a0 = mid - span7 / 2 + gp / 2, a1 = mid + span7 / 2 - gp / 2, v = clamp(dayAvg(d), 0, 1);
      let w = rWedge(cx, cy, o.r0, R, a0, a1, o.rr);
      tr += '<path d="' + w.d + '" fill="' + wellC(ctx) + '" stroke="' + wellC(ctx) + '" stroke-width="' + w.sw + '" stroke-linejoin="round"/>';
      if (v > 0.04) {
        let pw = rWedge(cx, cy, o.r0, o.r0 + (R - o.r0) * v, a0, a1, o.rr), c = grad(ctx, d.today ? T.accent : QUIET(ctx));
        pet += '<path d="' + pw.d + '" fill="' + c + '" stroke="' + c + '" stroke-width="' + pw.sw + '" stroke-linejoin="round"/>';
      }
      if (o.labels) {
        let lp = polar(cx, cy, R + o.lr, mid);
        g += stext(ctx, lp[0], lp[1] + 4, o.labels === 'full' ? d.label : d.label.charAt(0), 11, d.today ? T.text : T.muted, 'middle', false, d.today ? 700 : 500);
      }
    });
    return '<g' + flt(ctx, 'sink') + '>' + tr + '</g><g' + flt(ctx, 'lift') + '>' + pet + '</g>' + g;
  }
  let weekD = {
    key: 'D', name: 'Rose',

    options: [SIZE3],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, wi = weekInfo(D), bw = ctx.frame.w - 32, sz = o.size, h = '';
      let wavg = Math.round(mean(wi.days.map(dayAvg)) * 100);
      let best = wi.days.slice().sort(function (a, b) { return dayAvg(b) - dayAvg(a); })[0];
      if (sz === 'S') {
        h += svg(0, 0, bw, 118, rose(ctx, wi, bw / 2, 59, 58, { r0: 24, rr: 3.5, gap: 5 }));
        h += line(0, 46, bw, num(ctx, 22, T.text), wavg, 'center');
      } else if (sz === 'M') {
        h += svg(0, 0, 124, 118, rose(ctx, wi, 60, 59, 45, { r0: 10, rr: 3.5, gap: 5, labels: 'initial', lr: 10 }));
        h += line(142, 0, bw - 142, '', span(num(ctx, 28, T.text), wavg) + span(lab(ctx, 13, T.muted, 500), ' week average'));
        h += pillarList(ctx, 142, 48, bw - 142, 24, PILLARS, function (p) { return wi.avg[p.k]; }, false);
      } else {
        h += svg(0, 0, bw, 200, rose(ctx, wi, bw / 2, 98, 84, { r0: 38, rr: 5, gap: 4, labels: 'full', lr: 16 }));
        h += line(0, 69, bw, num(ctx, 40, T.text), wavg, 'center');
        h += line(0, 115, bw, lab(ctx, 11, T.muted, 500), 'week avg', 'center');
        PILLARS.forEach(function (p, i) {
          let x = i * (bw / 3);
          h += line(x, 218, bw / 3, lab(ctx, 11, T.muted, 500), markerInline(p.sh, T[p.k]) + p.n + ' avg', 'center');
          h += line(x, 234, bw / 3, num(ctx, 22, T.text), wi.avg[p.k], 'center');
        });
      }
      return tile(ctx, 'ts2-week-D', weekAria(wi) + ' Week average ' + wavg + '. Fullest day: ' + best.label + '.', header(ctx, 'week', T.accent, 'This week', sz === 'S' ? wi.trainDays + ' of 7' : wi.trainDays + ' training days'), h);
    }
  };

  TS2.tiles.push({
    id: 'week', title: 'This week', group: 'Today',

    versions: [weekA, weekB, weekC, weekD]
  });

  /* =====================================================================
     3. NEXT
     ===================================================================== */
  function nextInfo(D, state) {
    /* a workout in progress takes the tile (Resume); otherwise it is the next food check-in. state 'food' forces the check-in. */
    let nx = D.next, c = D.calories, aw = nx.activeWorkout, wo = state !== 'food' && !!aw;
    return {
      wo: wo, now: fmtTime(nowHours(D)),
      title: wo ? 'Resume ' + aw.name : nx.title,
      sub: wo ? aw.elapsed + ' · ' + aw.setsDone + ' of ' + aw.setsTotal + ' sets' : nx.sub,
      cta: wo ? 'Resume' : 'Log', icon: wo ? 'play' : 'plus',
      frac: wo ? aw.setsDone / aw.setsTotal : c.today / c.goal,
      left: wo ? (aw.setsTotal - aw.setsDone) + ' sets left' : ek(c.goal - c.today) + ' ' + eu() + ' left',
      hero: wo ? String(aw.setsTotal - aw.setsDone) : ek(Math.max(0, c.goal - c.today)), heroU: wo ? 'sets left' : eu() + ' left',
      tomorrow: nx.workoutTomorrow, tomorrowName: nx.workoutTomorrow.split(' · ')[0],
      aria: wo ? 'Next: resume ' + aw.name + ', ' + aw.setsDone + ' of ' + aw.setsTotal + ' sets done.' : 'Next: ' + nx.title.toLowerCase() + '. ' + ek(c.today) + ' of ' + ek(c.goal) + ' ' + eu() + ' so far.'
    };
  }
  function nextAria(ni, tm) { return ni.aria + (tm ? ' Tomorrow: ' + ni.tomorrow + '.' : ''); }
  let NEXT_OPTS = [
    { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['L', 'Large']] },
    { id: 'tomorrow', label: 'Tomorrow', choices: [['on', 'Shown'], ['off', 'Hidden']] }
  ];

  let nextA = {
    key: 'A', name: 'Gauge',

    options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] }, NEXT_OPTS[1], { id: 'button', label: 'Button', choices: [['filled', 'Raised'], ['tinted', 'Plate']] }],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ni = nextInfo(D, o.state), bw = ctx.frame.w - 32, col = ni.wo ? T.training : T.food, tm = o.tomorrow !== 'off' && !!ni.tomorrow, bs = o.button === 'tinted' ? 'tinted' : 'filled', h = '';
      let c = D.calories, aw = D.next.activeWorkout, sz = o.size;
      function g(cx, cy, r, sw) {
        return ni.wo ? gauge(ctx, cx, cy, r, sw, 0, col, { segments: aw.setsTotal, done: aw.setsDone, gapDeg: r > 50 ? 2.5 : 3.5 })
          : gauge(ctx, cx, cy, r, sw, ni.frac, col, {});
      }
      if (sz === 'S') {
        h += svg(0, 0, bw, 72, g(bw / 2, 38, 36, 7));
        h += line(0, 17, bw, num(ctx, 22, T.text), ni.hero, 'center');
        h += line(0, 45, bw, lab(ctx, 11, T.muted, 500), ni.heroU, 'center');
        h += button(ctx, 0, 76, bw, 42, ni.wo ? 'Resume' : ni.title, { col: col, style: bs, icon: ni.icon, aria: ni.title });
      } else if (sz === 'M') {
        h += svg(0, 0, 118, 118, g(58, 58, 47, 9));
        h += line(8, 37, 100, num(ctx, 28, T.text), ni.hero, 'center');
        h += line(8, 70, 100, lab(ctx, 11, T.muted, 500), ni.heroU, 'center');
        h += line(138, 2, bw - 138, num(ctx, 22, T.text), esc(ni.title));
        h += line(138, 32, bw - 138, lab(ctx, 13, T.muted, 500), ni.wo ? esc(aw.elapsed) + ' · ' + aw.setsDone + ' of ' + aw.setsTotal + ' sets' : ek(c.today) + ' of ' + ek(c.goal) + ' ' + eu());
        h += button(ctx, 138, 72, bw - 138, 46, ni.wo ? 'Resume workout' : ni.title, { col: col, style: bs, icon: ni.icon });
      } else {
        h += svg(0, 0, bw, 150, g(bw / 2, 82, 72, 12));
        h += line(0, 52, bw, num(ctx, 40, T.text), ni.hero, 'center');
        h += line(0, 100, bw, lab(ctx, 13, T.muted, 500), ni.heroU, 'center');
        if (ni.wo) h += statPlate(ctx, 0, 150, bw, 54, [['Workout', esc(aw.name)], ['Elapsed', aw.elapsed], ['Sets done', aw.setsDone + ' of ' + aw.setsTotal]]);
        else h += statPlate(ctx, 0, 150, bw, 54, c.meals.slice(0, 3).map(function (m) { return [esc(m.name), ek(m.kcal) + span(lab(ctx, 11, T.muted, 500), ' ' + eu())]; }));
        h += button(ctx, 0, 216, bw, 46, ni.wo ? 'Resume workout' : ni.title, { col: col, style: bs, icon: ni.icon });
      }
      let meta = sz === 'S' ? '' : tm ? 'Tomorrow: ' + esc(ni.tomorrowName) : ni.wo ? 'In progress' : 'Evening check-in';
      return tile(ctx, 'ts2-next-A', nextAria(ni, tm), header(ctx, 'up-next', col, 'Next', meta), h);
    }
  };

  let nextB = {
    key: 'B', name: 'Slots',

    options: NEXT_OPTS,
    sizes: ['M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ni = nextInfo(D, o.state), bw = ctx.frame.w - 32, col = ni.wo ? T.training : T.food, tm = o.tomorrow !== 'off' && !!ni.tomorrow, L = o.size === 'L', h = '';
      let c = D.calories, aw = D.next.activeWorkout, meals = c.meals, maxK = Math.max.apply(null, meals.map(function (m) { return m.kcal; }));
      function grid(x, y, w, cols, ph, gap) {
        let out = '', pw = (w - gap * (cols - 1)) / cols;
        for (let i = 0; i < aw.setsTotal; i++) {
          let px = x + (i % cols) * (pw + gap), py = y + Math.floor(i / cols) * (ph + gap + 2), rr = Math.min(6, ph / 2);
          out += i < aw.setsDone ? box(px, py, pw, ph, DP.raised(col, T, rr))
            : box(px, py, pw, ph, DP.well(T, rr) + (i === aw.setsDone ? 'border:1.5px solid ' + col + ';' : ''));
        }
        return out;
      }
      if (!L) {
        if (ni.wo) {
          h += line(0, -1, 120, num(ctx, 28, T.text), aw.elapsed);
          h += line(120, 0, bw - 120, lab(ctx, 15, T.text, 600), esc(aw.name), 'right');
          h += line(120, 20, bw - 120, lab(ctx, 13, T.muted, 500), aw.setsDone + ' of ' + aw.setsTotal + ' sets', 'right');
          h += slots(ctx, 0, 48, bw, 12, aw.setsDone, aw.setsTotal, col, 4);
        } else {
          let sw = (bw - 24) / 4;
          meals.forEach(function (m, i) {
            h += box(i * (sw + 8), 0, sw, 60, DP.plate(T, 12),
              line(10, 8, sw - 16, lab(ctx, 11, T.muted, 500), m.name) + line(10, 23, sw - 16, num(ctx, 17, T.text), ek(m.kcal)) +
              box(10, 48, Math.max(4, (sw - 20) * m.kcal / maxK), 4, DP.raised(col, T, 2)));
          });
          h += box(3 * (sw + 8), 0, sw, 60, DP.well(T, 12),
            line(10, 8, sw - 16, lab(ctx, 11, T.muted, 500), 'Dinner') + box(10, 28, 20, 20, '', ctx.icon('plus', 20, col)));
        }
        h += button(ctx, 0, 72, bw, 46, ni.wo ? 'Resume workout' : ni.title, { col: col, icon: ni.icon, trail: ni.left });
      } else {
        if (ni.wo) {
          h += line(0, -4, 160, num(ctx, 40, T.text), aw.elapsed);
          h += line(160, 2, bw - 160, lab(ctx, 17, T.text, 600), esc(aw.name), 'right');
          h += line(160, 25, bw - 160, lab(ctx, 13, T.muted, 500), 'In progress', 'right');
          h += grid(0, 66, bw, 6, 22, 7);
          h += line(0, 176, bw - 110, '', span(num(ctx, 17, T.text), aw.setsDone) + span(lab(ctx, 13, T.muted, 500), ' of ' + aw.setsTotal + ' sets done'));
        } else {
          let cwd = (bw - 24) / 4;
          meals.forEach(function (m, i) {
            h += box(i * (cwd + 8), 0, cwd, 124, DP.plate(T, 14),
              line(12, 12, cwd - 18, lab(ctx, 11, T.text, 700), esc(m.name)) + line(12, 30, cwd - 18, lab(ctx, 11, T.muted, 500), clkS(m.time)) +
              line(12, 74, cwd - 18, num(ctx, 22, T.text), ek(m.kcal)) + line(12, 100, cwd - 18, lab(ctx, 11, T.muted, 500), eu()));
          });
          h += box(3 * (cwd + 8), 0, cwd, 124, DP.well(T, 14),
            line(12, 12, cwd - 18, lab(ctx, 11, T.text, 700), 'Dinner') + line(12, 30, cwd - 18, lab(ctx, 11, T.muted, 500), 'Open') +
            box(12, 70, 24, 24, '', ctx.icon('plus', 24, col)) + line(12, 100, cwd - 18, lab(ctx, 11, col, 600), ek(c.goal - c.today) + ' left'));
          /* the day's goal as one recessed track: a raised segment per meal, the open rest stays recessed */
          let mx = 2, inner = '';
          meals.forEach(function (m) { let w = (bw - 4) * m.kcal / c.goal; inner += box(mx, 2, Math.max(4, w - 3), 8, DP.raised(col, T, 4)); mx += w; });
          h += box(0, 144, bw, 12, DP.well(T, 6), inner);
          h += line(0, 170, bw - 110, '', span(num(ctx, 17, T.text), ek(c.today)) + span(lab(ctx, 13, T.muted, 500), ' of ' + ek(c.goal) + ' ' + eu()));
        }
        h += line(bw - 110, ni.wo ? 179 : 173, 110, lab(ctx, 13, T.muted, 500), ni.left, 'right');
        h += button(ctx, 0, 216, bw, 46, ni.wo ? 'Resume workout' : ni.title, { col: col, icon: ni.icon });
      }
      return tile(ctx, 'ts2-next-B', nextAria(ni, tm), header(ctx, 'up-next', col, 'Next', tm ? 'Tomorrow: ' + esc(ni.tomorrowName) : ''), h);
    }
  };

  let nextC = {
    key: 'C', name: 'Timeline',

    options: NEXT_OPTS,
    sizes: ['M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ni = nextInfo(D, o.state), bw = ctx.frame.w - 32, col = ni.wo ? T.training : T.food, tm = o.tomorrow !== 'off' && !!ni.tomorrow, L = o.size === 'L', h = '';
      let c = D.calories, tx = 24;
      function rail(y0, y1) { return box(4, y0, 4, y1 - y0, DP.well(T, 2)); }
      function nodeDone(y) { return box(0, y, 12, 12, DP.raised(NEUTRAL(ctx), T, 6)); }
      function nodeNow(y) { return box(-1, y - 1, 14, 14, DP.raised(col, T, 7)); }
      function nodeNext(y) { return box(0, y, 12, 12, DP.well(T, 6)); }
      function eyebrow(y, s) { return line(tx, y, bw - tx, lab(ctx, 11, T.muted, 600), s); }
      if (!L) {
        if (tm) {
          h += rail(8, 96) + nodeNow(2) + eyebrow(0, 'Now · ' + ni.now);
          h += line(tx, 16, bw - tx - 124, num(ctx, 17, T.text), esc(ni.title)) + line(tx, 40, bw - tx - 124, lab(ctx, 13, T.muted, 500), esc(ni.sub));
          h += button(ctx, bw - 112, 8, 112, 44, ni.cta, { col: col, icon: ni.icon, aria: ni.title });
          h += nodeNext(90) + eyebrow(80, 'Tomorrow') + line(tx, 96, bw - tx, lab(ctx, 13, T.text, 600), esc(ni.tomorrow));
        } else {
          h += rail(8, 62) + nodeDone(2) + eyebrow(0, 'Earlier today') + line(tx, 16, bw - tx, lab(ctx, 13, T.text, 500), c.meals.length + ' meals logged · ' + ek(c.today) + ' ' + eu());
          h += nodeNow(58) + eyebrow(56, 'Now · ' + ni.now);
          h += line(tx, 72, bw - tx - 124, num(ctx, 17, T.text), esc(ni.title)) + line(tx, 96, bw - tx - 124, lab(ctx, 13, T.muted, 500), esc(ni.sub));
          h += button(ctx, bw - 112, 66, 112, 44, ni.cta, { col: col, icon: ni.icon, aria: ni.title });
        }
      } else {
        let step = tm ? 21 : 28, ny = tm ? 96 : 124;
        h += rail(8, tm ? 236 : ny + 4) + nodeDone(2) + eyebrow(0, 'Earlier today');
        c.meals.forEach(function (m, i) {
          let yy = (tm ? 18 : 22) + i * step;
          h += line(tx, yy, bw - tx - 90, '', span(lab(ctx, 13, T.text, 500), esc(m.name)) + span(lab(ctx, 13, T.muted, 500), '  ' + clkS(m.time)));
          h += line(bw - 90, yy, 90, num(ctx, 13, T.text), ek(m.kcal) + ' ' + eu(), 'right');
        });
        h += nodeNow(ny + 1) + eyebrow(ny, 'Now · ' + ni.now);
        h += line(tx, ny + 16, bw - tx, num(ctx, 22, T.text), esc(ni.title));
        h += line(tx, ny + 46, bw - tx, lab(ctx, 13, T.muted, 500), esc(ni.sub));
        h += button(ctx, tx, ny + 70, bw - tx, 46, ni.wo ? 'Resume workout' : ni.title, { col: col, icon: ni.icon, trail: ni.left });
        if (tm) h += nodeNext(232) + eyebrow(226, 'Tomorrow') + line(tx, 243, bw - tx, lab(ctx, 13, T.text, 600), esc(ni.tomorrow));
      }
      return tile(ctx, 'ts2-next-C', nextAria(ni, tm), header(ctx, 'up-next', col, 'Next', ni.wo ? 'In progress' : ''), h);
    }
  };

  /* a round raised action button with one icon */
  function roundButton(ctx, x, y, d, col, icon, aria) {
    return box(x, y, d, d, DP.raised(col, ctx.T, d / 2) + 'display:flex;align-items:center;justify-content:center;" role="button" aria-label="' + esc(aria), ctx.icon(icon, Math.round(d * 0.4), ctx.T.onAccent));
  }
  /* progress toward the goal as one recessed groove: a raised piece per meal, or one key per set mid-workout */
  function focusTrack(ctx, D, wo, col, x, y, w, hh, simple) {
    let T = ctx.T, c = D.calories, aw = D.next.activeWorkout;
    if (wo && simple) return wellBar(ctx, x, y, w, hh, aw.setsDone / aw.setsTotal, col);
    if (wo) return slots(ctx, x, y, w, hh, aw.setsDone, aw.setsTotal, col, 2.5);
    let mx = 0, inner = '', ih = hh;
    c.meals.forEach(function (m) { let mw = w * m.kcal / c.goal; inner += box(mx, 0, Math.max(ih, mw - 2.5), ih, DP.raised(col, T, ih / 2)); mx += mw; });
    return box(x, y, w, hh, DP.well(T, hh / 2), inner);
  }
  let nextD = {
    key: 'D', name: 'Focus',

    options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] }, NEXT_OPTS[1]],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ni = nextInfo(D, o.state), bw = ctx.frame.w - 32, col = ni.wo ? T.training : T.food, tm = o.tomorrow !== 'off' && !!ni.tomorrow, sz = o.size, h = '';
      let c = D.calories, aw = D.next.activeWorkout;
      let eyebrow = ni.wo ? 'In progress · ' + aw.elapsed : 'Now · ' + ni.now;
      let sub = ni.wo ? aw.setsDone + ' of ' + aw.setsTotal + ' sets' : ek(c.today) + ' of ' + ek(c.goal) + ' ' + eu();
      if (sz === 'S') {
        h += line(0, 0, bw, lab(ctx, 11, T.muted, 600), eyebrow);
        h += line(0, 16, bw, num(ctx, 17, T.text), esc(ni.wo ? aw.name : ni.title));
        h += focusTrack(ctx, D, ni.wo, col, 0, 46, bw, 6, true);
        h += line(0, 72, bw - 64, num(ctx, 22, T.text), ni.hero);
        h += line(0, 100, bw - 64, lab(ctx, 11, T.muted, 500), ni.heroU);
        h += roundButton(ctx, bw - 52, 66, 52, col, ni.icon, ni.title);
      } else if (sz === 'M') {
        let tw = bw - 92;
        h += line(0, 0, tw, lab(ctx, 11, T.muted, 600), eyebrow);
        h += line(0, 16, tw, num(ctx, 22, T.text), esc(ni.title));
        h += line(0, 46, tw, lab(ctx, 13, T.muted, 500), sub);
        h += focusTrack(ctx, D, ni.wo, col, 0, 84, tw, 6);
        h += line(0, 98, tw, lab(ctx, 11, T.muted, 500), ni.left);
        h += roundButton(ctx, bw - 68, 27, 68, col, ni.icon, ni.title);
      } else {
        h += line(0, 0, bw, lab(ctx, 11, T.muted, 600), eyebrow);
        h += line(0, 16, bw - 96, num(ctx, 28, T.text), esc(ni.title));
        h += line(0, 54, bw - 96, lab(ctx, 13, T.muted, 500), sub);
        h += roundButton(ctx, bw - 76, 6, 76, col, ni.icon, ni.title);
        h += line(0, 104, bw - 120, '', span(num(ctx, 40, T.text), ni.hero) + span(lab(ctx, 13, T.muted, 500), '  ' + ni.heroU));
        h += focusTrack(ctx, D, ni.wo, col, 0, 160, bw, 10);
        if (!ni.wo) {
          let mx = 0;
          c.meals.forEach(function (m) { let mw = bw * m.kcal / c.goal; h += line(mx, 176, mw - 4, lab(ctx, 11, T.muted, 500), esc(m.name)); mx += mw; });
          h += line(mx, 176, bw - mx, lab(ctx, 11, col, 600), 'Dinner', 'right');
        } else h += line(0, 176, bw, '', span(lab(ctx, 11, T.muted, 500), 'Set 1') + '<span style="float:right;' + lab(ctx, 11, T.muted, 500) + '">Set ' + aw.setsTotal + '</span>');
        if (tm) h += box(0, 206, bw, 56, DP.plate(T, 14),
          box(14, 18, 20, 20, '', ctx.icon('week', 20, T.muted)) +
          line(44, 10, bw - 60, lab(ctx, 11, T.muted, 500), 'Tomorrow') + line(44, 26, bw - 60, lab(ctx, 15, T.text, 600), esc(ni.tomorrow)));
      }
      let meta = sz === 'S' ? '' : sz === 'M' && tm ? 'Tomorrow: ' + esc(ni.tomorrowName) : ni.wo ? 'Active workout' : 'Evening check-in';
      return tile(ctx, 'ts2-next-D', nextAria(ni, tm), header(ctx, 'up-next', col, 'Next', meta), h);
    }
  };

  TS2.tiles.push({
    id: 'next', title: 'Next', group: 'Today',

    versions: [nextA, nextB, nextC, nextD]
  });

  /* =====================================================================
     4. NEXT UP (ROUTINES)
     ===================================================================== */
  function upInfo(D, state) {
    /* logged: the item was just ticked, so the tile offers Undo (D.nextup.justLogged; state 'logged' forces it) */
    let u = D.nextup, logged = state === 'logged' || !!u.justLogged, now = nowHours(D), due = parseTime(u.due), w = u.window.split(' to ');
    let mins = Math.max(0, Math.round((due - now) * 60)), hh = Math.floor(mins / 60), mm = mins % 60;
    let a = /^(\d+)(?::(\d+))? (AM|PM)$/.exec(w[0]), b = /^(\d+)(?::(\d+))? (AM|PM)$/.exec(w[1]);
    function sh(m, ap) { if (h24()) return clkS(m[1] + ':' + (m[2] || '00') + ' ' + m[3]); return m[1] + (m[2] && m[2] !== '00' ? ':' + m[2] : '') + (ap ? ' ' + m[3] : ''); }
    return {
      u: u, logged: logged, now: now, nowStr: fmtTime(now), due: due, w0: parseTime(w[0]), w1: parseTime(w[1]),
      countdown: (hh ? hh + 'h ' : '') + mm + 'm',
      winShort: a && b ? sh(a, a[3] !== b[3]) + ' to ' + sh(b, true) : clkT(u.window), dueStr: clkS(u.due),
      done: u.doneToday + (logged ? 1 : 0), total: u.totalToday, rDone: u.routineDone + (logged ? 1 : 0), rTotal: u.routineTotal,
      next: u.upcoming[1],
      aria: logged ? u.item + ' logged. ' + (u.doneToday + 1) + ' of ' + u.totalToday + ' routine items done today. Undo available.'
        : 'Next up in your ' + u.routine + ' routine: ' + u.item + ', ' + u.amount + ', due ' + clkS(u.due) + '. ' + u.doneToday + ' of ' + u.totalToday + ' done today.'
    };
  }
  function upButton(ctx, x, y, w, h, ui) {
    return ui.logged ? button(ctx, x, y, w, h, 'Undo', { style: 'quiet', aria: 'Undo logging ' + ui.u.item })
      : button(ctx, x, y, w, h, 'Log', { col: ctx.T.accent, icon: 'check', aria: 'Log ' + ui.u.item });
  }
  function loggedLine(ctx, x, y, w, ui, size) {
    return line(x, y, w, lab(ctx, size, ctx.T.muted, 500), '<span style="display:inline-block;vertical-align:-3px;margin-right:4px">' + ctx.icon('check', size + 3, ctx.T.success) + '</span>Logged ' + ui.nowStr);
  }

  /* the Routines tab's sun path: a recessed dome from 5 AM to midnight, the routine window raised on it, and now as a thumb */
  function dome(ctx, w, h, cx, base, rx, ry, sw, ui, showWin, labels) {
    let T = ctx.T, g = '', S0 = 5, SPAN = 19;
    function P(t) { let f = clamp((t - S0) / SPAN, 0, 1); return [cx - rx * Math.cos(PI * f), base - ry * Math.sin(PI * f)]; }
    function arc(t0, t1) { let a = P(t0), b = P(t1); return 'M' + r2(a[0]) + ' ' + r2(a[1]) + 'A' + rx + ' ' + ry + ' 0 0 1 ' + r2(b[0]) + ' ' + r2(b[1]); }
    g += sTrack(ctx, arc(S0, S0 + SPAN), sw);
    let col = ui.logged ? T.success : T.accent;
    if (showWin) g += sArc(ctx, arc(ui.w0, ui.w1), sw, col);
    else { let dp = P(ui.due); g += knob(ctx, dp[0], dp[1], sw * 0.62, col); }
    let np = P(ui.now);
    g += knob(ctx, np[0], np[1], sw * 0.95);
    if (labels) {
      g += stext(ctx, cx, base - 24, 'Now', 11, T.muted, 'middle');
      g += stext(ctx, cx, base - 7, ui.nowStr, 13, T.text, 'middle', true);
      g += stext(ctx, cx - rx, base + 18, h24() ? '05:00' : '5 AM', 11, T.muted, 'middle', true);
      g += stext(ctx, cx + rx, base + 18, h24() ? '00:00' : '12 AM', 11, T.muted, 'middle', true);
    }
    return svg(0, 0, w, h, g);
  }
  let upA = {
    key: 'A', name: 'Sun path',

    options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] }, { id: 'window', label: 'Time window', choices: [['shown', 'Shown'], ['hidden', 'Hidden']] }],
    sizes: ['S', 'M'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ui = upInfo(D, o.state), u = ui.u, bw = ctx.frame.w - 32, win = o.window !== 'hidden', h = '';
      if (o.size === 'S') {
        h += dome(ctx, bw, 34, bw / 2, 30, 62, 25, 5, ui, win, false);
        h += line(0, 38, bw, lab(ctx, 13, T.text, 700), esc(u.item));
        h += ui.logged ? loggedLine(ctx, 0, 56, bw, ui, 11) : line(0, 56, bw, lab(ctx, 11, T.muted, 500), esc(u.amount) + ' · ' + (win ? ui.winShort : 'due ' + ui.dueStr));
        h += upButton(ctx, 0, 74, bw, 44, ui);
      } else {
        h += line(0, 0, 180, lab(ctx, 11, T.muted, 600), esc(u.routine) + ' routine · ' + ui.rDone + ' of ' + ui.rTotal);
        h += line(0, 18, 180, num(ctx, 17, T.text), esc(u.item));
        h += ui.logged ? loggedLine(ctx, 0, 44, 180, ui, 13) : line(0, 44, 180, lab(ctx, 13, T.muted, 500), esc(u.amount) + ' · due ' + ui.dueStr);
        h += upButton(ctx, 0, 74, 124, 44, ui);
        h += box(bw - 148, 4, 148, 114, '', dome(ctx, 148, 114, 74, 84, 62, 62, 7, ui, win, true));
      }
      return tile(ctx, 'ts2-nextup-A', ui.aria, header(ctx, 'routine', T.accent, 'Next up', o.size === 'S' ? ui.done + ' of ' + ui.total : ui.done + ' of ' + ui.total + ' today'), h);
    }
  };

  let upB = {
    key: 'B', name: 'Checklist',

    options: [SIZE3, { id: 'progress', label: 'Progress', choices: [['today', 'All today'], ['routine', 'This routine']] }],
    sizes: ['S', 'M', 'L'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ui = upInfo(D, o.state), u = ui.u, bw = ctx.frame.w - 32, sz = o.size, h = '';
      let byRoutine = o.progress === 'routine';
      let meta = byRoutine ? ui.rDone + ' of ' + ui.rTotal : ui.done + ' of ' + ui.total + (sz === 'S' ? '' : ' today');
      function check(x, y, s, done, strong) {
        return done ? box(x, y, s, s, DP.raised(T.accent, T, s / 2) + 'display:flex;align-items:center;justify-content:center;', ctx.icon('check', Math.round(s * 0.7), T.onAccent))
          : box(x, y, s, s, DP.well(T, s / 2) + (strong ? 'border:1.5px solid ' + T.accent + ';' : ''));
      }
      let nameSt = ui.logged ? 'text-decoration:line-through;text-decoration-color:' + T.ghost + ';' : '';
      if (sz === 'S') {
        h += line(0, 2, bw, lab(ctx, 11, T.muted, 600), esc(u.routine) + ' routine');
        h += line(0, 24, bw, lab(ctx, 13, ui.logged ? T.muted : T.text, 700) + nameSt, esc(u.item));
        h += ui.logged ? loggedLine(ctx, 0, 42, bw, ui, 11) : line(0, 42, bw, lab(ctx, 11, T.muted, 500), esc(u.amount) + ' · due ' + ui.dueStr);
        h += upButton(ctx, 0, 74, bw, 44, ui);
      } else if (sz === 'M') {
        h += line(0, 0, bw, lab(ctx, 11, T.muted, 600), esc(u.routine) + ' routine · ' + esc(clkT(u.window)));
        h += check(0, 29, 22, ui.logged, true);
        h += line(34, 22, bw - 34 - 100, num(ctx, 15, ui.logged ? T.muted : T.text) + nameSt, esc(u.item));
        h += ui.logged ? loggedLine(ctx, 34, 43, 190, ui, 13) : line(34, 43, bw - 34 - 100, lab(ctx, 13, T.muted, 500), esc(u.amount) + ' · due ' + ui.dueStr);
        h += upButton(ctx, bw - 88, 18, 88, 44, ui);
        u.upcoming.slice(1).forEach(function (s, i) {
          let y = 74 + i * 24;
          h += check(3, y + 1, 16, false, false) + line(34, y, bw - 34, lab(ctx, 13, T.muted, 500), esc(s));
        });
      } else {
        h += line(0, 0, bw, lab(ctx, 11, T.muted, 600), esc(u.routine) + ' routine · ' + esc(clkT(u.window)));
        h += check(0, 34, 26, ui.logged, true);
        h += line(40, 26, bw - 40 - 100, num(ctx, 17, ui.logged ? T.muted : T.text) + nameSt, esc(u.item));
        h += ui.logged ? loggedLine(ctx, 40, 50, 190, ui, 13) : line(40, 50, bw - 40 - 100, lab(ctx, 13, T.muted, 500), esc(u.amount) + ' · due ' + ui.dueStr);
        h += upButton(ctx, bw - 88, 24, 88, 44, ui);
        u.upcoming.slice(1).forEach(function (s, i) {
          let y = 92 + i * 38;
          h += check(3, y + 1, 20, false, false) + line(40, y + 2, bw - 40, lab(ctx, 15, T.text, 500), esc(s));
        });
        h += line(0, 186, 160, lab(ctx, 13, T.muted, 500), byRoutine ? esc(u.routine) + ' routine' : 'Today');
        h += line(bw - 160, 184, 160, '', span(num(ctx, 17, T.text), byRoutine ? ui.rDone : ui.done) + span(lab(ctx, 13, T.muted, 500), ' of ' + (byRoutine ? ui.rTotal : ui.total) + ' done'), 'right');
        h += byRoutine ? slots(ctx, 0, 214, bw, 10, ui.rDone, ui.rTotal, T.accent, 4) : slots(ctx, 0, 214, bw, 10, ui.done, ui.total, T.accent, 4);
        h += line(0, 238, bw, lab(ctx, 11, T.muted, 500), ui.logged ? 'Next: ' + esc(ui.next) : 'Due in ' + ui.countdown);
      }
      return tile(ctx, 'ts2-nextup-B', ui.aria, header(ctx, 'routine', T.accent, 'Next up', meta), h);
    }
  };

  let upC = {
    key: 'C', name: 'Clock',

    options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] }, { id: 'time', label: 'Time', choices: [['countdown', 'Countdown'], ['clock', 'Clock time']] }, { id: 'window', label: 'Time window', choices: [['shown', 'Shown'], ['hidden', 'Hidden']] }],
    sizes: ['S', 'M'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ui = upInfo(D, o.state), u = ui.u, bw = ctx.frame.w - 32, win = o.window !== 'hidden', clock = o.time === 'clock', S = o.size === 'S', h = '';
      let dueParts = ui.dueStr.split(' ');
      let hero = ui.logged ? ui.done + ' of ' + ui.total : clock ? dueParts[0] : ui.countdown;
      let heroPre = !ui.logged && clock ? 'Due ' : '';
      let heroLab = ui.logged ? ' done' + (S ? '' : ' today') : clock ? ' ' + (dueParts[1] || '') : (S ? ' left' : ' until due');
      if (S) {
        h += line(0, 0, bw, '', (heroPre ? span(lab(ctx, 13, T.muted, 500), heroPre) : '') + span(num(ctx, 28, T.text), hero) + span(lab(ctx, 13, T.muted, 500), heroLab));
        h += line(0, 41, bw, lab(ctx, 13, T.text, 700), esc(u.item));
        h += ui.logged ? loggedLine(ctx, 0, 60, bw, ui, 11) : line(0, 60, bw, lab(ctx, 11, T.muted, 500), esc(u.amount) + ' · ' + (win ? ui.winShort : esc(u.routine) + ' routine'));
        h += upButton(ctx, 0, 78, bw, 40, ui);
      } else {
        let cx = 59, cy = 59, r = 52, sw = 7, g = '';
        let ang = function (t) { return (t % 12) / 12 * 360; };
        for (let k = 0; k < 12; k++) { let p = polar(cx, cy, r - sw / 2 - 6, k * 30); g += '<circle cx="' + r2(p[0]) + '" cy="' + r2(p[1]) + '" r="' + (k % 3 === 0 ? 1.6 : 1) + '" fill="' + (k % 3 === 0 ? T.muted : T.ghost) + '"/>'; }
        g += sRingTrack(ctx, cx, cy, r, sw);
        let a0 = ang(ui.now), a1 = ang(ui.due); if (a1 < a0) a1 += 360;
        let w0 = ang(ui.w0), w1 = ang(ui.w1); if (w1 < w0) w1 += 360;
        if (!ui.logged && a1 - a0 > 1) g += sArc(ctx, arcD(cx, cy, r, a0, a1), sw, SOFT(ctx));
        if (win) g += sArc(ctx, arcD(cx, cy, r, w0, w1), sw, ui.logged ? T.success : T.accent);
        else { let dp = polar(cx, cy, r, a1); g += knob(ctx, dp[0], dp[1], 3.5, T.accent); }
        let np = polar(cx, cy, r, a0);
        g += knob(ctx, np[0], np[1], 6.5);
        h += box(cx - r + sw / 2 + 1, cy - r + sw / 2 + 1, 2 * (r - sw / 2 - 1), 2 * (r - sw / 2 - 1), DP.plate(T, r));
        h += svg(0, 0, 118, 118, g);
        if (ui.logged) {
          h += box(cx - 12, cy - 22, 24, 24, '', ctx.icon('check', 24, T.success));
          h += line(cx - 40, cy + 6, 80, lab(ctx, 11, T.muted, 500), 'Logged', 'center');
        } else {
          h += line(cx - 44, cy - 14, 88, num(ctx, 17, T.text), clock ? dueParts[0] : ui.countdown, 'center');
          h += line(cx - 44, cy + 8, 88, lab(ctx, 11, T.muted, 500), clock ? ((dueParts[1] ? dueParts[1] + ' ' : '') + 'due') : 'until due', 'center');
        }
        h += line(138, 0, bw - 138, lab(ctx, 11, T.muted, 600), esc(u.routine) + ' routine · ' + ui.rDone + ' of ' + ui.rTotal);
        h += line(138, 18, bw - 138, num(ctx, 17, T.text), esc(u.item));
        h += ui.logged ? loggedLine(ctx, 138, 44, bw - 138, ui, 13) : line(138, 44, bw - 138, lab(ctx, 13, T.muted, 500), esc(u.amount) + ' · ' + (win ? ui.winShort : 'due ' + ui.dueStr));
        h += upButton(ctx, 138, 74, bw - 138, 44, ui);
      }
      return tile(ctx, 'ts2-nextup-C', ui.aria, header(ctx, 'routine', T.accent, 'Next up', S ? ui.done + ' of ' + ui.total : ui.done + ' of ' + ui.total + ' today'), h);
    }
  };

  /* The evening on a ruler: a recessed groove from now to past the window, the routine window raised inside it, now the thumb.
     The empty groove between them is the wait. */
  function ruler(ctx, ui, x, y, w, o) {
    let T = ctx.T, t0 = Math.floor(ui.now), t1 = Math.max(Math.ceil(ui.w1), t0 + 2), g = '', gh = o.gh || 8, gy = y + (o.tags ? 20 : 8);
    function X(t) { return x + 8 + (w - 16) * (t - t0) / (t1 - t0); }
    g += '<rect x="' + r2(x) + '" y="' + r2(gy - gh / 2) + '" width="' + r2(w) + '" height="' + gh + '" rx="' + gh / 2 + '" fill="' + wellC(ctx) + '"' + flt(ctx, 'sink') + '/>';
    let col = ui.logged ? T.success : T.accent;
    g += '<rect x="' + r2(X(ui.w0)) + '" y="' + r2(gy - gh / 2 + 1) + '" width="' + r2(X(ui.w1) - X(ui.w0)) + '" height="' + (gh - 2) + '" rx="' + (gh / 2 - 1) + '" fill="' + grad(ctx, col) + '"' + flt(ctx, 'lift') + '/>';
    g += knob(ctx, X(ui.now), gy, gh * 0.85);
    for (let t = t0; t <= t1; t++) {
      if (!o.every && t !== t0 && t !== t1) continue;
      let hh = t % 24, mid = o.every && t !== t0 && t !== t1, lbl = h24() ? (mid ? ('0' + hh).slice(-2) : hh24(hh)) : (hh % 12 === 0 ? 12 : hh % 12) + (mid ? '' : hh >= 12 ? ' PM' : ' AM');
      g += stext(ctx, X(t), gy + gh / 2 + 16, lbl, 11, T.muted, t === t0 ? 'start' : t === t1 ? 'end' : 'middle', true);
    }
    if (o.tags) {
      g += stext(ctx, X(ui.now), gy - gh / 2 - 9, 'Now', 11, T.muted, 'middle');
      g += stext(ctx, X(ui.w0), gy - gh / 2 - 9, 'Due ' + fmtTime(ui.due).replace(' PM', '').replace(' AM', ''), 11, col, 'start', false, 600);
    }
    return g;
  }
  let upD = {
    key: 'D', name: 'Ruler',

    options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small']] }],
    sizes: ['S', 'M'],
    render: function (o, ctx) {
      let T = ctx.T, D = ctx.data, ui = upInfo(D, o.state), u = ui.u, bw = ctx.frame.w - 32, S = o.size === 'S', h = '';
      if (S) {
        h += svg(0, 2, bw, 36, ruler(ctx, ui, 0, 0, bw, { gh: 8 }));
        h += line(0, 40, bw, lab(ctx, 13, T.text, 700), esc(u.item));
        h += ui.logged ? loggedLine(ctx, 0, 57, bw, ui, 11) : line(0, 57, bw, '', span(num(ctx, 11, T.text), ui.countdown) + span(lab(ctx, 11, T.muted, 500), ' until due'));
        h += upButton(ctx, 0, 76, bw, 42, ui);
      } else {
        h += line(0, -2, bw - 104, '', ui.logged ? span(num(ctx, 28, T.text), ui.done + ' of ' + ui.total) + span(lab(ctx, 13, T.muted, 500), '  done today')
          : span(num(ctx, 28, T.text), ui.countdown) + span(lab(ctx, 13, T.muted, 500), '  until due'));
        h += line(0, 34, bw - 104, '', span(lab(ctx, 13, T.text, 600), esc(u.item)) + span(lab(ctx, 13, T.muted, 500), ' · ' + esc(u.amount)));
        h += upButton(ctx, bw - 88, 2, 88, 44, ui);
        h += svg(0, 64, bw, 54, ruler(ctx, ui, 0, 0, bw, { every: true, tags: true, gh: 10 }));
      }
      return tile(ctx, 'ts2-nextup-D', ui.aria, header(ctx, 'routine', T.accent, 'Next up', S ? ui.done + ' of ' + ui.total : esc(u.routine) + ' routine · ' + ui.winShort), h);
    }
  };

  TS2.tiles.push({
    id: 'nextup', title: 'Next up', group: 'Routines',

    versions: [upA, upB, upC, upD]
  });
}
