// @ts-nocheck -- generated tile drawing code: each style is a pure function from options and data to markup.
/* Home tiles: Sleep, Sleep score, Mindful minutes, HRV and Resting heart rate. Each style draws the whole tile (frame, header and body) as markup that ./markup.tsx turns into
   native views and SVG. Materials come from ./depth (one light from above: raised fills, recessed tracks, neutral plates). */
export function install(window) {
  let TS2 = window.TS2, INS = window.INS;

  'use strict';
  let FR = { S: { w: 173, h: 176 }, M: { w: 358, h: 176 }, L: { w: 358, h: 320 } };

  /* ---------- small pure helpers ---------- */
  function fx(n) { return String(Math.round(n * 100) / 100); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function sum(a) { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t; }
  function fin(a) { let o = []; for (let i = 0; i < a.length; i++) if (typeof a[i] === 'number' && isFinite(a[i])) o.push(a[i]); return o; } /* days with no reading are left out */
  function avg(a) { a = fin(a); return a.length ? sum(a) / a.length : 0; }
  function mn(a) { a = fin(a); return a.length ? Math.min.apply(null, a) : 0; }
  function mx(a) { a = fin(a); return a.length ? Math.max.apply(null, a) : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dur(min) { min = Math.round(min); let h = Math.floor(min / 60); return (h ? h + 'h ' : '') + (min % 60) + 'm'; }
  /* clock times follow Settings (INS.prefs units.clock, 12 or 24 hour); the data keeps "h:mm AM" strings and decimal hours */
  function P() { return window.INS && INS.prefs; }
  function h24() { return !!P() && P().get('units.clock') === '24'; }
  function cs(s) { return P() ? P().clkStr(s) : s; }
  function clock(dec) { /* decimal hours, values over 24 are after midnight */
    let t = ((dec % 24) + 24) % 24, h = Math.floor(t), m = Math.round((t - h) * 60);
    if (m === 60) { h = (h + 1) % 24; m = 0; }
    if (h24()) return pad2(h) + ':' + pad2(m);
    return (h % 12 || 12) + ':' + pad2(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function parseClock(s) { let m = /(\d+):(\d+)\s*(AM|PM)/i.exec(s); if (!m) return 0; return (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0) + (+m[2]) / 60; }
  function hourLabel(h, short) { let t = ((h % 24) + 24) % 24, a = t >= 12 ? 'PM' : 'AM', v = (t % 12 || 12); if (h24()) return short ? pad2(t) : pad2(t) + ':00'; return short ? v + (a === 'PM' ? 'p' : 'a') : v + ' ' + a; }
  /* a copy of a record with its "h:mm AM" fields in the Settings clock */
  function withClock(o, keys) { let c = {}; for (let k in o) c[k] = o[k]; keys.forEach(function (k) { if (c[k] != null) { c[k + '0'] = o[k]; c[k] = cs(o[k]); } }); return c; }
  function hexRGB(c) { c = String(c).replace('#', ''); if (c.length === 3) c = c.replace(/(.)/g, '$1$1'); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function mixc(a, b, t) { let A = hexRGB(a), B = hexRGB(b); return '#' + A.map(function (v, i) { let x = Math.round(v + (B[i] - v) * t); return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function lum(c) { let v = hexRGB(c); return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; }
  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  /* half circle over the top, p 0 = left end, 1 = right end */
  function arcPath(cx, cy, r, p0, p1) {
    let a0 = Math.PI * (1 - p0), a1 = Math.PI * (1 - p1);
    return 'M' + fx(cx + r * Math.cos(a0)) + ' ' + fx(cy - r * Math.sin(a0)) + 'A' + fx(r) + ' ' + fx(r) + ' 0 0 1 ' + fx(cx + r * Math.cos(a1)) + ' ' + fx(cy - r * Math.sin(a1));
  }
  /* full circle arc from twelve o'clock, clockwise, f 0..1 */
  function ringPath(cx, cy, r, f) {
    let a1 = -Math.PI / 2 + Math.min(0.9999, f) * 2 * Math.PI, e = polar(cx, cy, r, a1);
    return 'M' + fx(cx) + ' ' + fx(cy - r) + 'A' + fx(r) + ' ' + fx(r) + ' 0 ' + (f > 0.5 ? 1 : 0) + ' 1 ' + fx(e[0]) + ' ' + fx(e[1]);
  }

  /* ---------- the tile kit: one header, one type scale, one set of depth materials ---------- */
  function kit(o, ctx) {
    let T = ctx.T, size = o.size || 'M', fr = ctx.frame || FR[size] || FR.M, D = window.TS2.depth;
    let fh = String(ctx.type.fontHeading).replace(/"/g, "'"), fb = String(ctx.type.fontBody).replace(/"/g, "'");
    let dk = D.isDark(T);
    let k = { T: T, D: D, size: size, W: fr.w, H: fr.h, cw: fr.w - 32, bh: fr.h - 58, fh: fh, fb: fb, dark: dk, light: !dk, uid: ctx.uid || 'rc', n: 0 };
    /* recessed fill for SVG tracks and wells (the #sink filter adds the inner shadow on the top edge) */
    k.well = dk ? mixc(T.surface, '#000000', 0.24) : mixc(T.bg, '#161728', 0.06);
    k.root = function (cls, aria, head, body) {
      return '<div class="' + cls + '" role="img" aria-label="' + esc(aria) + '" style="width:' + k.W + 'px;height:' + k.H + 'px;box-sizing:border-box;border-radius:20px;' + D.tile(T) +
        'overflow:hidden;position:relative;padding:16px;display:flex;flex-direction:column;font-family:' + fb + ';color:' + T.text + ';-webkit-font-smoothing:antialiased;text-align:left;white-space:normal">' + head +
        '<div style="flex:none;margin-top:6px;height:' + k.bh + 'px;position:relative">' + body + '</div></div>';
    };
    k.head = function (icon, color, title, meta) {
      return '<div style="display:flex;align-items:center;gap:6px;height:20px;flex:none"><span style="display:flex;flex:none;width:18px;height:18px">' + ctx.icon(icon, 18, color) + '</span>' +
        '<span style="flex:1 1 auto;min-width:0;font:600 14px/20px ' + fb + ';color:' + T.text + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</span>' +
        (meta ? '<span style="flex:none;font:500 13px/20px ' + fb + ';color:' + T.muted + ';white-space:nowrap">' + esc(meta) + '</span>' : '') + '</div>';
    };
    k.bigPx = size === 'L' ? 40 : 28;
    k.big = function (html, px) { px = px || k.bigPx; return '<div style="font-family:' + fh + ';font-weight:700;font-size:' + px + 'px;line-height:' + (px + (px > 30 ? 2 : 4)) + 'px;font-variant-numeric:tabular-nums;color:' + T.text + ';white-space:nowrap;letter-spacing:' + (px >= 28 ? '-0.035em' : px >= 18 ? '-0.018em' : '0') + '">' + html + '</div>'; };
    k.unit = function (s, ml) { return '<span style="font-family:' + fb + ';font-weight:600;font-size:13px;color:' + T.muted + ';letter-spacing:0;margin-left:' + (ml == null ? 3 : ml) + 'px">' + esc(s) + '</span>'; };
    k.sub = function (s, color) { return '<div style="font:500 13px/16px ' + fb + ';color:' + (color || T.muted) + ';margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s + '</div>'; };
    k.hero = function (big, sub) { return '<div style="flex:none">' + big + (sub ? k.sub(sub) : '') + '</div>'; };
    k.t = function (s, px, color, extra) { px = px || 13; return '<div style="font:500 ' + px + 'px/' + (px <= 11 ? 14 : 16) + 'px ' + fb + ';color:' + (color || T.muted) + ';white-space:nowrap;' + (extra || '') + '">' + s + '</div>'; };
    k.num = function (s, px, color) { return '<span style="font-family:' + fh + ';font-weight:700;font-size:' + (px || 15) + 'px;font-variant-numeric:tabular-nums;color:' + (color || T.text) + '">' + s + '</span>'; };
    k.st = function (x, y, s, anchor, opt) { /* svg label, 11 pt */
      opt = opt || {};
      return '<text x="' + fx(x) + '" y="' + fx(y) + '" text-anchor="' + (anchor || 'start') + '" fill="' + (opt.fill || T.muted) + '" font-family="' + (opt.num ? fh : fb) + '" font-size="' + (opt.px || 11) + '" font-weight="' + (opt.w || (opt.num ? ((opt.px || 11) <= 12 ? 600 : 700) : 500)) + '" style="font-variant-numeric:tabular-nums">' + esc(s) + '</text>';
    };
    /* one svg with its own depth defs; fn(u) draws using url(#u-lift), url(#u-sink), url(#u-g-i) */
    k.svg = function (w, h, cols, fn, style) {
      let u = k.uid + 'r' + (++k.n);
      return '<svg width="' + fx(w) + '" height="' + fx(h) + '" viewBox="0 0 ' + fx(w) + ' ' + fx(h) + '" style="display:block;flex:none;overflow:visible;' + (style || '') + '" aria-hidden="true">' + D.defs(T, u, cols) + fn(u) + '</svg>';
    };
    k.wellR = function (u, x, y, w, h, r) { return '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(Math.max(0, w)) + '" height="' + fx(Math.max(0, h)) + '" rx="' + fx(r) + '" fill="' + k.well + '" filter="url(#' + u + '-sink)"/>'; };
    k.wellC = function (u, cx, cy, r) { return '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r) + '" fill="' + k.well + '" filter="url(#' + u + '-sink)"/>'; };
    k.rR = function (u, x, y, w, h, r, gi) { return '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(Math.max(0, w)) + '" height="' + fx(Math.max(0, h)) + '" rx="' + fx(r) + '" fill="url(#' + u + '-g-' + gi + ')"/>'; };
    k.rC = function (u, cx, cy, r, gi) { return '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(Math.max(0, r)) + '" fill="url(#' + u + '-g-' + gi + ')"/>'; };
    k.lift = function (u, inner) { return '<g filter="url(#' + u + '-lift)">' + inner + '</g>'; };
    /* a neutral raised plate for SVG (dial faces, knobs) */
    k.plateFill = dk ? mixc(T.surface, '#FFFFFF', 0.07) : '#FFFFFF';
    /* layouts: S stacks, M splits, L stacks with a foot row */
    k.stack = function (inner, extra) { return '<div style="height:100%;display:flex;flex-direction:column;justify-content:space-between;' + (extra || '') + '">' + inner + '</div>'; };
    k.split = function (left, right, lw, gap) {
      return '<div style="display:flex;gap:' + (gap == null ? 16 : gap) + 'px;height:100%"><div style="width:' + lw + 'px;flex:none;display:flex;flex-direction:column;justify-content:space-between">' + left + '</div>' +
        '<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center">' + right + '</div></div>';
    };
    /* Large only: one quiet line along the bottom, the source on the left and one summary on the right */
    k.foot = function (src, right) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;height:14px;font:500 11px/14px ' + fb + ';color:' + T.muted + ';white-space:nowrap"><span>' + esc(src || '') + '</span>' +
        '<span style="display:flex;gap:12px">' + (right || '') + '</span></div>';
    };
    k.fact = function (label, value) { return '<span>' + esc(label) + ' ' + k.num(value, 11) + '</span>'; };
    k.swatch = function (c) { return '<span style="display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:5px;vertical-align:1px;' + D.raised(c, T, 3) + '"></span>'; };
    k.days = ctx.data.days; k.dayLabels = ctx.data.dayLabels;
    return k;
  }

  /* =====================================================================
     SLEEP  (violet; light falls on the night from above)
     Every style has a "Shows" tray option: Hours (default) or Sleep score. With the score the hero is the bare number and the
     visual keeps its shape, measured against 100 instead of the sleep need.
     ===================================================================== */
  let STAGES = ['awake', 'rem', 'core', 'deep'];
  let STAGE_NAME = { awake: 'Awake', rem: 'REM', core: 'Core', deep: 'Deep' };
  let STAGE_GI = { deep: 0, core: 1, rem: 2, awake: 3 };
  function showOpt() { return { id: 'show', label: 'Shows', tray: true, choices: [['hours', 'Hours'], ['score', 'Sleep score']] }; }
  function sleepModel(d) {
    let s = d.sleep, last = s.last, tot = { awake: 0, rem: 0, core: 0, deep: 0 }, sc = s.score || { today: 0, series: [], parts: {} };
    last.stages.forEach(function (g) { tot[g[0]] += g[2] - g[1]; });
    let bed = parseClock(last.bed); if (bed < 12) bed += 24;
    let beds = s.bedtimes.map(function (b) { return b < 12 ? b + 24 : b; }); beds[beds.length - 1] = bed;
    let needH = Math.round(s.need * 10) / 10;
    return { src: s.source || '', last: withClock(last, ['bed', 'wake']), total: last.minutes, need: s.need * 60, needH: needH, tot: tot, bed: bed, beds: beds, durs: s.series.slice(),
      score: sc.today, scores: sc.series.slice(), parts: sc.parts, scoreSrc: s.source || sc.source || '' };
  }
  function stageCols(k) {
    let T = k.T, c = T.sleep;
    return [c, mixc(c, T.surface, k.dark ? 0.34 : 0.36), mixc(c, T.surface, k.dark ? 0.6 : 0.62), mixc(T.ghost, T.surface, k.dark ? 0.2 : 0.35)];
  }
  function sleepBig(k, min, px) { min = Math.round(min); return k.big(Math.floor(min / 60) + k.unit('h', 1) + ' ' + (min % 60) + k.unit('m', 1), px); }
  /* the hero for either mode: hours and minutes, or the bare score */
  function sleepHero(k, S, sc, px) { return sc ? k.big(String(S.score), px) : sleepBig(k, S.total, px); }
  function sleepFrac(S, sc) { return sc ? S.score / 100 : S.total / S.need; }
  function asleep(S) { return dur(S.total) + ' asleep'; }
  function needLine(S) { let d = Math.round(S.need - S.total); return d > 0 ? d + ' min short of ' + S.needH + ' h' : 'Met your ' + S.needH + ' h need'; }
  function sleepRange(S, n) {
    let b = S.beds.slice(-n), d = S.durs.slice(-n), ab = avg(b);
    return { avgDur: avg(d) * 60, avgBed: ab, avgScore: Math.round(avg(S.scores.slice(-n))), spread: Math.round(avg(b.map(function (v) { return Math.abs(v - ab); })) * 60) };
  }
  function stageKey(k, S, list) { return list.map(function (st) { return '<span>' + k.swatch(stageCols(k)[STAGE_GI[st]]) + STAGE_NAME[st] + ' ' + k.num(dur(S.tot[st]), 11) + '</span>'; }).join(''); }
  function sleepAria(S, sc) { return sc ? 'Sleep score last night: ' + S.score + ', from ' + dur(S.total) + ' asleep. ' : 'Sleep last night: ' + dur(S.total) + ' of an ' + S.needH + ' hour need. '; }

  /* A. hypnogram: four stage lanes cut into one recessed well; each stretch of sleep is a raised capsule at its depth */
  function hypno(k, S, W, H, gutter, axis) {
    let pad = H > 80 ? 7 : 5, gap = H > 80 ? 5 : 3, laneH = (H - 2 * pad - 3 * gap) / 4, cw = W - gutter, iw = cw - 2 * pad, total = S.total;
    let yc = function (st) { return pad + STAGES.indexOf(st) * (laneH + gap); };
    return k.svg(W, H + (axis ? 22 : 0), stageCols(k), function (u) {
      let out = k.wellR(u, gutter, 0, cw, H, Math.min(12, H / 4)), segs = '', i;
      if (gutter) for (i = 0; i < 4; i++) out += k.st(0, yc(STAGES[i]) + laneH / 2 + 4, STAGE_NAME[STAGES[i]]);
      S.last.stages.forEach(function (s) {
        let x = gutter + pad + s[1] / total * iw, w = Math.max(Math.max(3, laneH * 0.7), (s[2] - s[1]) / total * iw - 1.5);
        segs += k.rR(u, Math.min(x, W - pad - w), yc(s[0]), w, laneH, Math.min(laneH / 2, 4), STAGE_GI[s[0]]);
      });
      out += k.lift(u, segs);
      if (axis) for (let h = 24; h <= 32; h += 2) { let mm = (h - S.bed) * 60; if (mm > 20 && mm < total - 20) out += k.st(gutter + pad + mm / total * iw, H + 18, hourLabel(h), 'middle'); }
      return out;
    });
  }

  /* B. nights: each night a raised column standing on one recessed floor, the dashed line is your need (or your average score) */
  function nightCols(k, S, W, H, n, sc, xl) {
    let T = k.T, c = T.sleep, vals = sc ? S.scores.slice(-n) : S.durs.slice(-n), ref = sc ? avg(vals) : S.needH;
    let lo = sc ? 40 : 4, hi = sc ? 100 : Math.max(S.needH + 1, Math.ceil(mx(vals))), pr = xl ? 30 : 0, pb = xl ? 18 : 0, fh = 6, base = H - pb - fh;
    let pitch = (W - pr) / n, bw = Math.max(6, Math.min(20, pitch * 0.56)), lab = k.dayLabels.slice(-n);
    let y = function (v) { return base - 2 - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (base - 4); };
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.46 : 0.5)], function (u) {
      let out = k.wellR(u, 0, base, W - pr, fh, fh / 2), cols = '', i, ry = y(ref);
      for (i = 0; i < n; i++) {
        let cx = i * pitch + pitch / 2, top = y(vals[i]), last = i === n - 1;
        cols += k.rR(u, cx - bw / 2, top, bw, base + fh / 2 - top, Math.min(bw / 2, 6), last ? 0 : 1);
        if (xl) out += k.st(cx, H - 2, pitch > 36 ? lab[i] : lab[i].charAt(0), 'middle', last ? { fill: T.text, w: 600 } : null);
      }
      out += k.lift(u, cols);
      out += '<path d="M0 ' + fx(ry) + 'H' + fx(W - pr) + '" stroke="' + (k.dark ? '#FFFFFF' : T.text) + '" stroke-opacity="' + (k.dark ? 0.5 : 0.4) + '" stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round"/>';
      if (xl) out += k.st(W, ry + 4, sc ? String(Math.round(ref)) : S.needH + ' h', 'end', { num: true });
      return out;
    });
  }

  /* C. night arc: a recessed half dial for the need (or 100), the raised arc is last night; small rings below for the week */
  function arcGauge(k, u, cx, cy, r, sw, f) {
    let c = k.T.sleep, out = '<path d="' + arcPath(cx, cy, r, 0, 1) + '" fill="none" stroke="' + k.well + '" stroke-width="' + sw + '" stroke-linecap="round" filter="url(#' + u + '-sink)"/>';
    f = Math.max(0.02, Math.min(1, f));
    let a = Math.PI * (1 - f), e = [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    out += '<circle cx="' + fx(e[0]) + '" cy="' + fx(e[1]) + '" r="' + fx(sw * 0.75) + '" fill="' + c + '" fill-opacity="' + (k.dark ? 0.55 : 0.35) + '" filter="url(#' + u + '-glow)"/>';
    out += '<path d="' + arcPath(cx, cy, r, 0, f) + '" fill="none" stroke="url(#' + u + '-g-0)" stroke-width="' + (sw - 2) + '" stroke-linecap="round" filter="url(#' + u + '-lift)"/>';
    return out;
  }
  function nightArc(k, S, r, sw, px, sub, sc) {
    let W = 2 * r + sw + 4, cy = r + sw / 2 + 2, H = cy + 4;
    let g = k.svg(W, H, [k.T.sleep], function (u) { return arcGauge(k, u, W / 2, cy, r, sw, sleepFrac(S, sc)); });
    return '<div style="position:relative;width:' + fx(W) + 'px;height:' + fx(H) + 'px;flex:none">' + g +
      '<div style="position:absolute;left:0;right:0;bottom:2px;text-align:center">' + sleepHero(k, S, sc, px) + (sub ? '<div style="font:500 11px/14px ' + k.fb + ';color:' + k.T.muted + '">' + sub + '</div>' : '') + '</div></div>';
  }
  function weekRings(k, S, W, n, rcap, xl, sc) {
    let T = k.T, vals = sc ? S.scores.slice(-n) : S.durs.slice(-n), pitch = W / n, r = Math.min(rcap, pitch / 2 - 4), sw = r > 11 ? 4 : 3, H = 2 * r + sw + 2 + (xl ? 18 : 0), lab = k.dayLabels.slice(-n);
    return k.svg(W, H, [T.sleep, mixc(T.sleep, T.surface, k.dark ? 0.4 : 0.45)], function (u) {
      let out = '', arcs = '', i, cy = r + sw / 2 + 1;
      for (i = 0; i < n; i++) {
        let cx = pitch * i + pitch / 2, f = Math.min(1, sc ? vals[i] / 100 : vals[i] / S.needH), last = i === n - 1;
        out += '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r) + '" fill="none" stroke="' + k.well + '" stroke-width="' + sw + '" filter="url(#' + u + '-sink)"/>';
        arcs += f >= 0.999 ? '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r) + '" fill="none" stroke="url(#' + u + '-g-' + (last ? 0 : 1) + ')" stroke-width="' + (sw - 0.5) + '"/>'
          : '<path d="' + ringPath(cx, cy, r, f) + '" fill="none" stroke="url(#' + u + '-g-' + (last ? 0 : 1) + ')" stroke-width="' + (sw - 0.5) + '" stroke-linecap="round"/>';
        if (xl) out += k.st(cx, H - 2, pitch > 40 ? lab[i] : lab[i].charAt(0), 'middle', last ? { fill: T.text, w: 600 } : null);
      }
      return out + k.lift(u, arcs);
    });
  }

  /* D. stages: the night as one recessed capsule split into raised segments by stage; rows give each stage its share */
  let STAGE_ORDER = ['deep', 'core', 'rem', 'awake'];
  function stageBar(k, S, W, h) {
    let pad = h > 16 ? 4 : 3, gap = h > 16 ? 3 : 2, iw = W - 2 * pad - gap * (STAGE_ORDER.length - 1), x = pad;
    return k.svg(W, h, stageCols(k), function (u) {
      let segs = '';
      STAGE_ORDER.forEach(function (st) {
        let w = Math.max(4, S.tot[st] / S.total * iw);
        segs += k.rR(u, x, pad, w, h - 2 * pad, Math.min((h - 2 * pad) / 2, 6), STAGE_GI[st]); x += w + gap;
      });
      return k.wellR(u, 0, 0, W, h, h / 2) + k.lift(u, segs);
    });
  }
  function stageRows(k, S, W, th, rowH, nameW) {
    let T = k.T, valW = 50, tw = W - nameW - valW - 12;
    return STAGE_ORDER.map(function (st) {
      let f = S.tot[st] / S.total;
      let bar = k.svg(tw, th + 2, stageCols(k), function (u) { return k.wellR(u, 0, 1, tw, th, th / 2) + k.lift(u, k.rR(u, 0, 1, Math.max(th, f * tw), th, th / 2, STAGE_GI[st])); });
      return '<div style="display:flex;align-items:center;gap:6px;height:' + rowH + 'px">' + '<div style="width:' + nameW + 'px;flex:none;font:500 11px/14px ' + k.fb + ';color:' + T.muted + '">' + STAGE_NAME[st] + '</div>' + bar +
        '<div style="width:' + valW + 'px;flex:none;text-align:right;font:500 11px/14px ' + k.fb + ';white-space:nowrap">' + k.num(dur(S.tot[st]), 11, st === 'awake' ? T.muted : T.text) + '</div></div>';
    }).join('');
  }

  let sleepTile = {
    id: 'sleep', title: 'Sleep', group: 'Recovery & Sleep',

    versions: [
      {
        key: 'A', name: 'Hypnogram',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] }, showOpt()],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, S = sleepModel(ctx.data), sc = o.show === 'score', body, sub = sc ? asleep(S) : 'of ' + S.needH + ' h need';
          if (k.size === 'S') body = k.stack(k.hero(sleepHero(k, S, sc), sub) + hypno(k, S, k.cw, 50, 0, false));
          else if (k.size === 'M') body = k.split(k.hero(sleepHero(k, S, sc), sub) + k.t(esc(S.last.bed + ' to ' + S.last.wake), 11), hypno(k, S, k.cw - 132, 96, 0, false), 116);
          else body = k.stack(k.hero(sleepHero(k, S, sc), esc((sc ? asleep(S) + ', ' : '') + S.last.bed + ' to ' + S.last.wake)) + hypno(k, S, k.cw, 128, 46, true) + k.foot(S.src, stageKey(k, S, ['deep', 'core', 'rem'])));
          return k.root('ts2-sleep-A', sleepAria(S, sc) + 'From ' + S.last.bed + ' to ' + S.last.wake + '. Deep ' + dur(S.tot.deep) + ', core ' + dur(S.tot.core) + ', REM ' + dur(S.tot.rem) + '.',
            k.head('sleep', T.sleep, 'Sleep', 'Last night'), body);
        }
      },
      {
        key: 'B', name: 'Nights',

        options: [
          { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] },
          showOpt(),
          { id: 'range', label: 'Range', choices: [['7', '7 nights'], ['14', '14 nights']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, S = sleepModel(ctx.data), sc = o.show === 'score', n = +o.range || 7, R = sleepRange(S, n), body;
          let met = S.durs.slice(-n).filter(function (v) { return v >= S.needH; }).length;
          let sub = sc ? asleep(S) : 'of ' + S.needH + ' h need', avgT = sc ? 'Avg ' + k.num(String(R.avgScore), 11) : 'Avg ' + k.num(dur(R.avgDur), 11);
          if (k.size === 'S') body = k.stack(k.hero(sleepHero(k, S, sc), sub) + nightCols(k, S, k.cw, 52, n, sc, false));
          else if (k.size === 'M') body = k.split(k.hero(sleepHero(k, S, sc), sub) + k.t(avgT + ' a night', 11), nightCols(k, S, k.cw - 132, k.bh, n, sc, true), 116);
          else body = k.stack(k.hero(sleepHero(k, S, sc), esc(sc ? asleep(S) + ', ' + S.last.bed + ' to ' + S.last.wake : needLine(S))) + nightCols(k, S, k.cw, 156, n, sc, true) +
            k.foot(sc ? S.scoreSrc : S.src, sc ? k.fact('Avg score', String(R.avgScore)) : k.fact('Need met', met + ' of ' + n + ' nights') + k.fact('Avg', dur(R.avgDur))));
          return k.root('ts2-sleep-B', sleepAria(S, sc) + 'Over the last ' + n + ' nights, ' + (sc ? 'average score ' + R.avgScore : 'average sleep ' + dur(R.avgDur) + ', need met on ' + met) + '.',
            k.head('sleep', T.sleep, 'Sleep', k.size === 'S' ? '' : n + ' nights'), body);
        }
      },
      {
        key: 'C', name: 'Night arc',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] }, showOpt()],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, S = sleepModel(ctx.data), sc = o.show === 'score', n = 7, R = sleepRange(S, n), body;
          let met = S.durs.slice(-n).filter(function (v) { return v >= S.needH; }).length, sub = sc ? asleep(S) : 'of ' + S.needH + ' h need';
          let left = sc ? 'Avg score ' + k.num(String(R.avgScore), 11) : 'Need met ' + k.num(met + ' of ' + n, 11) + ' nights';
          if (k.size === 'S') body = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:space-between">' + nightArc(k, S, 56, 12, 28, '', sc) + k.sub(sub) + '</div>';
          else if (k.size === 'M') body = k.split('<div style="display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:100%">' + nightArc(k, S, 58, 12, 28, '', sc) + k.sub(sub) + '</div>',
            k.t(left, 11, null, 'margin-bottom:10px') + weekRings(k, S, k.cw - 154, n, 11, true, sc), 138, 16);
          else body = k.stack('<div style="display:flex;flex-direction:column;align-items:center">' + nightArc(k, S, 104, 18, 40, sub, sc) + '</div>' +
            '<div>' + '<div style="display:flex;justify-content:space-between;margin-bottom:10px">' + k.t(left, 11) + k.t(sc ? 'Asleep ' + k.num(dur(S.total), 11) : 'Avg ' + k.num(dur(R.avgDur), 11), 11) + '</div>' + weekRings(k, S, k.cw, n, 14, true, sc) + '</div>');
          return k.root('ts2-sleep-C', sleepAria(S, sc) + (sc ? 'Average score over the last ' + n + ' nights ' + R.avgScore + '.' : 'Need met ' + met + ' of the last ' + n + ' nights, average ' + dur(R.avgDur) + '.'),
            k.head('sleep', T.sleep, 'Sleep', 'Last night'), body);
        }
      },
      {
        key: 'D', name: 'Stages',

        options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] }, showOpt()],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, S = sleepModel(ctx.data), sc = o.show === 'score', body, sub = sc ? asleep(S) : 'of ' + S.needH + ' h need';
          let deepRem = Math.round((S.tot.deep + S.tot.rem) / S.total * 100);
          if (k.size === 'S') body = k.stack(k.hero(sleepHero(k, S, sc), sub) + '<div>' + k.t('Deep and REM ' + k.num(dur(S.tot.deep + S.tot.rem), 11), 11, null, 'margin-bottom:8px') + stageBar(k, S, k.cw, 16) + '</div>');
          else if (k.size === 'M') body = k.split(k.hero(sleepHero(k, S, sc), sub) + k.t(esc(S.last.bed + ' to ' + S.last.wake), 11),
            '<div style="display:flex;flex-direction:column;justify-content:center;height:100%">' + stageRows(k, S, k.cw - 130, 8, 26, 40) + '</div>', 114);
          else body = k.stack(k.hero(sleepHero(k, S, sc), esc((sc ? asleep(S) + ', ' : '') + S.last.bed + ' to ' + S.last.wake)) +
            '<div>' + stageBar(k, S, k.cw, 26) + '<div style="margin-top:12px">' + stageRows(k, S, k.cw, 8, 26, 52) + '</div></div>' +
            k.foot(sc ? S.scoreSrc : S.src, k.fact('Deep and REM', deepRem + '%')));
          return k.root('ts2-sleep-D', sleepAria(S, sc) + 'Deep ' + dur(S.tot.deep) + ', core ' + dur(S.tot.core) + ', REM ' + dur(S.tot.rem) + ', awake ' + dur(S.tot.awake) + '.',
            k.head('sleep', T.sleep, 'Sleep', 'Last night'), body);
        }
      }
    ]
  };

  /* =====================================================================
     SLEEP SCORE  (violet, same pillar as Sleep; one bare number from Apple Health, read against 100 without a denominator)
     ===================================================================== */
  let PART_NAME = { duration: 'Duration', stages: 'Deep and REM', consistency: 'Consistency' };
  function scoreModel(d) {
    let s = d.sleep, sc = s.score, p = sc.parts;
    return { src: s.source || sc.source || '', today: sc.today, series: sc.series.slice(), total: s.last.minutes, bed: cs(s.last.bed), wake: cs(s.last.wake),
      parts: ['duration', 'stages', 'consistency'].map(function (id) { return [PART_NAME[id], p[id]]; }),
      avg7: Math.round(avg(sc.series.slice(-7))), avg30: Math.round(avg(sc.series)) };
  }
  function scoreBig(k, M, px) { return k.big(String(M.today), px); }

  /* A. ring: a recessed full ring, the score a raised arc from twelve o'clock; the number rests on a raised plate inside */
  function scoreRing(k, M, D, sw, px, cap) {
    let T = k.T, c = T.sleep, R = D / 2, r = R - sw / 2 - 2, f = Math.max(0.02, Math.min(1, M.today / 100)), a = -Math.PI / 2 + f * 2 * Math.PI, e = polar(R, R, r, a);
    let g = k.svg(D, D, [c], function (u) {
      let out = '<circle cx="' + fx(R) + '" cy="' + fx(R) + '" r="' + fx(r) + '" fill="none" stroke="' + k.well + '" stroke-width="' + sw + '" filter="url(#' + u + '-sink)"/>';
      out += k.lift(u, '<circle cx="' + fx(R) + '" cy="' + fx(R) + '" r="' + fx(r - sw / 2 - Math.max(5, sw * 0.5)) + '" fill="' + k.plateFill + '"/>');
      out += '<circle cx="' + fx(e[0]) + '" cy="' + fx(e[1]) + '" r="' + fx(sw * 0.7) + '" fill="' + c + '" fill-opacity="' + (k.dark ? 0.5 : 0.32) + '" filter="url(#' + u + '-glow)"/>';
      out += '<path d="' + ringPath(R, R, r, f) + '" fill="none" stroke="url(#' + u + '-g-0)" stroke-width="' + (sw - 2) + '" stroke-linecap="round" filter="url(#' + u + '-lift)"/>';
      return out;
    });
    return '<div style="position:relative;width:' + D + 'px;height:' + D + 'px;flex:none">' + g + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
      scoreBig(k, M, px) + (cap ? '<div style="font:500 11px/14px ' + k.fb + ';color:' + T.muted + ';margin-top:' + (px > 30 ? 0 : -2) + 'px">' + cap + '</div>' : '') + '</div></div>';
  }
  /* a part: label and bare number, a recessed track with a raised fill */
  function partRow(k, p, W, th, lpx, gap) {
    let bar = k.svg(W, th + 2, [k.T.sleep], function (u) { return k.wellR(u, 0, 1, W, th, th / 2) + k.lift(u, k.rR(u, 0, 1, Math.max(th, p[1] / 100 * W), th, th / 2, 0)); });
    return '<div><div style="display:flex;justify-content:space-between;align-items:baseline;font:500 ' + lpx + 'px/' + (lpx + 3) + 'px ' + k.fb + ';color:' + k.T.muted + ';white-space:nowrap;margin-bottom:' + (gap == null ? 4 : gap) + 'px"><span>' + esc(p[0]) + '</span>' + k.num(String(p[1]), lpx + 1) + '</div>' + bar + '</div>';
  }
  /* C. horizon: a quiet landscape across the foot of the tile. The sky is clear at the top and warms toward the sleep colour at the
     horizon; a moon rises from a valley in the far hills, as high as the score (a faint ring marks a full rise), with a soft glow
     around it only; three calm ridgelines step down in value toward the viewer, each with a lit crest and a soft shadow behind it. */
  function smoothPath(p) { /* Catmull-Rom through the points, as cubic Beziers */
    let d = 'M' + fx(p[0][0]) + ' ' + fx(p[0][1]);
    for (let i = 0; i < p.length - 1; i++) {
      let a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += 'C' + fx(b[0] + (c[0] - a[0]) / 6) + ' ' + fx(b[1] + (c[1] - a[1]) / 6) + ' ' + fx(c[0] - (e[0] - b[0]) / 6) + ' ' + fx(c[1] - (e[1] - b[1]) / 6) + ' ' + fx(c[0]) + ' ' + fx(c[1]);
    }
    return d;
  }
  function horizon(k, M, g) {
    let T = k.T, c = T.sleep, dk = k.dark, W = k.W, H = k.bh + 16, s = g.s, r = g.r, cx = W * g.cx, hy = g.hy, TAU = Math.PI * 2;
    let f = Math.max(0, Math.min(1, M.today / 100)), cy = hy + 1.05 * r - f * 2.6 * r, cy1 = hy - 1.55 * r;
    let sh = function (t) { return mixc(T.surface, '#000000', t); };
    function crest(fn) { let p = [], n = 14; for (let i = 0; i <= n; i++) { let x = -6 + (W + 12) * i / n; p.push([x, fn((x - cx) / W)]); } return p; }
    let bump = function (t, m, w) { return Math.exp(-Math.pow((t - m) / w, 2)); };
    let ridges = [
      { p: crest(function (t) { return hy - 15 * s * bump(t, -0.3, 0.2) - 11 * s * bump(t, 0.34, 0.17) - 7 * s * bump(t, -0.66, 0.16) - 8 * s * bump(t, 0.66, 0.2); }),
        top: dk ? mixc(sh(0.02), c, 0.17) : mixc('#FFFFFF', c, 0.18), bot: dk ? mixc(sh(0.10), c, 0.09) : mixc('#FFFFFF', c, 0.13), rim: [0.12, 0.55], shade: 0 },
      { p: crest(function (t) { return hy + 17 * s - 13 * s * bump(t, -0.2, 0.26) - 8 * s * bump(t, 0.52, 0.2); }),
        top: dk ? mixc(sh(0.15), c, 0.07) : mixc(T.bg, c, 0.26), bot: dk ? mixc(sh(0.24), c, 0.03) : mixc(T.bg, c, 0.20), rim: [0.08, 0.38], shade: dk ? 0.32 : 0.07 },
      { p: crest(function (t) { return hy + 31 * s - 9 * s * bump(t, 0.28, 0.3) - 5 * s * bump(t, -0.62, 0.2); }),
        top: dk ? mixc(sh(0.28), c, 0.03) : mixc(T.bg, c, 0.36), bot: dk ? sh(0.38) : mixc(T.bg, c, 0.31), rim: [0.07, 0.28], shade: dk ? 0.4 : 0.09 }
    ];
    let rimC = dk ? mixc(c, '#FFFFFF', 0.45) : '#FFFFFF';
    if (!dk) ridges.forEach(function (q, i) { q.rim = [0.55, 0.95]; });
    let svg = k.svg(W, H, [dk ? c : mixc(c, '#FFFFFF', 0.3)], function (u) {
      let defs = '<defs><linearGradient id="' + u + '-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="' + fx(hy + 6) + '">' +
        '<stop offset="0" stop-color="' + mixc(T.surface, T.accent, dk ? 0.06 : 0.04) + '" stop-opacity="0"/>' +
        '<stop offset=".45" stop-color="' + mixc(T.surface, T.accent, dk ? 0.07 : 0.05) + '" stop-opacity="' + (dk ? 0.55 : 0.5) + '"/>' +
        '<stop offset="1" stop-color="' + (dk ? mixc(T.surface, c, 0.22) : mixc('#FFFFFF', c, 0.13)) + '"/></linearGradient>' +
        '<radialGradient id="' + u + '-halo" gradientUnits="userSpaceOnUse" cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r * 2.7) + '">' +
        '<stop offset="0" stop-color="' + c + '" stop-opacity="' + (dk ? 0.34 : 0.24) + '"/><stop offset=".42" stop-color="' + c + '" stop-opacity="' + (dk ? 0.14 : 0.10) + '"/>' +
        '<stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="' + u + '-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="' + (dk ? 0.55 : 0.7) + '"/><stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>';
      ridges.forEach(function (q, i) {
        let y0 = Math.min.apply(null, q.p.map(function (p) { return p[1]; }));
        defs += '<linearGradient id="' + u + '-r' + i + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + fx(y0) + '" x2="0" y2="' + fx(H) + '"><stop offset="0" stop-color="' + q.top + '"/><stop offset="1" stop-color="' + q.bot + '"/></linearGradient>' +
          '<linearGradient id="' + u + '-e' + i + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + fx(W) + '" y2="0"><stop offset="0" stop-color="' + rimC + '" stop-opacity="' + q.rim[0] + '"/>' +
          '<stop offset="' + fx(g.cx) + '" stop-color="' + rimC + '" stop-opacity="' + q.rim[1] + '"/><stop offset="1" stop-color="' + rimC + '" stop-opacity="' + q.rim[0] + '"/></linearGradient>';
        if (q.shade) defs += '<filter id="' + u + '-s' + i + '" x="-5%" y="-30%" width="110%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="' + fx(2.6 * s) + '" flood-color="#000000" flood-opacity="' + q.shade + '"/></filter>';
      });
      let out = defs + '</defs><rect x="0" y="0" width="' + fx(W) + '" height="' + fx(hy + 30 * s) + '" fill="url(#' + u + '-sky)"/>';
      out += '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r * 2.7) + '" fill="url(#' + u + '-halo)"/>';
      let ro = (dk ? 0.22 : 0.26) * Math.min(1, (cy - cy1) / (0.45 * r)); /* the full-rise ring fades out as the moon reaches it */
      if (ro > 0.02) out += '<circle cx="' + fx(cx) + '" cy="' + fx(cy1) + '" r="' + fx(r) + '" fill="none" stroke="' + T.text + '" stroke-opacity="' + fx(ro) + '" stroke-width="1" stroke-dasharray="1.5 3" stroke-linecap="round"/>';
      out += k.rC(u, cx, cy, r, 0) + '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + fx(r - 0.6) + '" fill="none" stroke="url(#' + u + '-shine)" stroke-width="1.2"/>';
      ridges.forEach(function (q, i) {
        let line = smoothPath(q.p);
        out += '<path d="' + line + 'L' + fx(W + 6) + ' ' + fx(H + 2) + 'L-6 ' + fx(H + 2) + 'Z" fill="url(#' + u + '-r' + i + ')"' + (q.shade ? ' filter="url(#' + u + '-s' + i + ')"' : '') + '/>';
        out += '<path d="' + line + '" fill="none" stroke="url(#' + u + '-e' + i + ')" stroke-width="1.1" stroke-linecap="round"/>';
      });
      return out;
    });
    return '<div style="position:absolute;left:-16px;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none">' + svg + '</div>';
  }
  /* D. week: one raised plate per night with its score; last night's plate is in the sleep colour */
  function weekPlates(k, M, W, n, ph, xl, rows) {
    rows = rows || 1;
    let T = k.T, c = T.sleep, per = n, vals = M.series.slice(-n * rows), gap = W / per > 34 ? 8 : 5, pw = (W - gap * (per - 1)) / per, lab = k.dayLabels.slice(-per), top = xl ? 18 : 0, rg = 8;
    let H = top + rows * ph + (rows - 1) * rg, onC = lum(c) > 0.55 ? '#161728' : '#FFFFFF', npx = pw > 34 ? 17 : 14;
    return k.svg(W, H, [c, k.plateFill], function (u) {
      let out = '', plates = '', txt = '', i, j, r = Math.min(10, pw / 3);
      if (xl) for (i = 0; i < per; i++) out += k.st(i * (pw + gap) + pw / 2, 11, pw > 34 ? lab[i] : lab[i].charAt(0), 'middle', i === per - 1 ? { fill: T.text, w: 600 } : null);
      for (j = 0; j < rows; j++) for (i = 0; i < per; i++) {
        let idx = j * per + i, v = vals[idx], last = idx === vals.length - 1, x = i * (pw + gap), y = top + j * (ph + rg);
        plates += last ? k.rR(u, x, y, pw, ph, r, 0) : '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(pw) + '" height="' + fx(ph) + '" rx="' + fx(r) + '" fill="' + k.plateFill + '"' + (k.dark ? '' : ' stroke="' + T.hair + '" stroke-width="0.6"') + '/>';
        txt += '<text x="' + fx(x + pw / 2) + '" y="' + fx(y + ph / 2 + npx * 0.36) + '" text-anchor="middle" fill="' + (last ? onC : T.text) + '" font-family="' + k.fh + '" font-size="' + npx + '" font-weight="700" style="font-variant-numeric:tabular-nums">' + v + '</text>';
      }
      return out + k.lift(u, plates) + txt;
    });
  }

  let sleepScoreTile = {
    id: 'sleepScore', title: 'Sleep score', group: 'Recovery & Sleep',

    versions: [
      {
        key: 'A', name: 'Ring',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = scoreModel(ctx.data), body;
          if (k.size === 'S') body = '<div style="height:100%;display:flex;justify-content:center;align-items:center">' + scoreRing(k, M, 112, 11, 28, dur(M.total)) + '</div>';
          else if (k.size === 'M') body = k.split('<div style="display:flex;align-items:center;height:100%">' + scoreRing(k, M, 116, 11, 28, '') + '</div>',
            k.sub(esc(dur(M.total) + ' asleep'), T.text) + k.t(esc(M.bed + ' to ' + M.wake), 11, null, 'margin-top:4px') + k.t('30-night avg ' + k.num(String(M.avg30), 11), 11, null, 'margin-top:2px'), 132, 20);
          else body = k.stack('<div style="display:flex;justify-content:center">' + scoreRing(k, M, 164, 16, 40, esc(dur(M.total) + ' asleep')) + '</div>' +
            '<div style="display:flex;gap:16px">' + M.parts.map(function (p) { return '<div style="flex:1 1 0;min-width:0">' + partRow(k, p, (k.cw - 32) / 3, 6, 11) + '</div>'; }).join('') + '</div>' +
            k.foot(M.src, k.fact('30-night avg', String(M.avg30))));
          return k.root('ts2-sleepScore-A', 'Sleep score last night: ' + M.today + ', from ' + dur(M.total) + ' asleep. ' + M.parts.map(function (p) { return p[0] + ' ' + p[1]; }).join(', ') + '.',
            k.head('sleep', T.sleep, 'Sleep score', k.size === 'S' ? '' : 'Last night'), body);
        }
      },
      {
        key: 'B', name: 'Parts',

        options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = scoreModel(ctx.data), body;
          let rows = function (W, th, lpx, gap) { return '<div style="display:flex;flex-direction:column;gap:' + gap + 'px">' + M.parts.map(function (p) { return partRow(k, p, W, th, lpx); }).join('') + '</div>'; };
          if (k.size === 'S') body = k.stack(k.hero(scoreBig(k, M)) + rows(k.cw, 5, 11, 6));
          else if (k.size === 'M') body = k.split(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep')) + k.t('30-night avg ' + k.num(String(M.avg30), 11), 11),
            rows(k.cw - 136, 7, 11, 10), 120);
          else body = k.stack(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep, ' + M.bed + ' to ' + M.wake)) + rows(k.cw, 10, 13, 16) + k.foot(M.src, k.fact('30-night avg', String(M.avg30))));
          return k.root('ts2-sleepScore-B', 'Sleep score last night: ' + M.today + '. ' + M.parts.map(function (p) { return p[0] + ' ' + p[1]; }).join(', ') + '.',
            k.head('sleep', T.sleep, 'Sleep score', k.size === 'S' ? '' : 'Last night'), body);
        }
      },
      {
        key: 'C', name: 'Horizon',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = scoreModel(ctx.data), body, front = function (h) { return '<div style="position:relative;height:100%">' + h + '</div>'; };
          if (k.size === 'S') body = horizon(k, M, { s: 1, r: 13, cx: 0.72, hy: 90 }) + front(k.hero(scoreBig(k, M), esc(dur(M.total))));
          else if (k.size === 'M') body = horizon(k, M, { s: 1, r: 17, cx: 0.70, hy: 90 }) + front(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep')) + k.t('30-night avg ' + k.num(String(M.avg30), 11), 11, null, 'margin-top:4px'));
          else body = horizon(k, M, { s: 1.35, r: 24, cx: 0.64, hy: 206 }) + front(k.stack(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep, ' + M.bed + ' to ' + M.wake)) +
            k.foot(M.src, M.parts.map(function (p) { return k.fact(p[0], String(p[1])); }).join(''))));
          return k.root('ts2-sleepScore-C', 'Sleep score last night: ' + M.today + ', from ' + dur(M.total) + ' asleep. 30-night average ' + M.avg30 + '.',
            k.head('sleep', T.sleep, 'Sleep score', k.size === 'S' ? '' : 'Last night'), body);
        }
      },
      {
        key: 'D', name: 'Week',

        options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = scoreModel(ctx.data), body;
          if (k.size === 'S') body = k.stack(k.hero(scoreBig(k, M), '7-night avg ' + M.avg7) + weekPlates(k, M, k.cw, 4, 30, true));
          else if (k.size === 'M') body = k.split(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep')) + k.t('7-night avg ' + k.num(String(M.avg7), 11), 11),
            '<div style="display:flex;align-items:center;height:100%">' + weekPlates(k, M, k.cw - 112, 7, 44, true) + '</div>', 96);
          else body = k.stack(k.hero(scoreBig(k, M), esc(dur(M.total) + ' asleep, ' + M.bed + ' to ' + M.wake)) + weekPlates(k, M, k.cw, 7, 50, true, 2) +
            k.foot(M.src, k.fact('7-night avg', String(M.avg7)) + k.fact('30-night avg', String(M.avg30))));
          return k.root('ts2-sleepScore-D', 'Sleep scores, last ' + (k.size === 'L' ? 14 : k.size === 'S' ? 4 : 7) + ' nights: ' + M.series.slice(k.size === 'L' ? -14 : k.size === 'S' ? -4 : -7).join(', ') + '. Last night ' + M.today + '.',
            k.head('sleep', T.sleep, 'Sleep score', k.size === 'S' ? '' : k.size === 'L' ? '14 nights' : '7 nights'), body);
        }
      }
    ]
  };

  /* =====================================================================
     MINDFUL MINUTES  (calm violet; stacked, layered, quiet)
     ===================================================================== */
  /* the Day option's label reads in the Settings clock each time the editor shows it */
  function dayChoice() { let c = ['day', '']; Object.defineProperty(c, 1, { enumerable: true, get: function () { return clock(6).replace(':00 AM', ' AM') + ' to ' + clock(22).replace(':00 PM', ' PM'); } }); return c; }
  function mindModel(d, n) {
    let m = d.mindful, v = m.series.slice(-n), met = v.filter(function (x) { return x >= m.goal; }).length;
    return { src: m.source || '', total: m.today, goal: m.goal, sessions: m.sessions.map(function (x) { return withClock(x, ['at']); }), vals: v, met: met, n: n, week: Math.round(sum(m.series.slice(-7))), avg: avg(v) };
  }
  function mindBig(k, M, px) { return k.big(M.total + k.unit('min'), px); }
  function goalLine(M) { let d = M.total - M.goal; return d >= 0 ? (d ? d + ' min past your goal' : 'Goal reached') : (-d) + ' min to your goal'; }
  function sessionRows(k, M, px, lh) {
    return M.sessions.map(function (s) { return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;line-height:' + (lh || 20) + 'px">' + k.t(esc(s.at), lh ? 13 : 11) + '<span style="white-space:nowrap">' + k.num(s.min + ' min', px) + '</span></div>'; }).join('');
  }

  /* A. ripples: a recessed pool; each session lays a raised disc, the latest on top; the dashed ring is the goal */
  function ripples(k, M, D, rings, goal) {
    let T = k.T, c = T.sleep, c2 = mixc(c, T.surface, k.dark ? 0.42 : 0.5), R = D / 2, Rm = R - Math.max(4, D * 0.07), top = Math.max(M.goal, M.total, 1), list = [], acc = 0;
    if (rings === 'total') list = [M.total]; else M.sessions.forEach(function (s) { acc += s.min; list.push(acc); });
    return k.svg(D, D, [c, c2], function (u) {
      let out = k.wellC(u, R, R, R), discs = '';
      list.slice().reverse().forEach(function (v, i, a) { discs += k.rC(u, R, R, Math.max(3, Math.sqrt(v / top) * Rm), i === a.length - 1 ? 0 : 1); });
      out += k.lift(u, discs);
      if (goal !== 'hide') out += '<circle cx="' + fx(R) + '" cy="' + fx(R) + '" r="' + fx(Math.sqrt(M.goal / top) * Rm) + '" fill="none" stroke="' + (k.dark ? '#FFFFFF' : T.text) + '" stroke-opacity="' + (k.dark ? 0.5 : 0.35) + '" stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round"/>';
      return out;
    });
  }

  /* B. day line: one recessed groove from morning to night, a raised bead for each session at its time */
  function dayLine(k, M, W, span, labels) {
    let T = k.T, c = T.sleep, t0 = span === 'full' ? 0 : 6, t1 = span === 'full' ? 24 : 22, ty = 22, th = 10, pad = 10, H = 52;
    let x = function (t) { return pad + (t - t0) / (t1 - t0) * (W - 2 * pad); };
    return k.svg(W, H, [c], function (u) {
      let out = k.wellR(u, 0, ty, W, th, th / 2), beads = '', marks = span === 'full' ? (W < 200 ? [0, 12, 24] : [0, 6, 12, 18, 24]) : (W < 200 ? [6, 14, 22] : [6, 12, 18, 22]);
      marks.forEach(function (h, i) { out += k.st(i === 0 ? 0 : i === marks.length - 1 ? W : x(h), H - 2, hourLabel(h, W < 200), i === 0 ? 'start' : i === marks.length - 1 ? 'end' : 'middle'); });
      M.sessions.forEach(function (s) {
        let cx = x(parseClock(s.at0 || s.at));
        beads += k.rC(u, cx, ty + th / 2, 8, 0);
        out += k.st(cx, 10, labels === 'time' ? s.at.replace(' AM', 'a').replace(' PM', 'p') : s.min + ' min', 'middle', { fill: T.text, w: 600 });
      });
      return out + k.lift(u, beads);
    });
  }

  /* C. calm days: a recessed cup per day; a raised disc inside sized by the minutes, full colour when the goal was met */
  function calmDays(k, M, W, R, mark, xl, values) {
    let T = k.T, c = T.sleep, n = M.n, pitch = W / n, vmax = Math.max(M.goal, mx(M.vals), 1), lab = k.dayLabels.slice(-n), H = 2 * R + 2 + (xl ? 16 : 0) + (values ? 16 : 0);
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.45 : 0.5)], function (u) {
      let out = '', discs = '', i;
      for (i = 0; i < n; i++) {
        let cx = pitch * i + pitch / 2, cy = R + 1, v = M.vals[i], met = v >= M.goal, last = i === n - 1;
        out += k.wellC(u, cx, cy, R);
        let rr = mark === 'goal' ? (met ? R - 2.5 : 0) : (v > 0 ? Math.max(2.5, Math.sqrt(v / vmax) * (R - 2.5)) : 0);
        if (rr > 0) discs += k.rC(u, cx, cy, rr, met ? 0 : 1);
        if (xl) out += k.st(cx, 2 * R + 16, pitch > 40 ? lab[i] : lab[i].charAt(0), 'middle', last ? { fill: T.text, w: 600 } : null);
        if (values) out += k.st(cx, H - 1, String(v), 'middle', { num: true, fill: last ? T.text : T.muted, w: last ? 700 : 600 });
      }
      return out + k.lift(u, discs);
    });
  }

  /* D. meter: one segment per minute in a recessed track; session minutes rise, the goal is a notch above */
  function meter(k, M, W, h) {
    let T = k.T, c = T.sleep, top = Math.max(M.goal, M.total), per = top <= 20 ? 1 : top <= 40 ? 2 : 5, n = Math.ceil(top / per), gap = W / n > 14 ? 3 : 2, pad = 3, pitch = (W - 2 * pad + gap) / n, sz = pitch - gap, H = h + 8;
    let bounds = [], acc = 0; M.sessions.forEach(function (s) { acc += s.min; bounds.push(acc); });
    return k.svg(W, H, [mixc(c, T.surface, k.dark ? 0.42 : 0.48), c], function (u) {
      let out = k.wellR(u, 0, 8, W, h, Math.min(10, h / 2)), segs = '', i;
      for (i = 0; i < n; i++) {
        let m = (i + 1) * per, x = pad + i * pitch, si = 0;
        while (si < bounds.length - 1 && m > bounds[si]) si++;
        if (m <= M.total + per - 1) segs += k.rR(u, x, 8 + pad, sz, h - 2 * pad, Math.min(5, sz / 2.5, (h - 2 * pad) / 2), si === bounds.length - 1 ? 1 : 0);
      }
      let gx = pad + Math.min(n, M.goal / per) * pitch - gap / 2;
      out += k.lift(u, segs) + '<path d="M' + fx(gx - 4) + ' 0L' + fx(gx + 4) + ' 0L' + fx(gx) + ' 5Z" fill="' + T.text + '" fill-opacity="' + (k.dark ? 0.8 : 0.7) + '"/>';
      return out;
    });
  }

  let mindfulTile = {
    id: 'mindful', title: 'Mindful minutes', group: 'Recovery & Sleep',

    versions: [
      {
        key: 'A', name: 'Ripples',

        options: [
          { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] },
          { id: 'rings', label: 'Discs', choices: [['sessions', 'Per session'], ['total', 'Day total']] },
          { id: 'goal', label: 'Goal ring', choices: [['show', 'Show'], ['hide', 'Hide']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = mindModel(ctx.data, 7), body;
          if (k.size === 'S') body = k.stack(k.hero(mindBig(k, M), 'of ' + M.goal + ' min goal') + '<div style="display:flex;justify-content:space-between;align-items:flex-end">' + k.t(M.sessions.length + ' sessions', 11) + ripples(k, M, 60, o.rings, o.goal) + '</div>');
          else if (k.size === 'M') body = k.split(k.hero(mindBig(k, M), 'of ' + M.goal + ' min goal') + k.t('This week ' + k.num(M.week + ' min', 11), 11),
            '<div style="display:flex;align-items:center;gap:16px">' + ripples(k, M, 96, o.rings, o.goal) + '<div style="flex:1 1 auto;min-width:0">' + sessionRows(k, M, 13) + '</div></div>', 112);
          else body = k.stack(k.hero(mindBig(k, M), esc(goalLine(M))) + '<div style="display:flex;align-items:center;gap:24px">' + ripples(k, M, 150, o.rings, o.goal) + '<div style="flex:1 1 auto;min-width:0">' + sessionRows(k, M, 13, 26) + '</div></div>' +
            k.foot(M.src, k.fact('This week', M.week + ' min')));
          return k.root('ts2-mindful-A', 'Mindful minutes today: ' + M.total + ' of a ' + M.goal + ' minute goal, in ' + M.sessions.length + ' sessions: ' + M.sessions.map(function (s) { return s.min + ' minutes at ' + s.at; }).join(', ') + '.',
            k.head('mindful', T.sleep, 'Mindful minutes', k.size === 'S' ? '' : 'Today'), body);
        }
      },
      {
        key: 'B', name: 'Day line',

        options: [
          { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small']] },
          { id: 'span', label: 'Day', choices: [dayChoice(), ['full', '24 hours']] },
          { id: 'labels', label: 'Bead labels', choices: [['min', 'Minutes'], ['time', 'Times']] }
        ],
        sizes: ['S', 'M'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = mindModel(ctx.data, 7), body;
          if (k.size === 'S') body = k.stack(k.hero(mindBig(k, M), 'of ' + M.goal + ' min goal') + dayLine(k, M, k.cw, o.span, o.labels));
          else body = k.stack(k.hero(mindBig(k, M), esc(goalLine(M))) + dayLine(k, M, k.cw, o.span, o.labels));
          return k.root('ts2-mindful-B', 'Mindful minutes today: ' + M.total + ' of a ' + M.goal + ' minute goal. Sessions at ' + M.sessions.map(function (s) { return s.at + ' for ' + s.min + ' minutes'; }).join(' and ') + '.',
            k.head('mindful', T.sleep, 'Mindful minutes', k.size === 'S' ? '' : 'Today'), body);
        }
      },
      {
        key: 'C', name: 'Calm days',

        options: [
          { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] },
          { id: 'mark', label: 'Discs', choices: [['size', 'Size by minutes'], ['goal', 'Goal met']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = mindModel(ctx.data, 7), body, cnt = 'Goal met ' + M.met + ' of 7';
          if (k.size === 'S') body = k.stack(k.hero(mindBig(k, M), cnt) + calmDays(k, M, k.cw, 8.5, o.mark, true, false));
          else if (k.size === 'M') body = k.split(k.hero(mindBig(k, M), cnt) + k.t('Avg ' + k.num(Math.round(M.avg) + ' min', 11) + ' a day', 11), calmDays(k, M, k.cw - 136, 12.5, o.mark, true, false), 120);
          else body = k.stack(k.hero(mindBig(k, M), 'of ' + M.goal + ' min goal today') + calmDays(k, M, k.cw, 21, o.mark, true, true) +
            k.foot(M.src, k.fact('Goal met', M.met + ' of 7 days')));
          return k.root('ts2-mindful-C', 'Mindful minutes today: ' + M.total + '. Goal of ' + M.goal + ' minutes met on ' + M.met + ' of the last 7 days, averaging ' + Math.round(M.avg) + ' minutes a day.',
            k.head('mindful', T.sleep, 'Mindful minutes', k.size === 'S' ? '' : '7 days'), body);
        }
      },
      {
        key: 'D', name: 'Meter',

        options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small']] }],
        sizes: ['S', 'M'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, M = mindModel(ctx.data, 7), body, cols = [mixc(T.sleep, T.surface, k.dark ? 0.42 : 0.48), T.sleep];
          let key = '<div style="display:flex;gap:16px">' + M.sessions.map(function (s, i) { return '<div style="font:500 11px/14px ' + k.fb + ';color:' + T.muted + ';white-space:nowrap">' + k.swatch(cols[i === M.sessions.length - 1 ? 1 : 0]) + esc(s.at) + ' ' + k.num(s.min + ' min', 11) + '</div>'; }).join('') + '</div>';
          if (k.size === 'S') body = k.stack(k.hero(mindBig(k, M), esc(goalLine(M).replace(' your goal', ' goal'))) + meter(k, M, k.cw, 26));
          else body = k.stack(k.hero(mindBig(k, M), esc(goalLine(M))) +
            '<div>' + meter(k, M, k.cw, 28) + '<div style="margin-top:8px">' + key + '</div></div>');
          return k.root('ts2-mindful-D', 'Mindful minutes today: ' + M.total + ' of a ' + M.goal + ' minute goal, ' + goalLine(M) + '.', k.head('mindful', T.sleep, 'Mindful minutes', k.size === 'S' ? '' : 'Today'), body);
        }
      }
    ]
  };

  /* =====================================================================
     HRV + RESTING HEART RATE  (always against the person's own 28-day range)
     ===================================================================== */
  function bandModel(m, n) {
    let v = m.series.slice(-n), b = m.band, t = m.today, key = t > b[1] ? 'above' : t < b[0] ? 'below' : 'in';
    return { vals: v, band: b, today: t, unit: m.unit, src: m.source, n: n, key: key,
      short: key === 'in' ? 'In your usual range' : key === 'above' ? 'Above your range' : 'Below your range',
      inBand: v.filter(function (x) { return x >= b[0] && x <= b[1]; }).length, avg7: Math.round(avg(m.series.slice(-7))), avgN: Math.round(avg(v)), bandText: b[0] + ' to ' + b[1] };
  }
  function bandBig(k, B, px) { return k.big(B.today + k.unit(B.unit), px); }
  function knob(k, u, x, y, r, gi) { return '<circle cx="' + fx(x) + '" cy="' + fx(y) + '" r="' + fx(r) + '" fill="' + k.plateFill + '"/>' + k.rC(u, x, y, r - Math.max(2, r * 0.3), gi); }

  /* HRV A. band line: your range is a recessed channel, the nights run through it as one raised line */
  function bandLine(k, B, W, H, gl) {
    let c = k.T.recovery, n = B.n, pr = gl ? 22 : 0, pad = 8, air = Math.max(3, Math.round((B.band[1] - B.band[0]) * 0.45));
    let lo = Math.min(mn(B.vals), B.band[0]) - air, hi = Math.max(mx(B.vals), B.band[1]) + air, y = function (v) { return pad + (hi - v) / (hi - lo) * (H - 2 * pad); };
    let xs = B.vals.map(function (v, j) { return 6 + j * (W - pr - 12) / (n - 1); });
    return k.svg(W, H, [c], function (u) {
      let out = k.wellR(u, 0, y(B.band[1]), W - pr, y(B.band[0]) - y(B.band[1]), 9);
      if (gl) out += k.st(W, y(B.band[1]) + 4, String(B.band[1]), 'end', { num: true }) + k.st(W, y(B.band[0]) + 4, String(B.band[0]), 'end', { num: true });
      let d = '', pen = false; B.vals.forEach(function (v, j) { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + fx(xs[j]) + ' ' + fx(y(v)); pen = true; }); /* a day with no reading breaks the line */
      out += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#' + u + '-lift)"/>';
      out += k.lift(u, knob(k, u, xs[n - 1], y(B.today), 6.5, 0));
      return out;
    });
  }
  /* HRV B. range scale: a recessed rule, your range raised on it as a soft plate, last night a raised knob */
  function rangeScale(k, B, W) {
    let T = k.T, c = T.recovery, bw = B.band[1] - B.band[0], d0 = Math.min(B.band[0] - bw * 0.75, B.today - 4), d1 = Math.max(B.band[1] + bw * 0.75, B.today + 4), H = 46, cy = 12;
    let x = function (v) { return 12 + (v - d0) / (d1 - d0) * (W - 24); };
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.5 : 0.55)], function (u) {
      let out = k.wellR(u, 0, cy - 5, W, 10, 5);
      out += k.lift(u, k.rR(u, x(B.band[0]), cy - 5, x(B.band[1]) - x(B.band[0]), 10, 5, 1));
      out += k.st(x(B.band[0]), H - 2, String(B.band[0]), 'middle', { num: true }) + k.st(x(B.band[1]), H - 2, String(B.band[1]), 'middle', { num: true });
      out += k.lift(u, knob(k, u, x(B.today), cy, 11, 0));
      return out;
    });
  }
  /* HRV C. your nights: every night a raised dot stacked by value; your range is a recessed bay behind them */
  function nightDots(k, B, W, H, rcap) {
    let T = k.T, c = T.recovery, lo = Math.min(mn(B.vals), B.band[0]), hi = Math.max(mx(B.vals), B.band[1]), ax = 16, base = H - ax, cols = hi - lo + 1, pitch = (W - 8) / cols, counts = {}, maxS = 1;
    B.vals.forEach(function (v) { if (v == null) return; let q = v - lo; counts[q] = (counts[q] || 0) + 1; if (counts[q] > maxS) maxS = counts[q]; });
    let r = Math.max(2, Math.min(rcap, pitch / 2 - 0.8, (base - 8) / maxS / 2 - 1)), step = 2 * r + 2, xq = function (q) { return 4 + (q + 0.5) * pitch; };
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.42 : 0.5), mixc(T.ghost, T.surface, k.dark ? 0.1 : 0.3)], function (u) {
      let out = k.wellR(u, xq(B.band[0] - lo) - pitch / 2 - 2, 0, (B.band[1] - B.band[0] + 1) * pitch + 4, base, 10), dots = '', filled = {};
      out += k.st(xq(B.band[0] - lo), H - 2, String(B.band[0]), 'middle', { num: true }) + k.st(xq(B.band[1] - lo), H - 2, String(B.band[1]), 'middle', { num: true });
      B.vals.map(function (v, j) { return j; }).reverse().forEach(function (j) {
        let v = B.vals[j]; if (v == null) return; let q = v - lo, s = filled[q] || 0, inB = v >= B.band[0] && v <= B.band[1]; filled[q] = s + 1;
        dots += k.rC(u, xq(q), base - 4 - r - s * step, r, j === B.vals.length - 1 ? 0 : inB ? 1 : 2);
      });
      return out + k.lift(u, dots);
    });
  }
  /* HRV D. columns: each night a raised column; your range is a recessed band behind them, nights outside it are left quiet */
  function hrvCols(k, B, W, H, gl, xl) {
    let T = k.T, c = T.recovery, n = B.n, pr = gl ? 22 : 0, pb = xl ? 18 : 0, ph = H - pb, bw0 = B.band[1] - B.band[0];
    let lo = Math.min(mn(B.vals), B.band[0]) - bw0 * 0.4, hi = Math.max(mx(B.vals), B.band[1]) + bw0 * 0.15, y = function (v) { return 2 + (hi - v) / (hi - lo) * (ph - 4); };
    let pitch = (W - pr) / n, bw = Math.max(4, Math.min(16, pitch * 0.5)), lab = k.dayLabels.slice(-n);
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.42 : 0.5), mixc(T.ghost, T.surface, k.dark ? 0.1 : 0.3)], function (u) {
      let out = k.wellR(u, 0, y(B.band[1]), W - pr, y(B.band[0]) - y(B.band[1]), 8), cols = '', i;
      if (gl) out += k.st(W, y(B.band[1]) + 4, String(B.band[1]), 'end', { num: true }) + k.st(W, y(B.band[0]) + 4, String(B.band[0]), 'end', { num: true });
      for (i = 0; i < n; i++) {
        let cx = i * pitch + pitch / 2, v = B.vals[i], top = y(v), last = i === n - 1, inB = v >= B.band[0] && v <= B.band[1];
        if (v != null) cols += k.rR(u, cx - bw / 2, top, bw, ph - top, Math.min(bw / 2, 5), last ? 0 : inB ? 1 : 2);
        if (xl) out += k.st(cx, H - 2, pitch > 36 ? lab[i] : lab[i].charAt(0), 'middle', last ? { fill: T.text, w: 600 } : null);
      }
      return out + k.lift(u, cols);
    });
  }

  let hrvTile = {
    id: 'hrv', title: 'HRV', group: 'Recovery & Sleep',

    versions: [
      {
        key: 'A', name: 'Band line',

        options: [
          { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] },
          { id: 'range', label: 'Range', choices: [['14', '14 nights'], ['30', '30 nights']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, n = +o.range || 14, B = bandModel(ctx.data.hrv, n), body;
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B), B.short) + bandLine(k, B, k.cw, 52, false));
          else if (k.size === 'M') body = k.split(k.hero(bandBig(k, B), B.short), bandLine(k, B, k.cw - 132, 100, true), 116);
          else body = k.stack(k.hero(bandBig(k, B), B.short) + bandLine(k, B, k.cw, 160, true) +
            k.foot(B.src, k.fact('7-night average', B.avg7 + ' ms')));
          return k.root('ts2-hrv-A', 'Heart rate variability last night: ' + B.today + ' milliseconds, ' + B.short.toLowerCase() + ' of ' + B.bandText + '. ' + B.inBand + ' of the last ' + n + ' nights in range.',
            k.head('pillar-recovery', T.recovery, 'HRV', k.size === 'S' ? '' : n + ' nights'), body);
        }
      },
      {
        key: 'B', name: 'Range bar',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] }],
        sizes: ['S', 'M'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, B = bandModel(ctx.data.hrv, 30), body;
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B), B.short) + rangeScale(k, B, k.cw));
          else body = k.split(k.hero(bandBig(k, B), B.short) + k.t('7-night avg ' + k.num(B.avg7 + ' ms', 11), 11), k.t('Your 28-day range, ms', 11, null, 'margin-bottom:12px') + rangeScale(k, B, k.cw - 132), 116);
          return k.root('ts2-hrv-B', 'Heart rate variability last night: ' + B.today + ' milliseconds, ' + B.short.toLowerCase() + ' of ' + B.bandText + '.',
            k.head('pillar-recovery', T.recovery, 'HRV', k.size === 'S' ? '' : 'Last night'), body);
        }
      },
      {
        key: 'C', name: 'Your nights',

        options: [
          { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] },
          { id: 'range', label: 'Range', choices: [['30', '30 nights'], ['14', '14 nights']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, n = +o.range || 30, B = bandModel(ctx.data.hrv, n), body, cnt = B.inBand + ' of ' + n + ' in range';
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B), B.short) + nightDots(k, B, k.cw, 52, 3.5));
          else if (k.size === 'M') body = k.split(k.hero(bandBig(k, B), B.short) + k.t(cnt, 11), nightDots(k, B, k.cw - 132, k.bh, 5), 116);
          else body = k.stack(k.hero(bandBig(k, B), B.short) + nightDots(k, B, k.cw, 152, 7) +
            k.foot(B.src, k.fact('In range', B.inBand + ' of ' + n + ' nights')));
          return k.root('ts2-hrv-C', 'Heart rate variability last night: ' + B.today + ' milliseconds. ' + B.inBand + ' of the last ' + n + ' nights were in your range of ' + B.bandText + '.',
            k.head('pillar-recovery', T.recovery, 'HRV', k.size === 'S' ? '' : n + ' nights'), body);
        }
      },
      {
        key: 'D', name: 'Columns',

        options: [
          { id: 'size', label: 'Size', choices: [['M', 'Wide'], ['S', 'Small'], ['L', 'Large']] },
          { id: 'range', label: 'Range', choices: [['7', '7 nights'], ['14', '14 nights']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, n = +o.range || 7, B = bandModel(ctx.data.hrv, n), body, cnt = B.inBand + ' of ' + n + ' in range';
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B), B.short) + hrvCols(k, B, k.cw, 52, false, false));
          else if (k.size === 'M') body = k.split(k.hero(bandBig(k, B), B.short) + k.t(cnt, 11), hrvCols(k, B, k.cw - 132, k.bh, true, n <= 7), 116);
          else body = k.stack(k.hero(bandBig(k, B), B.short) + hrvCols(k, B, k.cw, 160, true, true) +
            k.foot(B.src, k.fact('In range', B.inBand + ' of ' + n + ' nights') + k.fact('Avg', B.avgN + ' ms')));
          return k.root('ts2-hrv-D', 'Heart rate variability, last ' + n + ' nights: ' + B.vals.join(', ') + ' milliseconds. Last night ' + B.today + ', ' + B.short.toLowerCase() + ' of ' + B.bandText + '.',
            k.head('pillar-recovery', T.recovery, 'HRV', k.size === 'S' ? '' : n + ' nights'), body);
        }
      }
    ]
  };

  /* RHR A. baseline: your range is a recessed channel; each night a raised capsule stepping up or down from its middle */
  function stems(k, B, W, H, gl) {
    let T = k.T, c = T.recovery, n = B.n, pr = gl ? 22 : 0, pad = 6, mid = (B.band[0] + B.band[1]) / 2, ext = Math.max(B.band[1] - mid + 1.5, mx(B.vals.map(function (v) { return Math.abs(v - mid); })) + 0.5);
    let y = function (v) { return H / 2 - (v - mid) / ext * (H / 2 - pad); }, pitch = (W - pr - 8) / n, bw = Math.max(4, Math.min(8, pitch * 0.5));
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.42 : 0.5)], function (u) {
      let out = k.wellR(u, 0, y(B.band[1]), W - pr, y(B.band[0]) - y(B.band[1]), 9), caps = '', i;
      out += '<rect x="6" y="' + fx(H / 2 - 0.5) + '" width="' + fx(W - pr - 12) + '" height="1" fill="' + (k.dark ? '#FFFFFF' : T.text) + '" fill-opacity="0.12"/>';
      if (gl) out += k.st(W, y(B.band[1]) + 4, String(B.band[1]), 'end', { num: true }) + k.st(W, y(B.band[0]) + 4, String(B.band[0]), 'end', { num: true });
      for (i = 0; i < n; i++) {
        let cx = 4 + i * pitch + pitch / 2, v = B.vals[i], y0 = Math.min(y(v), H / 2), y1 = Math.max(y(v), H / 2), last = i === n - 1;
        if (v == null) continue;
        if (y1 - y0 < bw) { let m = (y0 + y1) / 2; y0 = m - bw / 2; y1 = m + bw / 2; }
        caps += k.rR(u, cx - bw / 2, y0 - (v >= mid ? bw / 2 : 0), bw, y1 - y0 + bw / 2, bw / 2, last ? 0 : 1);
      }
      return out + k.lift(u, caps);
    });
  }
  /* RHR B. dial: a recessed half dial, your range raised on it, last night a raised knob; the number sits inside */
  function rhrDial(k, B, r, sw, px) {
    let T = k.T, c = T.recovery, d0 = B.band[0] - 6, d1 = B.band[1] + 6, W = 2 * r + sw + 16, cy = r + sw / 2 + 8, H = cy + 2, p = function (v) { return Math.max(0, Math.min(1, (v - d0) / (d1 - d0))); };
    let g = k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.55 : 0.66)], function (u) {
      let cx = W / 2, out = '<path d="' + arcPath(cx, cy, r, 0, 1) + '" fill="none" stroke="' + k.well + '" stroke-width="' + sw + '" stroke-linecap="round" filter="url(#' + u + '-sink)"/>';
      out += '<path d="' + arcPath(cx, cy, r, p(B.band[0]), p(B.band[1])) + '" fill="none" stroke="url(#' + u + '-g-1)" stroke-width="' + (sw - 3) + '" stroke-linecap="round" filter="url(#' + u + '-lift)"/>';
      let a = Math.PI * (1 - p(B.today));
      out += k.lift(u, knob(k, u, cx + r * Math.cos(a), cy - r * Math.sin(a), sw / 2 + 4, 0));
      return out;
    });
    return '<div style="position:relative;width:' + fx(W) + 'px;height:' + fx(H) + 'px;flex:none">' + g + '<div style="position:absolute;left:0;right:0;bottom:0;text-align:center">' + bandBig(k, B, px) + '</div></div>';
  }
  /* RHR C. week row: seven recessed slots, each with a raised pip where the night sat in your range; the number above */
  function weekRow(k, B, W, H, numPx, xl) {
    let T = k.T, c = T.recovery, v7 = B.vals.slice(-7), lab = k.dayLabels.slice(-7), pitch = W / 7, sw = 12, top = numPx + 8, bot = xl ? 18 : 0, sh = H - top - bot;
    let lo = Math.min(B.band[0], mn(v7)) - 1, hi = Math.max(B.band[1], mx(v7)) + 1, y = function (v) { return top + 6 + (hi - v) / (hi - lo) * (sh - 12); };
    return k.svg(W, H, [c, mixc(c, T.surface, k.dark ? 0.4 : 0.48)], function (u) {
      let out = '', pips = '', i;
      for (i = 0; i < 7; i++) {
        let cx = pitch * i + pitch / 2, last = i === 6, v = v7[i];
        out += '<text x="' + fx(cx) + '" y="' + fx(numPx) + '" text-anchor="middle" fill="' + (last ? T.text : T.muted) + '" font-family="' + k.fh + '" font-size="' + numPx + '" font-weight="700" style="font-variant-numeric:tabular-nums">' + v + '</text>';
        out += k.wellR(u, cx - sw / 2, top, sw, sh, sw / 2);
        if (v != null) pips += k.rC(u, cx, y(v), sw / 2 - 2, last ? 0 : 1);
        if (xl) out += k.st(cx, H - 2, pitch > 40 ? lab[i] : lab[i].charAt(0), 'middle', last ? { fill: T.text, w: 600 } : null);
      }
      return out + k.lift(u, pips);
    });
  }
  /* RHR D. orbit: thirty nights clockwise round a recessed ring, last night at twelve; a night sits further out the higher it was */
  function orbit(k, B, D) {
    let T = k.T, c = T.recovery, R = D / 2, n = B.vals.length, lo = Math.min(mn(B.vals), B.band[0]), hi = Math.max(mx(B.vals), B.band[1]), tw = Math.max(10, D * 0.13), rm = R - tw / 2 - 2;
    let rr = function (v) { return rm - tw / 2 + 3 + (v - lo) / Math.max(1, hi - lo) * (tw - 6); };
    return k.svg(D, D, [c, mixc(c, T.surface, k.dark ? 0.42 : 0.5)], function (u) {
      let out = '<circle cx="' + fx(R) + '" cy="' + fx(R) + '" r="' + fx(rm) + '" fill="none" stroke="' + k.well + '" stroke-width="' + fx(tw) + '" filter="url(#' + u + '-sink)"/>', dots = '', i;
      out += k.lift(u, '<circle cx="' + fx(R) + '" cy="' + fx(R) + '" r="' + fx(rm - tw / 2 - 5) + '" fill="' + k.plateFill + '"/>');
      for (i = 0; i < n; i++) {
        let j = n - 1 - i, a = -Math.PI / 2 - i / n * 2 * Math.PI, p = polar(R, R, rr(B.vals[j]), a), last = i === 0;
        if (B.vals[j] == null) continue;
        dots += k.rC(u, p[0], p[1], last ? Math.max(3, tw * 0.3) : Math.max(1.6, tw * 0.15), last ? 0 : 1);
      }
      return out + k.lift(u, dots);
    });
  }

  let rhrTile = {
    id: 'rhr', title: 'Resting heart rate', group: 'Recovery & Sleep',

    versions: [
      {
        key: 'A', name: 'Baseline',

        options: [
          { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] },
          { id: 'range', label: 'Range', choices: [['14', '14 nights'], ['7', '7 nights']] }
        ],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, n = +o.range || 14, B = bandModel(ctx.data.rhr, n), body;
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B), B.short) + stems(k, B, k.cw, 52, false));
          else if (k.size === 'M') body = k.split(k.hero(bandBig(k, B), B.short), stems(k, B, k.cw - 132, 100, true), 116);
          else body = k.stack(k.hero(bandBig(k, B), B.short) + stems(k, B, k.cw, 160, true) +
            k.foot(B.src, k.fact('7-night average', B.avg7 + ' bpm')));
          return k.root('ts2-rhr-A', 'Resting heart rate last night: ' + B.today + ' beats per minute, ' + B.short.toLowerCase() + ' of ' + B.bandText + '. ' + B.inBand + ' of the last ' + n + ' nights in range.',
            k.head('heart', T.recovery, k.size === 'S' ? 'Resting HR' : 'Resting heart rate', k.size === 'S' ? '' : n + ' nights'), body);
        }
      },
      {
        key: 'B', name: 'Dial',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] }],
        sizes: ['S', 'M'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, B = bandModel(ctx.data.rhr, 30), body;
          if (k.size === 'S') body = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:space-between">' + rhrDial(k, B, 54, 12, 28) + k.sub(B.short) + '</div>';
          else body = k.split('<div style="display:flex;justify-content:center;align-items:center;height:100%">' + rhrDial(k, B, 62, 14, 28) + '</div>',
            k.sub(B.short, T.text) + k.t('Range ' + k.num(B.bandText, 11) + ' ' + B.unit, 11, null, 'margin-top:4px') + k.t('7-night avg ' + k.num(B.avg7 + ' ' + B.unit, 11), 11, null, 'margin-top:2px'), 158, 18);
          return k.root('ts2-rhr-B', 'Resting heart rate last night: ' + B.today + ' beats per minute, ' + B.short.toLowerCase() + ' of ' + B.bandText + '.',
            k.head('heart', T.recovery, k.size === 'S' ? 'Resting HR' : 'Resting heart rate', k.size === 'S' ? '' : 'Last night'), body);
        }
      },
      {
        key: 'C', name: 'Week row',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, B = bandModel(ctx.data.rhr, 7), body;
          if (k.size === 'S') body = k.stack(k.hero(bandBig(k, B)) + weekRow(k, B, k.cw, 62, 12, false));
          else if (k.size === 'M') body = k.split(k.hero(bandBig(k, B), B.short) + k.t('Avg ' + k.num(B.avg7 + ' ' + B.unit, 11), 11), weekRow(k, B, k.cw - 132, k.bh, 13, true), 116);
          else body = k.stack(k.hero(bandBig(k, B), B.short) + weekRow(k, B, k.cw, 156, 17, true) +
            k.foot(B.src, k.fact('Usual range', B.bandText + ' bpm')));
          return k.root('ts2-rhr-C', 'Resting heart rate, last 7 nights: ' + B.vals.join(', ') + ' beats per minute. Last night ' + B.today + ', ' + B.short.toLowerCase() + '.',
            k.head('heart', T.recovery, k.size === 'S' ? 'Resting HR' : 'Resting heart rate', k.size === 'S' ? '' : '7 nights'), body);
        }
      },
      {
        key: 'D', name: 'Orbit',

        options: [{ id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] }],
        sizes: ['S', 'M'],
        render: function (o, ctx) {
          let k = kit(o, ctx), T = k.T, B = bandModel(ctx.data.rhr, 30), body;
          let face = function (D, px) { return '<div style="position:relative;width:' + D + 'px;height:' + D + 'px;flex:none">' + orbit(k, B, D) + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">' + k.big(String(B.today), px) + '<div style="font:600 11px/12px ' + k.fb + ';color:' + T.muted + '">bpm</div></div></div>'; };
          if (k.size === 'S') body = '<div style="height:100%;display:flex;justify-content:center;align-items:center">' + face(112, 28) + '</div>';
          else body = k.split('<div style="display:flex;align-items:center;height:100%">' + face(114, 28) + '</div>',
            k.sub(B.short, T.text) + k.t('Range ' + k.num(B.bandText, 11) + ' ' + B.unit, 11, null, 'margin-top:4px') + k.t(B.inBand + ' of 30 nights in range', 11, null, 'margin-top:2px'), 130, 20);
          return k.root('ts2-rhr-D', 'Resting heart rate over 30 nights: last night ' + B.today + ' beats per minute, ' + B.short.toLowerCase() + ' of ' + B.bandText + '; ' + B.inBand + ' of 30 nights in range.',
            k.head('heart', T.recovery, k.size === 'S' ? 'Resting HR' : 'Resting heart rate', k.size === 'S' ? '' : '30 nights'), body);
        }
      }
    ]
  };

  let root = (typeof window !== 'undefined' ? window : globalThis);
  root.TS2 = root.TS2 || { tiles: [] }; root.TS2.tiles = root.TS2.tiles || [];
  root.TS2.tiles.push(sleepTile, sleepScoreTile, mindfulTile, hrvTile, rhrTile);
}
