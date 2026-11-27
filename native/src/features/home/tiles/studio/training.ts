// @ts-nocheck -- generated tile drawing code: each style is a pure function from options and data to markup.
/* Home tiles: Volume, Exercise, Active energy and Steps. Each style draws the whole tile (frame, header and body) as markup that ./markup.tsx turns into
   native views and SVG. Materials come from ./depth (one light from above: raised fills, recessed tracks, neutral plates). */
export function install(window) {
  let TS2 = window.TS2, INS = window.INS;

  let F = TS2.type;
  let FH = F.fontHeading.replace(/"/g, "'");
  let FB = F.fontBody.replace(/"/g, "'");
  let MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let DP = TS2.depth;

  /* ---------- small pure helpers ---------- */
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmt(n) { let s = String(Math.round(Math.abs(n))), out = ''; while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); } return (n < 0 ? '−' : '') + s + out; }
  function kfmt(n) { if (n < 1000) return String(Math.round(n)); let v = (n / 1000).toFixed(1); return (v.slice(-2) === '.0' ? v.slice(0, -2) : v) + 'k'; }
  /* Hide numbers (Settings, Privacy): volume labels go through INS.prefs.mask; steps stay */
  function vk(n) { let p = window.INS && window.INS.prefs; return p && p.mask ? p.mask(kfmt(n)) : kfmt(n); }
  function sum(a) { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t; }
  function fin(a) { let o = []; for (let i = 0; i < a.length; i++) if (typeof a[i] === 'number' && isFinite(a[i])) o.push(a[i]); return o; } /* days with no reading are left out */
  function maxOf(a) { a = fin(a); let m = a.length ? a[0] : 0; for (let i = 1; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function minOf(a) { a = fin(a); let m = a.length ? a[0] : 0; for (let i = 1; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  /* units follow Settings, Units (INS.prefs) when it is loaded: the clock, weight (volume is kept in lb), energy (kept in kcal) and
     distance (kept in miles). The tiles have no clock or unit options of their own, so Settings always wins. */
  function PF() { return window.INS && window.INS.prefs; }
  function is24() { let p = PF(); return !!p && p.get('units.clock') === '24'; }
  function hourLabel(h) { if (is24()) return (h < 10 ? '0' : '') + h + ':00'; let x = h % 12 === 0 ? 12 : h % 12; return x + (h < 12 ? ' AM' : ' PM'); }
  function clockStr(hd) { let hr = Math.floor(hd), mi = Math.min(59, Math.round((hd - hr) * 60)), p = PF(); if (p) return p.clk(hr, mi); let x = hr % 12 === 0 ? 12 : hr % 12; return x + ':' + (mi < 10 ? '0' : '') + mi + (hr < 12 ? ' AM' : ' PM'); }
  function wv(lb) { let p = PF(); return p ? p.wtV(lb) : lb; }
  function wu() { let p = PF(); return p ? p.wtU() : 'lb'; }
  function wName() { return wu() === 'kg' ? 'kilograms' : 'pounds'; }
  function eV(kcal) { let p = PF(); return p ? p.enV(kcal) : Math.round(kcal); }
  function ef(kcal) { return fmt(eV(kcal)); }
  function eu() { let p = PF(); return p ? p.enU() : 'kcal'; }
  function eK() { return eu() === 'kJ' ? 4.184 : 1; }
  function distStr(miles) { let p = PF(); return p ? p.dist(miles) : (Math.round(miles * 10) / 10).toFixed(1) + ' mi'; }
  function dateLabel(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function nowHour(D) { return D.now.getHours() + D.now.getMinutes() / 60; }
  function signed(n) { return (n >= 0 ? '+' : '−') + fmt(Math.abs(n)); }
  function quant(sorted, q) { if (!sorted.length) return 0; let p = (sorted.length - 1) * q, i = Math.floor(p), f = p - i; return sorted[i] + ((sorted[i + 1] == null ? sorted[i] : sorted[i + 1]) - sorted[i]) * f; }
  /* '6:22 AM' -> 6.37 (hours as a decimal); dflt when the string is not a clock time */
  function clockH(str, dflt) { let m = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(str || ''); if (!m) return dflt; return (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0) + (+m[2]) / 60; }

  /* SVG text. kind: 'b' body label (Plus Jakarta Sans 600), 'n' numeral (Plus Jakarta Sans 700 tabular). */
  function tx(x, y, s, fill, anchor, kind, size, weight) {
    let num = kind === 'n';
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" fill="' + fill + '" text-anchor="' + (anchor || 'start') + '" font-size="' + (size || 11) + '" font-weight="' + (weight || (num ? ((size || 11) <= 12 ? 600 : 700) : 600)) +
      '" style="font-family:' + (num ? FH : FB) + ';font-variant-numeric:tabular-nums">' + s + '</text>';
  }
  /* hero number with its unit in smaller muted text, as one SVG text run */
  function numSvg(x, y, num, unit, T, fs, anchor) {
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" text-anchor="' + (anchor || 'start') + '" style="font-variant-numeric:tabular-nums"><tspan fill="' + T.text + '" font-size="' + fs + '" font-weight="700" style="font-family:' + FH + ';letter-spacing:' + (fs >= 28 ? '-0.035em' : fs >= 18 ? '-0.018em' : '0') + '">' + num +
      '</tspan>' + (unit ? '<tspan dx="4" fill="' + T.muted + '" font-size="13" font-weight="600" style="font-family:' + FB + '">' + unit + '</tspan>' : '') + '</text>';
  }
  function dot(x, y, r, fill, op) { return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + fill + '"' + (op != null && op < 1 ? ' fill-opacity="' + op + '"' : '') + '/>'; }
  function rect(x, y, w, h, rx, fill, op, extra) { return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(Math.max(0, w)) + '" height="' + r2(Math.max(0, h)) + '" rx="' + r2(Math.max(0, Math.min(rx, w / 2, h / 2))) + '" fill="' + fill + '"' + (op != null && op < 1 ? ' fill-opacity="' + r2(op) + '"' : '') + (extra || '') + '/>'; }
  function ln(x1, y1, x2, y2, stroke, sw, extra) { return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="' + stroke + '" stroke-width="' + (sw || 1) + '"' + (extra || '') + '/>'; }
  function pt(cx, cy, r, deg) { let a = (deg - 90) * Math.PI / 180; return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))]; }
  /* clockwise arc starting at 12 o'clock */
  function arc(cx, cy, r, deg, stroke, sw, op) {
    if (deg <= 0.5) return '';
    let attrs = ' fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round"' + (op != null && op < 1 ? ' stroke-opacity="' + op + '"' : '');
    if (deg >= 359.5) return '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '"' + attrs + '/>';
    let a = pt(cx, cy, r, 0), b = pt(cx, cy, r, deg);
    return '<path d="M' + a[0] + ' ' + a[1] + 'A' + r2(r) + ' ' + r2(r) + ' 0 ' + (deg > 180 ? 1 : 0) + ' 1 ' + b[0] + ' ' + b[1] + '"' + attrs + '/>';
  }
  /* clockwise arc between two angles (degrees from 12 o'clock) */
  function arcAB(cx, cy, r, a0, a1, stroke, sw, cap) {
    if (a1 - a0 <= 0.3) return '';
    let a = pt(cx, cy, r, a0), b = pt(cx, cy, r, a1);
    return '<path d="M' + a[0] + ' ' + a[1] + 'A' + r2(r) + ' ' + r2(r) + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + b[0] + ' ' + b[1] + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="' + (cap || 'round') + '"/>';
  }
  /* full annulus r0..r1 as one even-odd path */
  function annulus(cx, cy, r0, r1, fill) {
    function c(r, sweep) { return 'M' + r2(cx - r) + ' ' + r2(cy) + 'a' + r2(r) + ' ' + r2(r) + ' 0 1 ' + sweep + ' ' + r2(2 * r) + ' 0a' + r2(r) + ' ' + r2(r) + ' 0 1 ' + sweep + ' ' + r2(-2 * r) + ' 0Z'; }
    return '<path d="' + c(r1, 1) + c(r0, 0) + '" fill="' + fill + '" fill-rule="evenodd"/>';
  }
  function dash(x1, y, x2, stroke, pattern) {
    return '<line x1="' + r2(x1) + '" y1="' + r2(y) + '" x2="' + r2(x2) + '" y2="' + r2(y) + '" stroke="' + stroke + '" stroke-width="1" stroke-dasharray="' + (pattern || '3 3') + '"/>';
  }

  /* ---------- materials (shared depth language from tiledepth.js) ----------
     M is set by tile() for the tile being drawn (render stays pure: same input, same string). Shade ladder for the pillar colour:
     0 full colour, 1 receded (past days, second rank), 2 to 5 progressively quieter steps, 6 the neutral plate. */
  let SHADE_T = [0, 0.5, 0.22, 0.4, 0.55, 0.68];
  let M = null;
  function mat(T, C, uid) {
    let dk = DP.isDark(T), plate = dk ? DP.mix(T.surface, '#FFFFFF', 0.08) : '#FFFFFF';
    let cols = SHADE_T.map(function (t) { return t ? DP.mix(C, T.surface, t) : C; }).concat([plate]);
    return { T: T, C: C, dk: dk, uid: uid, cols: cols, plate: plate, extra: '', n: 0, rg: {},
      well: dk ? DP.mix(T.surface, '#000000', 0.3) : DP.mix(T.bg, '#161728', 0.06) };
  }
  function G(i) { return 'url(#' + M.uid + '-g-' + (i || 0) + ')'; }
  /* raised group: soft drop shadow under everything inside; recessed group: inner shadow on the top edge */
  function lift(inner) { return inner ? '<g filter="url(#' + M.uid + '-lift)">' + inner + '</g>' : ''; }
  function sink(inner) { return inner ? '<g filter="url(#' + M.uid + '-sink)">' + inner + '</g>' : ''; }
  /* small coloured halo, only ever behind the end cap of one hero arc or marker */
  function glow(x, y, r) { return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + M.C + '" fill-opacity="' + (M.dk ? 0.55 : 0.35) + '" filter="url(#' + M.uid + '-glow)"/>'; }
  /* top-lit gradient in user space over a ring's box, so an arc is lighter where it faces the light */
  function ringGrad(cx, cy, r, i) {
    i = i || 0;
    let key = i + '|' + r2(cx) + '|' + r2(cy) + '|' + r2(r);
    if (M.rg[key]) return M.rg[key];
    let id = M.uid + '-rg' + (++M.n), c = M.cols[i];
    M.extra += '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + r2(cy - r) + '" x2="0" y2="' + r2(cy + r) + '"><stop offset="0" stop-color="' + DP.mix(c, '#FFFFFF', M.dk ? 0.24 : 0.16) +
      '"/><stop offset=".55" stop-color="' + c + '"/><stop offset="1" stop-color="' + DP.mix(c, '#000000', M.dk ? 0.16 : 0.08) + '"/></linearGradient>';
    return (M.rg[key] = 'url(#' + id + ')');
  }

  /* ---------- shared tile scaffold ----------
     p: { cls, icon, color, title, meta, metaS, aria, num, unit, subS (null = no sub line at S), sub:[line1,line2], src,
          chart(w,h) -> svg inner, stats:[[label,value]x3], numIn (number lives inside the chart), stackM (M uses a top number row) } */
  function tile(o, ctx, p) {
    let T = ctx.T, S = o.size, fr = ctx.frame || TS2.frames[S];
    let iw = fr.w - 32;
    let C = T[p.color];
    M = mat(T, C, String(ctx.uid || p.cls));
    let meta = S === 'S' ? (p.metaS == null ? '' : p.metaS) : (p.meta || '');
    let head = '<div style="display:flex;align-items:center;gap:6px;height:20px;">' +
      '<span style="flex:none;display:flex;align-items:center;width:18px;height:20px;">' + ctx.icon(p.icon, 18, C) + '</span>' +
      '<span style="flex:1;min-width:0;font:600 14px/20px ' + FB + ';color:' + T.text + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.title + '</span>' +
      (meta ? '<span style="flex:none;font:500 13px/20px ' + FB + ';color:' + T.muted + ';white-space:nowrap;font-variant-numeric:tabular-nums;">' + meta + '</span>' : '') + '</div>';
    function numHtml(px, lh) {
      return '<div style="height:' + lh + 'px;white-space:nowrap;"><span style="font:700 ' + px + 'px/' + lh + 'px ' + FH + ';color:' + T.text + ';font-variant-numeric:tabular-nums;letter-spacing:' + (px >= 28 ? '-0.035em' : px >= 18 ? '-0.018em' : '0') + ';">' + p.num + '</span>' +
        '<span style="font:600 13px/' + lh + 'px ' + FB + ';color:' + T.muted + ';margin-left:4px;">' + p.unit + '</span></div>';
    }
    function svg(w, h) {
      let inner = p.chart(w, h), defs = DP.defs(T, M.uid, M.cols);
      defs = defs.slice(0, -7) + M.extra + '</defs>';
      return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;overflow:visible;" aria-hidden="true">' + defs + inner + '</svg>';
    }
    function src(mt) { return '<div style="height:14px;margin-top:' + mt + 'px;font:500 11px/14px ' + FB + ';color:' + T.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.src + '</div>'; }
    function line(s, px, lh, col) { return '<div style="height:' + lh + 'px;font:500 ' + px + 'px/' + lh + 'px ' + FB + ';color:' + col + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;">' + s + '</div>'; }
    /* Inner box: S/M 141|326 x 144, L 326 x 288. The body starts 8 pt under the 20 pt header. */
    let body;
    if (S === 'S') {
      if (p.numIn) body = '<div style="margin-top:18px;">' + svg(iw, 96) + '</div>';
      else if (p.subS == null) body = '<div style="margin-top:8px;">' + numHtml(28, 32) + '</div><div style="margin-top:10px;">' + svg(iw, 74) + '</div>';
      else body = '<div style="margin-top:8px;">' + numHtml(28, 32) + line(p.subS, 11, 16, T.muted) + '</div><div style="margin-top:10px;">' + svg(iw, 58) + '</div>';
    } else if (S === 'M') {
      if (p.numIn) {
        body = '<div style="margin-top:18px;">' + svg(iw, 96) + '</div>';
      } else if (p.stackM) {
        body = '<div style="margin-top:8px;display:flex;align-items:baseline;justify-content:space-between;height:32px;">' + numHtml(28, 32) +
          '<span style="font:500 13px/32px ' + FB + ';color:' + T.muted + ';white-space:nowrap;font-variant-numeric:tabular-nums;">' + p.sub[0] + '</span></div>' +
          '<div style="margin-top:10px;">' + svg(iw, 74) + '</div>';
      } else {
        body = '<div style="margin-top:8px;display:flex;gap:12px;height:116px;">' +
          '<div style="flex:none;width:128px;display:flex;flex-direction:column;">' + numHtml(28, 32) +
          '<div style="margin-top:4px;">' + line(p.sub[0], 13, 18, T.text) + line(p.sub[1], 13, 18, T.muted) + '</div>' +
          '</div>' + svg(iw - 140, 116) + '</div>';
      }
    } else {
      let stats = '<div style="margin-top:12px;display:flex;gap:12px;height:40px;border-top:1px solid ' + (M.dk ? 'rgba(255,255,255,.06)' : 'rgba(22,23,40,.07)') + ';box-sizing:border-box;">';
      for (let i = 0; i < p.stats.length; i++) {
        stats += '<div style="flex:1;min-width:0;padding-top:6px;">' + line(p.stats[i][0], 11, 13, T.muted) +
          '<div style="height:20px;font:700 15px/20px ' + FH + ';color:' + T.text + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;">' + p.stats[i][1] + '</div></div>';
      }
      stats += '</div>';
      body = p.numIn
        ? '<div style="margin-top:8px;">' + svg(iw, 184) + '</div>' + stats + src(10)
        : '<div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;height:46px;">' + numHtml(40, 46) +
          '<div style="text-align:right;min-width:0;">' + line(p.sub[0], 13, 20, T.text) + line(p.sub[1], 11, 16, T.muted) + '</div></div>' +
          '<div style="margin-top:10px;">' + svg(iw, 130) + '</div>' + stats + src(10);
    }
    return '<div class="' + p.cls + '" role="img" aria-label="' + p.aria + '" style="box-sizing:border-box;width:' + fr.w + 'px;height:' + fr.h + 'px;border-radius:20px;' + DP.tile(T) +
      'overflow:hidden;position:relative;padding:16px;">' + head + body + '</div>';
  }

  /* ---------- shared chart pieces ---------- */
  /* x-axis labels for a day series: single weekday letters for 7, end dates otherwise. */
  function dayAxis(D, n, w, h, T, xOf) {
    let s = '', labs = D.dayLabels.slice(-n), i;
    if (n === 7) { for (i = 0; i < 7; i++) s += tx(xOf(i), h - 3, labs[i].charAt(0), i === 6 ? T.text : T.muted, 'middle', 'b', 11, i === 6 ? 700 : 600); }
    else { s += tx(0, h - 3, dateLabel(D.days[D.days.length - n]), T.muted, 'start') + tx(w, h - 3, 'Today', T.text, 'end', 'b', 11, 700); }
    return s;
  }
  /* hour axis: labels at 6, 12, 18 inside the hours shown (h0..h1). Labels are kept inside the box. */
  function hourAxis(w, h, T, mode, h0, h1) {
    let s = ''; h0 = h0 || 0; h1 = h1 || 24;
    [6, 12, 18].forEach(function (hr) {
      if (hr < h0 || hr > h1) return;
      let x = (hr - h0) / (h1 - h0) * w, lab = hourLabel(hr, mode), half = lab.length * 3.1 + 1;
      s += tx(Math.max(half, Math.min(w - half, x)), h - 3, lab, T.muted, 'middle');
    });
    return s;
  }
  /* week as capsule gauges: each day a recessed track to a fixed cap, a raised fill to its minutes, a seam cut at the goal */
  function capsWeek(w, h, vals, goal, T, D, labels) {
    let n = vals.length, pitch = w / n, cw = Math.min(12, pitch * 0.46), top = labels ? 16 : 2, base = h - 17, ph = base - top, cap = Math.max(60, maxOf(vals)), wells = '', fills = '', seams = '', lab = '', i;
    let yg = base - goal / cap * ph, ins = 1.5;
    for (i = 0; i < n; i++) {
      let cx = pitch * (i + 0.5), v = vals[i];
      wells += rect(cx - cw / 2, top, cw, ph, cw / 2, M.well);
      if (v > 0) { let fh = Math.max(cw - 2 * ins, Math.min(1, v / cap) * (ph - 2 * ins)); fills += rect(cx - cw / 2 + ins, base - ins - fh, cw - 2 * ins, fh, cw / 2, G(v >= goal ? 0 : 5)); }
      seams += ln(cx - cw / 2 - 1, yg, cx + cw / 2 + 1, yg, T.surface, 2);
      if (labels) lab += tx(cx, top - 6, String(v), i === n - 1 ? T.text : T.muted, 'middle', 'n');
    }
    return sink(wells) + lift(fills) + seams + lab + dayAxis(D, n, w, h, T, function (i) { return pitch * (i + 0.5); });
  }

  let OPT_SIZE3 = { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] };
  let OPT_RANGE = { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] };

  /* =====================================================================
     1. VOLUME (range 7, 14 or 30 days, chosen in the tile tray)
     ===================================================================== */
  let OPT_VRANGE = { id: 'range', label: 'Range', tray: true, choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] };
  let OPT_VCMP = { id: 'compare', label: 'Compare to previous', choices: [['on', 'On'], ['off', 'Off']] };
  function volN(o) { let n = +o.range; return n === 14 || n === 30 ? n : 7; }
  function signedK(n) { let s = (n >= 0 ? '+' : '−') + kfmt(Math.abs(n)), p = window.INS && window.INS.prefs; return p && p.mask ? p.mask(s) : s; }
  /* Everything follows the range: total, workouts, rest days, biggest day, the previous period of the same length and the split by
     muscle group. daily holds 30 days, so the 30 days before are estimated from the daily rate of the earliest two weeks; byGroup
     covers the last 7 days, so longer ranges keep its shares. */
  function volFacts(D, n) {
    /* in the weight unit from Settings: every total, plate and label below is in that unit */
    let v = D.volume, dl = v.daily.map(wv), d = dl.slice(-n), days = D.days.slice(-n), labs = D.dayLabels.slice(-n), total = sum(d), sessions = 0, bi = 0, gsum = 0, i;
    for (i = 0; i < n; i++) { if (d[i] > 0) sessions++; if (d[i] > d[bi]) bi = i; }
    let prior = n === 7 ? wv(v.lastWeek) : (n === 14 ? sum(dl.slice(-28, -14)) : Math.round(sum(dl.slice(0, 14)) / 14 * 30 / 10) * 10);
    Object.keys(v.byGroup).forEach(function (k) { gsum += v.byGroup[k]; });
    let groups = Object.keys(v.byGroup).map(function (k) { return [k, Math.round(v.byGroup[k] * total / (gsum || 1) / 10) * 10]; }).sort(function (a, b) { return b[1] - a[1]; });
    return {
      n: n, d: d, days: days, labs: labs, total: total, sessions: sessions, rest: n - sessions, prior: prior, delta: total - prior,
      best: (n === 7 ? labs[bi] : dateLabel(days[bi])) + ' ' + fmt(d[bi]), groups: groups, avg: sessions ? Math.round(total / sessions / 10) * 10 : 0,
      vs: 'vs prior ' + n + ' days', curName: 'Last ' + n + ' days', prevName: 'Prior ' + n + ' days'
    };
  }
  /* The comparison is always a plain signed figure in the normal text colours: never red, never a judgement. */
  function volBase(o, ctx, key, f) {
    let cmp = o.compare !== 'off', rest = f.rest + (f.rest === 1 ? ' rest day' : ' rest days'), wk = f.sessions + (f.sessions === 1 ? ' workout' : ' workouts');
    return {
      cls: 'ts2-volume-' + key, icon: 'volume', color: 'training', title: 'Volume', unit: wu(), num: fmt(f.total), src: 'Logged in Insight',
      meta: f.n + ' days', metaS: f.n + ' days',
      subS: cmp ? signedK(f.delta) + ' ' + wu() + ' ' + f.vs : wk + ', ' + f.rest + ' rest',
      sub: cmp ? [signed(f.delta) + ' ' + wu(), f.vs] : (o.size === 'L' ? [wk + ', ' + rest, 'Top day ' + f.best] : [wk, rest]),
      stats: [['Biggest day', f.best], ['Workouts', String(f.sessions)], ['Rest days', String(f.rest)]],
      aria: fmt(f.total) + ' ' + wName() + ' lifted in the last ' + f.n + ' days across ' + wk + (cmp ? ', ' + fmt(Math.abs(f.delta)) + ' ' + wName() + ' ' + (f.delta >= 0 ? 'more' : 'less') + ' than the ' + f.n + ' days before.' : '.')
    };
  }
  /* A: one recessed slot per day, stacked with raised 1,000 lb plates. Today in full colour, the days before receded; rest days
     leave the slot empty. At 14 or 30 days the plates merge into one raised bar per day and the days before the last week recede
     further, so the most recent week still reads first. */
  function volDays(w, h, S, T, D, f) {
    let n = f.n, v = f.d, lab = S !== 'S', top = lab ? 16 : 2, base = h - 17, mx = maxOf(v) || 1, pitch = w / n, seven = n === 7;
    let ww = seven ? (S === 'S' ? 14 : (S === 'L' ? 28 : 22)) : Math.max(3, Math.min(n > 14 ? 7 : 14, pitch * (n > 14 ? 0.6 : 0.56))), ins = seven ? (S === 'S' ? 2 : 3) : 0;
    let wr = Math.min(seven ? 7 : 4, ww / 2), ph = base - top - 2 * ins, wells = '', fills = '', lbl = '', i, j, bi = 0;
    for (i = 1; i < n; i++) if (v[i] > v[bi]) bi = i;
    for (i = 0; i < n; i++) {
      let cx = pitch * (i + 0.5), today = i === n - 1;
      wells += rect(cx - ww / 2, top, ww, base - top, wr, M.well);
      if (v[i] <= 0) continue;
      let gi = today ? 0 : (i < n - 7 ? 5 : 1);
      if (seven) {
        let pw = ww - 2 * ins, uh = ph * 1000 / mx, cnt = Math.ceil(v[i] / 1000), gp = S === 'S' ? 1.5 : 2;
        for (j = 0; j < cnt; j++) {
          let part = Math.min(1, v[i] / 1000 - j), hh = Math.max(1.5, (uh - gp) * part);
          fills += rect(cx - pw / 2, base - ins - j * uh - hh, pw, hh, Math.min(S === 'S' ? 2 : 3, hh / 2), G(gi));
        }
        if (lab && today) lbl += tx(cx, top - 6, vk(v[i]), T.text, 'middle', 'n', 11, 600);
      } else {
        let bh = Math.max(ww, v[i] / mx * (base - top));
        fills += rect(cx - ww / 2, base - bh, ww, bh, wr, G(gi));
        if (lab && i === bi) { let t = vk(v[i]), hw = t.length * 3.2; lbl += tx(Math.max(hw, Math.min(w - hw, cx)), base - bh - 6, t, T.text, 'middle', 'n', 11, 600); }
      }
    }
    return sink(wells) + lift(fills) + lbl + dayAxis(D, n, w, h, T, function (i) { return pitch * (i + 0.5); });
  }
  /* B: the range as a loaded barbell. The bar is a recessed groove, each muscle group a raised plate on it whose height is its
     volume; the heaviest plate is in full colour. Collars are neutral plates at each end. */
  function volPlates(w, h, S, T, items, labelMode, total) {
    let small = S === 'S', L = S === 'L', top = small ? 2 : 16, lh = 16, ay = top + (h - top - lh) / 2, maxH = Math.min(h - top - lh - 6, L ? 92 : 80), n = items.length, pitch = (w - 16) / n, mx = 0, i;
    let pw = L ? 32 : (small ? 20 : 26), plates = '', lab = '';
    for (i = 0; i < n; i++) mx = Math.max(mx, items[i][1]);
    mx = mx || 1;
    let s = sink(rect(0, ay - 3, w, 6, 3, M.well)) + lift(rect(0, ay - 9, 5, 18, 2, G(6)) + rect(w - 5, ay - 9, 5, 18, 2, G(6)));
    for (i = 0; i < n; i++) {
      let cx = 8 + pitch * (i + 0.5), v = items[i][1], top1 = i === 0, hh = Math.max(12, v / mx * maxH);
      plates += rect(cx - pw / 2, ay - hh / 2, pw, hh, small ? 4 : 6, G(top1 ? 0 : 1));
      if (!small) lab += tx(cx, ay - hh / 2 - 6, labelMode === 'pct' ? Math.round(v / total * 100) + '%' : vk(v), top1 ? T.text : T.muted, 'middle', 'n', 11, top1 ? 600 : 500);
      lab += tx(cx, h - 3, items[i][0], top1 ? T.text : T.muted, 'middle', 'b', 11, top1 ? 700 : 600);
    }
    return s + lift(plates) + lab;
  }
  /* C: this period against the one before. Two recessed tracks on one scale: the current period is a raised bar built from its
     workouts (a seam between each), the previous period a receded solid bar. */
  function volVersus(w, h, S, T, f) {
    let L = S === 'L', small = S === 'S', th = L ? 16 : (small ? 9 : 12), labH = L ? 18 : 14, gap = L ? 20 : (small ? 9 : 16), rowH = labH + (L ? 8 : 6) + th;
    let y0 = Math.max(0, (h - 2 * rowH - gap) / 2), mx = Math.max(f.total, f.prior) || 1, ins = small ? 1.5 : 2, iw = w - 2 * ins, s = '', wells = '', fills = '', seams = '';
    [[f.curName, f.total, true], [f.prevName, f.prior, false]].forEach(function (r, k) {
      let y = y0 + k * (rowH + gap), ty = y + labH - 3, ry = y + rowH - th, fw = Math.max(th - 2 * ins, r[1] / mx * iw), fy = ry + ins, fh = th - 2 * ins;
      s += tx(0, ty, small ? (r[2] ? 'Now' : 'Before') : r[0], r[2] ? T.text : T.muted, 'start', 'b', L ? 13 : 11, r[2] ? 600 : 500) +
        tx(w, ty, small ? vk(r[1]) : fmt(r[1]) + ' ' + wu(), r[2] ? T.text : T.muted, 'end', 'n', L ? 15 : (small ? 11 : 13), r[2] ? 600 : 500);
      wells += rect(0, ry, w, th, th / 2, M.well);
      if (r[1] <= 0) return;
      fills += rect(ins, fy, fw, fh, fh / 2, G(r[2] ? 0 : 1));
      if (r[2]) {
        let acc = 0;
        for (let i = 0; i < f.d.length; i++) {
          if (f.d[i] <= 0) continue;
          acc += f.d[i];
          let x = ins + acc / f.total * fw;
          if (acc < f.total && fw * f.d[i] / f.total >= 4) seams += ln(x, fy, x, fy + fh, T.surface, small ? 1.25 : 1.5);
        }
      }
    });
    return s + sink(wells) + lift(fills) + seams;
  }
  /* D: a calendar of dots. Weeks in rows ending today, each training day a raised disc whose area grows with its volume and each
     rest day a small recessed pit, so the rhythm of the weeks and the big days read together. Today is ringed. */
  function volDots(w, h, S, T, D, f) {
    let n = f.n, rows = Math.ceil(n / 7), lead = rows * 7 - n, small = S === 'S', letters = !(small && rows > 2), one = rows === 1 && S === 'L';
    let top = letters ? 16 : 0, foot = one ? 18 : 0, pw = w / 7, ph = Math.min(pw, (h - top - foot) / rows), cap = Math.min(pw, ph) / 2;
    let rmax = cap - (rows > 2 ? 1.5 : 2.5), rmin = Math.max(2.5, rmax * 0.36), mx = maxOf(f.d) || 1, gy0 = top + Math.max(0, (h - top - foot - rows * ph) / 2);
    let labs = D.dayLabels.slice(-7), wells = '', fills = '', marks = '', j;
    if (letters) for (j = 0; j < 7; j++) marks += tx(pw * (j + 0.5), 11, labs[j].charAt(0), j === 6 ? T.text : T.muted, 'middle', 'b', 11, j === 6 ? 700 : 600);
    for (j = 0; j < n; j++) {
      let k = j + lead, cx = (k % 7 + 0.5) * pw, cy = gy0 + (Math.floor(k / 7) + 0.5) * ph, v = f.d[j], today = j === n - 1, r = rmin + (rmax - rmin) * Math.sqrt(Math.max(0, v) / mx);
      if (v <= 0) wells += dot(cx, cy, Math.max(2, rmax * 0.24), M.well);
      else fills += dot(cx, cy, r, G(today ? 0 : (j < n - 7 ? 5 : 1)));
      if (today) marks += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2((v > 0 ? r : 3) + 2.5) + '" fill="none" stroke="' + T.text + '" stroke-width="1.25" stroke-opacity="0.7"/>';
      if (one) marks += tx(cx, cy + cap + 13, v > 0 ? vk(v) : 'Rest', today ? T.text : T.muted, 'middle', v > 0 ? 'n' : 'b', 11, today ? 600 : 500);
    }
    return sink(wells) + lift(fills) + marks;
  }

  TS2.tiles.push({
    id: 'volume', title: 'Volume', group: 'Training',

    versions: [
      {
        key: 'A', name: 'Plate bars',

        options: [OPT_SIZE3, OPT_VRANGE, OPT_VCMP],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = volFacts(ctx.data, volN(o)), p = volBase(o, ctx, 'A', f), T = ctx.T;
          p.chart = function (w, h) { return volDays(w, h, o.size, T, ctx.data, f); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'B', name: 'Loaded bar',

        options: [OPT_SIZE3, OPT_VRANGE, { id: 'labels', label: 'Plate labels', choices: [['lb', 'Weight'], ['pct', 'Share of total']] }, OPT_VCMP],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = volFacts(ctx.data, volN(o)), p = volBase(o, ctx, 'B', f), T = ctx.T, items = o.size === 'S' ? f.groups.slice(0, 3) : f.groups;
          p.stackM = true;
          p.subS = null;
          if (o.compare !== 'off' && o.size === 'M') p.sub[0] = signed(f.delta) + ' ' + wu() + ' ' + f.vs;
          p.stats[1] = ['Top group', f.groups[0][0]];
          p.chart = function (w, h) { return volPlates(w, h, o.size, T, items, o.labels, f.total || 1); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'C', name: 'Versus',

        options: [OPT_SIZE3, OPT_VRANGE],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = volFacts(ctx.data, volN(o)), p = volBase(o, ctx, 'C', f), T = ctx.T, pct = f.prior ? Math.round(Math.abs(f.delta) / f.prior * 100) : 0;
          p.subS = null;
          p.sub = [signed(f.delta) + ' ' + wu(), pct + '% ' + (f.delta >= 0 ? 'more' : 'less') + ' lifted'];
          p.stats = [['Workouts', String(f.sessions)], ['Per workout', fmt(f.avg) + ' ' + wu()], ['Biggest day', f.best]];
          p.chart = function (w, h) { return volVersus(w, h, o.size, T, f); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'D', name: 'Dot calendar',

        options: [OPT_SIZE3, OPT_VRANGE, OPT_VCMP],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = volFacts(ctx.data, volN(o)), p = volBase(o, ctx, 'D', f), T = ctx.T;
          p.subS = null;
          p.chart = function (w, h) { return volDots(w, h, o.size, T, ctx.data, f); };
          return tile(o, ctx, p);
        }
      }
    ]
  });

  /* =====================================================================
     2. EXERCISE
     ===================================================================== */
  function exFacts(D) {
    let e = D.exercise, w7 = e.series.slice(-7), met = 0, streak = 0, i;
    for (i = 0; i < 7; i++) if (w7[i] >= e.goal) met++;
    for (i = e.series.length - 1; i >= 0 && e.series[i] >= e.goal; i--) streak++;
    let clusters = [], cur = null;
    for (i = 0; i < 24; i++) {
      if (e.hourly[i] > 0) { if (!cur) { cur = { from: i, to: i, min: 0, peak: i }; clusters.push(cur); } cur.to = i; cur.min += e.hourly[i]; if (e.hourly[i] > e.hourly[cur.peak]) cur.peak = i; }
      else cur = null;
    }
    return { w7: w7, met: met, streak: streak, clusters: clusters, avg: Math.round(sum(w7) / 7), over: e.today - e.goal };
  }
  function exBase(o, ctx, key, f) {
    let e = ctx.data.exercise;
    return {
      cls: 'ts2-exercise-' + key, icon: 'timer', color: 'training', title: 'Exercise', unit: 'min', num: String(e.today), src: e.source || 'Apple Health',
      meta: 'Goal ' + e.goal + ' min', metaS: 'Goal ' + e.goal,
      subS: f.over >= 0 ? 'Goal reached, +' + f.over + ' min' : (-f.over) + ' min to goal',
      sub: [f.over >= 0 ? '+' + f.over + ' min over goal' : (-f.over) + ' min to goal', f.met + ' of 7 days at goal'],
      stats: [['Days at goal', f.met + ' of 7'], ['Streak', f.streak + (f.streak === 1 ? ' day' : ' days')], ['7-day average', f.avg + ' min']],
      aria: e.today + ' exercise minutes today against a goal of ' + e.goal + '. Goal reached on ' + f.met + ' of the last 7 days.'
    };
  }
  /* A: a one-hour (or goal) lap. Recessed track, today's minutes as a raised top-lit arc with a small halo at its end, a seam cut at
     the goal; wide sizes add the week as capsule gauges. */
  function exDial(w, h, S, T, D, f, dial) {
    let e = D.exercise, L = S === 'L', d = L ? 184 : 96, sw = L ? 16 : 10, cx = S === 'S' ? w / 2 : d / 2, cy = h / 2, r = d / 2 - sw / 2 - 1, s = '';
    s += sink('<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r) + '" fill="none" stroke="' + M.well + '" stroke-width="' + sw + '"/>');
    let goalDial = dial === 'goal', cap = goalDial ? e.goal : 60, frac = e.today / cap, deg = Math.min(frac, 1) * 360, gr = ringGrad(cx, cy, r, 0);
    if (deg > 0.5) {
      let end = pt(cx, cy, r, deg);
      s += glow(end[0], end[1], sw * 0.6) + lift(arc(cx, cy, r, deg, gr, sw));
    }
    if (frac > 1) { let r3 = r - sw / 2 - (L ? 9 : 6); s += lift(arc(cx, cy, r3, Math.min(frac - 1, 1) * 360, ringGrad(cx, cy, r3, 1), L ? 5 : 3.5)); }
    if (!goalDial) {
      let gd = e.goal / 60 * 360, g1 = pt(cx, cy, r - sw / 2 - 0.5, gd), g2 = pt(cx, cy, r + sw / 2 + 0.5, gd), g3 = pt(cx, cy, r - sw / 2 - 3, gd), g4 = pt(cx, cy, r - sw / 2 - (L ? 9 : 7), gd);
      s += ln(g1[0], g1[1], g2[0], g2[1], T.surface, 2) + ln(g3[0], g3[1], g4[0], g4[1], T.muted, 1.5, ' stroke-linecap="round"');
    }
    let fs = L ? 40 : 28, nb = cy + fs * 0.34 - (L ? 6 : 4);
    s += tx(cx, nb, String(e.today), T.text, 'middle', 'n', fs) + tx(cx, nb + (L ? 20 : 15), 'min', T.muted, 'middle');
    if (S !== 'S') {
      let x0 = d + (L ? 26 : 22), top = L ? 48 : 44;
      s += tx(x0, 14, f.over >= 0 ? '+' + f.over + ' min over goal' : (-f.over) + ' min to goal', T.text, 'start', 'b', 13, 600) +
        tx(x0, 32, goalDial ? 'One lap is the goal' : 'One lap is an hour', T.muted);
      s += '<g transform="translate(' + r2(x0) + ' ' + top + ')">' + capsWeek(w - x0, h - top, f.w7, e.goal, T, D, false) + '</g>';
    }
    return s;
  }
  /* B: the day as a 2 x 12 grid of hour cells (AM row, PM row). Hours with exercise are raised, shaded by minutes; quiet hours are
     recessed and the hours ahead fade back. This hour is outlined. */
  function exHours(w, h, S, T, D, f, mode, shade) {
    let e = D.exercise, nowH = Math.floor(nowHour(D)), mx = Math.max(1, maxOf(e.hourly)), twelve = !is24(), L = S === 'L', small = S === 'S';
    let gut = twelve ? (small ? 21 : 25) : 0, gap = small ? 2 : 3, rgap = small ? 4 : 6, foot = L ? 26 : 0;
    let cw = (w - gut - gap * 11) / 12, ch = (h - foot - rgap) / 2, wells = '', ahead = '', fills = '', marks = '', r, c;
    for (r = 0; r < 2; r++) {
      let ry = r * (ch + rgap);
      if (twelve) marks += tx(0, ry + ch / 2 + 4, r ? 'PM' : 'AM', T.muted, 'start', 'b', 11, 600);
      for (c = 0; c < 12; c++) {
        let hr = r * 12 + c, x = gut + c * (cw + gap), v = e.hourly[hr], rx = Math.min(small ? 3 : 5, cw / 3);
        if (v > 0) {
          let k = v / mx, gi = shade === 'flat' || k > 0.6 ? 0 : (k > 0.3 ? 2 : 3);
          fills += rect(x, ry, cw, ch, rx, G(gi));
          if (L) marks += tx(x + cw / 2, ry + ch / 2 + 5, String(v), gi === 0 ? T.surface : T.text, 'middle', 'n', 13, 600);
        } else if (hr <= nowH) wells += rect(x, ry, cw, ch, rx, M.well);
        else ahead += rect(x, ry, cw, ch, rx, M.well);
        if (hr === nowH) marks += rect(x - 1.5, ry - 1.5, cw + 3, ch + 3, rx + 1.5, 'none', 1, ' stroke="' + T.text + '" stroke-width="1.25" stroke-opacity="0.75"');
      }
    }
    let s = sink(wells) + '<g opacity="0.5">' + sink(ahead) + '</g>' + lift(fills) + marks;
    if (L) {
      let xx = gut, y = h - 4, sw = '';
      f.clusters.forEach(function (cl) {
        let t = hourLabel(cl.from, mode) + ' · ' + cl.min + ' min', tw = t.length * 6.1 + 22;
        if (xx + tw > w) return;
        sw += dot(xx + 4, y - 4, 4, G(0)); s += tx(xx + 13, y, t, T.text, 'start', 'b', 11, 600); xx += tw;
      });
      s += lift(sw);
    }
    return s;
  }
  /* C: one disc per day in weekday columns (today is always the last). A day at goal is a raised disc; a day short of it is a
     recessed well with a raised arc for the minutes it had. A run of days at goal sits in one recessed channel, so a streak reads
     as one piece. */
  function exGrid(w, h, S, T, D, n) {
    let e = D.exercise, vals = e.series.slice(-n), flat = n === 30 && S === 'S', cols = flat ? 10 : 7, rows = Math.ceil(n / cols), lead = cols * rows - n, L = S === 'L';
    let lh = flat ? 0 : 15, cellH = (h - lh) / rows, px = Math.min(w / cols, Math.max(cellH * 1.7, 20)), cell = Math.min(px, cellH);
    let r = Math.min(L ? 22 : 18, cell / 2 - (rows > 1 ? 1.5 : 2.5)), ox = (w - px * cols) / 2, oy = (h - (rows * cell + lh)) / 2;
    let chan = '', wells = '', discs = '', arcs = '', marks = '', j;
    function P(j) { let k = j + lead; return [ox + px * (k % cols + 0.5), oy + cell * (Math.floor(k / cols) + 0.5), Math.floor(k / cols)]; }
    for (j = 0; j < n; j++) {
      if (vals[j] < e.goal) continue;
      let a0 = j, q0 = P(j);
      while (j + 1 < n && vals[j + 1] >= e.goal && P(j + 1)[2] === q0[2]) j++;
      if (j > a0) { let q1 = P(j), ch = Math.max(4, r * 1.1); chan += rect(q0[0], q0[1] - ch / 2, q1[0] - q0[0], ch, ch / 2, M.well); }
    }
    let numIn = r >= 10.5, fsz = r >= 18 ? 14 : 11;
    for (j = 0; j < n; j++) {
      let q = P(j), cx = q[0], cy = q[1], v = vals[j], met = v >= e.goal;
      if (met) {
        discs += dot(cx, cy, r, G(0));
        if (numIn) marks += tx(cx, cy + fsz * 0.36, String(v), T.surface, 'middle', 'n', fsz, 600);
        else if (r >= 7) marks += '<path d="M' + r2(cx - r * 0.34) + ' ' + r2(cy + r * 0.02) + 'l' + r2(r * 0.22) + ' ' + r2(r * 0.24) + 'l' + r2(r * 0.44) + ' ' + r2(-r * 0.5) + '" fill="none" stroke="' + T.surface + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        wells += dot(cx, cy, r, M.well);
        if (r >= 7 && v > 0) { let asw = Math.max(2.5, r * 0.2), ar = r - asw / 2 - 1.5; arcs += arc(cx, cy, ar, v / e.goal * 360, ringGrad(cx, cy, ar, 0), asw); }
        if (numIn) marks += tx(cx, cy + fsz * 0.36, String(v), T.text, 'middle', 'n', fsz, 600);
      }
      if (j === n - 1 && r >= 6) marks += '<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(r + 3) + '" fill="none" stroke="' + T.text + '" stroke-width="1.25" stroke-opacity="0.7"/>';
    }
    let s = sink(chan + wells) + lift(discs + arcs) + marks;
    if (lh) { let labs = D.dayLabels.slice(-7), ly = oy + rows * cell + 12; for (j = 0; j < 7; j++) s += tx(ox + px * (j + 0.5), ly, labs[j].charAt(0), j === 6 ? T.text : T.muted, 'middle', 'b', 11, j === 6 ? 700 : 600); }
    return s;
  }
  /* D: a segmented meter. Each recessed segment is 5 minutes and fills with a raised segment; the goal is a hairline notch between
     segments. Large lays the week out as a ladder of meters on one goal line. */
  function segRow(x, y, w, hh, nSeg, val, unit, gi) {
    let g = hh >= 12 ? 3 : 2, sw = (w - g * (nSeg - 1)) / nSeg, rx = Math.min(hh / 2, hh >= 12 ? 4 : 2.5), wl = '', fl = '', i;
    for (i = 0; i < nSeg; i++) {
      let sx = x + i * (sw + g), part = Math.max(0, Math.min(1, val / unit - i));
      if (part < 1) wl += rect(sx, y, sw, hh, rx, M.well);
      if (part > 0) fl += rect(sx, y, Math.max(rx * 2, sw * part), hh, rx, G(gi));
    }
    return { w: wl, f: fl, gx: function (segs) { return x + segs * (sw + g) - g / 2; } };
  }
  function exSegments(w, h, S, T, D, f) {
    let e = D.exercise, unit = 5, L = S === 'L', nSeg = Math.max(12, Math.ceil(Math.max(e.today, L ? maxOf(f.w7) : 0) / unit)), cap = nSeg * unit, gs = e.goal / unit, s = '';
    if (!L) {
      let small = S === 'S', hh = small ? 16 : 20, y = small ? 6 : 8, r = segRow(0, y, w, hh, nSeg, e.today, unit, 0), gx = r.gx(gs);
      s += sink(r.w) + lift(r.f) + ln(gx, y - 4, gx, y + hh + 4, T.text, 1.5, ' stroke-linecap="round"');
      let gl = small ? String(e.goal) : 'Goal ' + e.goal, half = gl.length * 3.2;
      return s + tx(0, h - 3, '0', T.muted, 'start', 'n') + tx(Math.max(half + 14, Math.min(w - half - 30, gx)), h - 3, gl, T.text, 'middle', 'b', 11, 700) + tx(w, h - 3, cap + (small ? '' : ' min'), T.muted, 'end', 'n');
    }
    let labs = D.dayLabels.slice(-7), x0 = 18, x1 = w - 28, pitch = 15.5, y0 = 4, gx2 = 0, wl = '', fl = '', i;
    for (i = 0; i < 7; i++) {
      let today = i === 6, hh2 = today ? 10 : 6, yy = y0 + i * pitch + (today ? 0 : 2), rr = segRow(x0, yy, x1 - x0, hh2, nSeg, f.w7[i], unit, today ? 0 : 1);
      gx2 = rr.gx(gs); wl += rr.w; fl += rr.f;
      s += tx(0, yy + hh2 / 2 + 4, labs[i].charAt(0), today ? T.text : T.muted, 'start', 'b', 11, today ? 700 : 600) +
        tx(w, yy + hh2 / 2 + 4, String(f.w7[i]), today ? T.text : T.muted, 'end', 'n', 11, today ? 600 : 500);
    }
    s = sink(wl) + lift(fl) + s + ln(gx2, y0 - 3, gx2, y0 + 6 * pitch + 13, T.text, 1.25, ' stroke-opacity="0.8"');
    let yb = y0 + 6 * pitch + 30;
    return s + tx(x0, yb, '0', T.muted, 'start', 'n') + tx(gx2, yb, 'Goal ' + e.goal, T.text, 'middle', 'b', 11, 700) + tx(x1, yb, cap + ' min', T.muted, 'end', 'n');
  }

  TS2.tiles.push({
    id: 'exercise', title: 'Exercise', group: 'Training',

    versions: [
      {
        key: 'A', name: 'Minute dial',

        options: [OPT_SIZE3, { id: 'dial', label: 'Ring', choices: [['hour', 'One hour'], ['goal', 'Goal']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = exFacts(ctx.data), p = exBase(o, ctx, 'A', f), T = ctx.T;
          p.numIn = true;
          p.chart = function (w, h) { return exDial(w, h, o.size, T, ctx.data, f, o.dial); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'B', name: 'Hour grid',

        options: [OPT_SIZE3, { id: 'shade', label: 'Cells', choices: [['minutes', 'Shade by minutes'], ['flat', 'Any activity']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = exFacts(ctx.data), p = exBase(o, ctx, 'B', f), T = ctx.T, first = f.clusters[0];
          if (first) p.stats[2] = ['First stretch', hourLabel(first.from)];
          p.stackM = true;
          p.chart = function (w, h) { return exHours(w, h, o.size, T, ctx.data, f, o.clock, o.shade); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'C', name: 'Goal streak',

        options: [OPT_SIZE3, OPT_RANGE, { id: 'count', label: 'Counts', choices: [['streak', 'Current streak'], ['met', 'Days at goal']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = exFacts(ctx.data), p = exBase(o, ctx, 'C', f), T = ctx.T, e = ctx.data.exercise, n = +o.range || 7, metN = 0, i;
          let vals = e.series.slice(-n); for (i = 0; i < n; i++) if (vals[i] >= e.goal) metN++;
          let streak = f.streak + '-day streak', days = metN + ' of ' + n + ' at goal';
          p.subS = o.count === 'met' ? days : streak;
          p.sub = o.count === 'met' ? [days, streak] : [streak, days];
          p.stats[0] = ['Last ' + n + ' days', metN + ' at goal'];
          p.chart = function (w, h) { return exGrid(w, h, o.size, T, ctx.data, n); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'D', name: 'Segments',

        options: [OPT_SIZE3],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = exFacts(ctx.data), p = exBase(o, ctx, 'D', f), T = ctx.T;
          if (o.size === 'M') p.stackM = true;
          p.chart = function (w, h) { return exSegments(w, h, o.size, T, ctx.data, f); };
          return tile(o, ctx, p);
        }
      }
    ]
  });

  /* =====================================================================
     3. ACTIVE ENERGY
     ===================================================================== */
  function actFacts(D) {
    let a = D.active, now = nowHour(D), total = sum(a.hourly) || 1, k = a.today / total, peak = 0, i;
    /* Pace runs across the waking day (last wake time to last bedtime), not midnight to midnight, so mornings do not read as "behind". */
    let wake = clockH(D.sleep && D.sleep.last && D.sleep.last.wake, 6), bed = clockH(D.sleep && D.sleep.last && D.sleep.last.bed, 23);
    if (bed <= wake + 1) bed = 24;
    let pace = a.goal * Math.max(0, Math.min(1, (now - wake) / (bed - wake)));
    for (i = 1; i < 24; i++) if (a.hourly[i] > a.hourly[peak]) peak = i;
    let names = ['Night', 'Morning', 'Afternoon', 'Evening'], parts = [], acc = 0;
    for (i = 0; i < 4; i++) { let v = Math.round(sum(a.hourly.slice(i * 6, i * 6 + 6)) * k); parts.push({ name: names[i], v: v, from: i * 6, i: i }); acc += v; }
    let big = parts.slice().sort(function (x, y) { return y.v - x.v; })[0]; big.v += a.today - acc;
    let w7 = a.series.slice(-7);
    return { now: now, k: k, wake: wake, bed: bed, pace: Math.round(pace), ahead: Math.round(a.today - pace), left: a.goal - a.today, pct: Math.round(a.today / a.goal * 100), peak: peak, parts: parts, avg: Math.round(sum(w7) / 7) };
  }
  function actBase(o, ctx, key, f) {
    let a = ctx.data.active, left = o.number === 'left', reached = f.left <= 0;
    return {
      cls: 'ts2-active-' + key, icon: 'calories', color: 'training', title: 'Active energy', src: a.source || 'Apple Health',
      num: left ? ef(Math.max(0, f.left)) : ef(a.today), unit: left ? eu() + ' to go' : eu(),
      meta: 'Goal ' + ef(a.goal) + ' ' + eu(), metaS: '',
      subS: left ? ef(a.today) + ' of ' + ef(a.goal) + ' ' + eu() : (reached ? 'Goal reached' : ef(f.left) + ' ' + eu() + ' to go'),
      sub: [left ? ef(a.today) + ' burned' : (reached ? 'Goal reached' : ef(f.left) + ' ' + eu() + ' to go'), f.pct + '% of goal'],
      stats: [['Goal', ef(a.goal) + ' ' + eu()], ['Most active hour', hourLabel(f.peak)], ['7-day average', ef(f.avg) + ' ' + eu()]],
      aria: ef(a.today) + ' active ' + (eu() === 'kJ' ? 'kilojoules' : 'kilocalories') + ' burned today of a ' + ef(a.goal) + ' goal, ' + (reached ? 'goal reached.' : ef(f.left) + ' to go.')
    };
  }
  let OPT_NUM = { id: 'number', label: 'Big number', choices: [['burned', 'Burned'], ['left', 'Left to goal']] };
  let PART_G = [5, 3, 2, 0];
  /* A: energy adding up through the day as a raised line over a soft lit fill, toward a dashed goal line, with a dotted pace line
     over the waking hours. The day sits on a recessed groove. */
  function actCurve(w, h, S, T, D, f, pace) {
    let a = D.active, top = 6, base = h - 20, ph = base - top, mx = Math.max(a.goal, a.today), cum = 0, i;
    function X(hr) { return r2(hr / 24 * w); } function Y(v) { return r2(base - v / mx * ph); }
    let d = 'M0 ' + Y(0), last = Math.floor(f.now);
    for (i = 0; i < last; i++) { cum += a.hourly[i] * f.k; d += 'L' + X(i + 1) + ' ' + Y(cum); }
    d += 'L' + X(f.now) + ' ' + Y(a.today);
    let gid = M.uid + '-area';
    M.extra += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + Y(a.today) + '" x2="0" y2="' + base + '"><stop offset="0" stop-color="' + M.C + '" stop-opacity="' + (M.dk ? 0.26 : 0.2) + '"/><stop offset="1" stop-color="' + M.C + '" stop-opacity="0.02"/></linearGradient>';
    let s = sink(rect(0, base, w, 4, 2, M.well)) + dash(0, Y(a.goal), w, T.ghost) + (S === 'S' ? '' : tx(0, Y(a.goal) + 15, 'Goal ' + ef(a.goal), T.muted));
    if (pace) s += '<line x1="' + X(f.wake) + '" y1="' + Y(0) + '" x2="' + X(Math.min(24, f.bed)) + '" y2="' + Y(a.goal) + '" stroke="' + T.muted + '" stroke-width="1.25" stroke-dasharray="1 4" stroke-linecap="round"/>';
    s += '<path d="' + d + 'L' + X(f.now) + ' ' + base + 'L0 ' + base + 'z" fill="url(#' + gid + ')"/>' +
      lift('<path d="' + d + '" fill="none" stroke="' + M.C + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>') +
      glow(X(f.now), Y(a.today), 6) + lift('<circle cx="' + X(f.now) + '" cy="' + Y(a.today) + '" r="5" fill="' + G(0) + '" stroke="' + T.surface + '" stroke-width="2"/>');
    return s + hourAxis(w, h, T);
  }
  /* B: a 270 degree gauge to the goal. Recessed track, raised top-lit fill in four segments by time of day (or one fill). */
  function actGauge(w, h, S, T, D, f, split, numMode) {
    let a = D.active, L = S === 'L', R = L ? 84 : 47, sw = L ? 16 : 10, cx = S === 'S' ? w / 2 : R + 1, cy = R + 1, r = R - sw / 2 - 1, s = '', i;
    let scale = Math.max(a.goal, a.today), A0 = -135, SP = 270, parts = split === 'parts';
    function ang(v) { return A0 + SP * Math.min(1, v / scale); }
    s += sink(arcAB(cx, cy, r, A0, A0 + SP, M.well, sw, parts ? 'butt' : 'round'));
    if (parts) {
      let acc = 0, segs = '';
      for (i = 0; i < 4; i++) { let v = f.parts[i].v; if (v > 0) { segs += arcAB(cx, cy, r, ang(acc) + (acc > 0 ? 0.9 : 0), ang(acc + v) - 0.9, ringGrad(cx, cy, r, PART_G[i]), sw, 'butt'); acc += v; } }
      s += lift(segs);
    } else {
      let e = pt(cx, cy, r, ang(a.today));
      s += glow(e[0], e[1], sw * 0.6) + lift(arcAB(cx, cy, r, A0, ang(a.today), ringGrad(cx, cy, r, 0), sw, 'round'));
    }
    if (a.today > a.goal) { let gd = ang(a.goal), q1 = pt(cx, cy, r - sw / 2 - 1, gd), q2 = pt(cx, cy, r + sw / 2 + 1, gd); s += ln(q1[0], q1[1], q2[0], q2[1], T.surface, 2); }
    let left = numMode === 'left', big = left ? ef(Math.max(0, f.left)) : ef(a.today), fs = L ? 48 : 30, nb = cy + fs * 0.34 - (L ? 6 : 4);
    s += tx(cx, nb, big, T.text, 'middle', 'n', fs) + tx(cx, nb + (L ? 20 : 15), left ? eu() + ' to go' : eu(), T.muted, 'middle');
    let e0 = pt(cx, cy, r, A0), e1 = pt(cx, cy, r, A0 + SP), ly = e0[1] + sw / 2 + (L ? 16 : 13);
    if (S === 'S') s += tx(cx, h - 2, f.left > 0 ? ef(f.left) + ' ' + eu() + ' to go' : 'Goal reached', T.muted, 'middle');
    else s += tx(e0[0], ly, '0', T.muted, 'middle', 'n') + tx(e1[0], ly, ef(scale), T.muted, 'middle', 'n');
    if (S !== 'S') {
      let x0 = 2 * R + (L ? 26 : 22), sw2 = '';
      s += tx(x0, L ? 18 : 14, left ? ef(a.today) + ' ' + eu() + ' burned' : (f.left > 0 ? ef(f.left) + ' ' + eu() + ' to go' : 'Goal reached'), T.text, 'start', 'b', 13, 600) +
        (L ? tx(x0, 36, f.pct + '% of ' + ef(a.goal) + ' ' + eu(), T.muted) : '');
      for (i = 0; i < 4; i++) {
        let pp = f.parts[i], y = L ? 76 + i * 28 : 40 + i * 17, xi = x0 + (parts ? 14 : 0);
        if (parts) sw2 += dot(x0 + 4, y - 4, 4, G(PART_G[i]));
        s += tx(xi, y, pp.name, L ? T.text : T.muted, 'start', 'b', L ? 13 : 11, L ? 500 : 600) + tx(w, y, ef(pp.v) + (L ? ' ' + eu() : ''), T.text, 'end', 'n', L ? 13 : 11);
      }
      s += lift(sw2);
    }
    return s;
  }
  /* C: today on a slider. A recessed groove spans the scale, your usual range (middle half of past days) is a raised band in it,
     the goal is a notch and today is a raised thumb. Large also shows each past day as a small bead above the groove. */
  function actRuler(w, h, S, T, D, n, avgOn) {
    /* the scale is drawn in the energy unit from Settings, so its ends and ticks are round numbers in that unit */
    let a = D.active, k = eK(), q = k > 1 ? 200 : 50, vals = a.series.slice(-n).map(function (v) { return v * k; }), past = vals.slice(0, -1), today = vals[n - 1], goal = a.goal * k, L = S === 'L', Mz = S === 'M', i;
    let lo = Math.floor(Math.min(minOf(vals), goal) * 0.92 / q) * q, hi = Math.ceil(Math.max(maxOf(vals), goal) * 1.04 / q) * q, pd = 10;
    function X(v) { return pd + (v - lo) / (hi - lo) * (w - 2 * pd); }
    let srt = past.slice().sort(function (x, y) { return x - y; }), q1 = quant(srt, 0.25), q3 = quant(srt, 0.75), avg = sum(vals) / n;
    let gh = L ? 10 : 8, ry = L ? 84 : r2((h - 18) / 2), th = L ? 9 : 7, s = '';
    s += sink(rect(pd - gh / 2, ry - gh / 2, w - 2 * pd + gh, gh, gh / 2, M.well));
    s += lift(rect(X(q1), ry - gh / 2 + 1.5, Math.max(gh, X(q3) - X(q1)), gh - 3, (gh - 3) / 2, G(1)));
    if (L) {
      let bins = {}, beads = '', rr = 3.5, pitch = 2 * rr + 2;
      past.forEach(function (v) { let k = Math.round(X(v) / pitch); bins[k] = (bins[k] || 0) + 1; beads += dot(k * pitch, ry - gh / 2 - 8 - rr - (bins[k] - 1) * pitch, rr, G(5)); });
      s += lift(beads);
      let step = k > 1 ? (hi - lo > 2900 ? 500 : 200) : (hi - lo > 700 ? 100 : 50);
      for (i = Math.ceil(lo / step) * step; i <= hi; i += step) if (i % (step * 2) === 0) s += tx(X(i), ry + gh / 2 + 22, fmt(i), T.muted, 'middle', 'n');
      s += tx(0, 10, 'Usual ' + fmt(Math.round(q1 / 10) * 10) + ' to ' + fmt(Math.round(q3 / 10) * 10) + ' ' + eu(), T.muted);
      if (avgOn) s += tx(w, 10, 'Avg ' + fmt(avg), T.muted, 'end');
    }
    if (avgOn) s += ln(X(avg), ry + gh / 2 + 3, X(avg), ry + gh / 2 + 7, T.muted, 1.5, ' stroke-linecap="round"');
    let gx = X(goal);
    s += ln(gx, ry - gh / 2 - 5, gx, ry + gh / 2 + 5, T.text, 1.5, ' stroke-linecap="round"');
    let tx0 = X(today);
    s += glow(tx0, ry, th) + lift('<circle cx="' + r2(tx0) + '" cy="' + r2(ry) + '" r="' + th + '" fill="' + G(0) + '" stroke="' + T.surface + '" stroke-width="2"/>');
    if (L) s += tx(Math.max(26, Math.min(w - 26, gx)), h - 2, 'Goal ' + fmt(goal), T.text, 'middle', 'b', 11, 700);
    else if (Mz) {
      let gl = 'Goal ' + fmt(goal), gw = gl.length * 3.2 + 2, gxc = Math.max(gw, Math.min(w - gw, gx));
      s += tx(gxc, h - 3, gl, T.text, 'middle', 'b', 11, 700);
      if (gxc - gw > 36) s += tx(0, h - 3, fmt(lo), T.muted, 'start', 'n');
      if (gxc + gw < w - 36) s += tx(w, h - 3, fmt(hi), T.muted, 'end', 'n');
    } else s += tx(0, h - 3, fmt(lo), T.muted, 'start', 'n') + tx(w, h - 3, fmt(hi), T.muted, 'end', 'n');
    return s;
  }
  /* D: a 24-hour clock, midnight at the top. A recessed ring holds one raised bar per hour, as long as the energy burned in it; the
     busiest hour is in full colour. A hand across the ring marks now and the hub is a neutral plate holding the number. */
  function actClock(cx, cy, r0, rMax, T, D, f) {
    let A = D.active, nowH = Math.floor(f.now), mx = 0, bars = '', i;
    for (i = 0; i < 24; i++) mx = Math.max(mx, A.hourly[i] * f.k);
    mx = mx || 1;
    let bw = Math.min(7, 2 * Math.PI * r0 / 24 * 0.6), r1 = r0 + bw / 2 + 2.5, rEnd = rMax - bw / 2 - 2;
    for (i = 0; i <= Math.min(23, nowH); i++) {
      let v = A.hourly[i] * f.k; if (v < 1) continue;
      let deg = (i + 0.5) * 15, len = Math.max(0, (rEnd - r1) * v / mx), a1 = pt(cx, cy, r1, deg), a2 = pt(cx, cy, r1 + len, deg);
      bars += ln(a1[0], a1[1], a2[0], a2[1], i === f.peak ? M.C : M.cols[1], bw, ' stroke-linecap="round"');
    }
    let nd = f.now * 15, n1 = pt(cx, cy, r0 + 1, nd), n2 = pt(cx, cy, rMax - 1, nd);
    return sink(annulus(cx, cy, r0, rMax, M.well)) + lift(bars) + ln(n1[0], n1[1], n2[0], n2[1], T.text, 1.5, ' stroke-linecap="round" stroke-opacity="0.85"') +
      lift(dot(cx, cy, r0 - 5, G(6)));
  }
  function actClockTile(w, h, S, T, D, f, numMode) {
    let A = D.active, left = numMode === 'left', big = left ? ef(Math.max(0, f.left)) : ef(A.today), unit = left ? eu() + ' to go' : eu(), s = '';
    if (S === 'S') {
      let cx = w / 2, cy = h / 2;
      return actClock(cx, cy, 28, 47, T, D, f) + tx(cx, cy + 3, big, T.text, 'middle', 'n', 16, 600) + tx(cx, cy + 15, left ? 'to go' : eu(), T.muted, 'middle', 'b', 10);
    }
    if (S === 'M') {
      s += actClock(48, 48, 25, 47, T, D, f) + tx(48, 52, '24 h', T.muted, 'middle', 'b', 10, 600);
      let x0 = 118;
      return s + numSvg(x0, 34, big, unit, T, 28) + tx(x0, 58, left ? ef(A.today) + ' ' + eu() + ' burned' : (f.left > 0 ? ef(f.left) + ' ' + eu() + ' to go' : 'Goal reached'), T.text, 'start', 'b', 13, 500) +
        tx(x0, 77, 'Busiest ' + hourLabel(f.peak) + ', ' + ef(A.hourly[f.peak] * f.k) + ' ' + eu(), T.muted, 'start', 'b', 13, 500);
    }
    s += actClock(92, 92, 46, 88, T, D, f);
    s += tx(92, 92 + 9, big, T.text, 'middle', 'n', 28) + tx(92, 92 + 24, unit, T.muted, 'middle');
    let X = 204, first = -1, i;
    for (i = 0; i < 24; i++) { if (A.hourly[i] * f.k >= 20) { first = i; break; } }
    s += tx(X, 18, f.left > 0 ? ef(f.left) + ' ' + eu() + ' to go' : 'Goal reached', T.text, 'start', 'b', 13, 600) + tx(X, 35, 'Goal ' + ef(A.goal) + ' ' + eu(), T.muted);
    [['Busiest hour', hourLabel(f.peak)], ['Moving since', first >= 0 ? hourLabel(first) : 'Not yet']].forEach(function (r, k) {
      let y = 108 + k * 44; s += tx(X, y, r[0], T.muted) + tx(X, y + 20, r[1], T.text, 'start', 'n', 15);
    });
    return s;
  }

  TS2.tiles.push({
    id: 'active', title: 'Active energy', group: 'Training',

    versions: [
      {
        key: 'A', name: 'Burn curve',

        options: [OPT_SIZE3, { id: 'pace', label: 'Pace line', choices: [['on', 'On'], ['off', 'Off']] }, OPT_NUM],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = actFacts(ctx.data), p = actBase(o, ctx, 'A', f), T = ctx.T, pace = o.pace !== 'off';
          if (pace) {
            let txt = ef(Math.abs(f.ahead)) + ' ' + eu() + ' ' + (f.ahead >= 0 ? 'ahead of pace' : 'behind pace');
            p.subS = txt; p.sub = [ef(Math.abs(f.ahead)) + (f.ahead >= 0 ? ' ahead of pace' : ' behind pace'), p.sub[0]]; p.stats[1] = ['Pace right now', signed(eV(f.ahead)) + ' ' + eu()];
            p.aria += ' ' + txt + '.';
          }
          p.chart = function (w, h) { return actCurve(w, h, o.size, T, ctx.data, f, pace); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'B', name: 'Day gauge',

        options: [OPT_SIZE3, { id: 'split', label: 'Fill', choices: [['parts', 'By time of day'], ['single', 'Single fill']] }, OPT_NUM],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = actFacts(ctx.data), p = actBase(o, ctx, 'B', f), T = ctx.T;
          p.numIn = true;
          p.chart = function (w, h) { return actGauge(w, h, o.size, T, ctx.data, f, o.split, o.number); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'C', name: 'Usual range',

        options: [OPT_SIZE3, { id: 'range', label: 'Range', choices: [['14', '14 days'], ['30', '30 days'], ['7', '7 days']] }, { id: 'avg', label: 'Average mark', choices: [['on', 'On'], ['off', 'Off']] }],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = actFacts(ctx.data), p = actBase(o, ctx, 'C', f), T = ctx.T, a = ctx.data.active, n = +o.range || 14, vals = a.series.slice(-n), hit = 0, i;
          for (i = 0; i < n; i++) if (vals[i] >= a.goal) hit++;
          let avg = Math.round(sum(vals) / n), srt = vals.slice(0, -1).sort(function (x, y) { return x - y; }), q1 = quant(srt, 0.25), q3 = quant(srt, 0.75);
          let where = a.today > q3 ? 'Above your usual range' : (a.today < q1 ? 'Below your usual range' : 'Within your usual range');
          p.subS = where.replace('your usual', 'usual');
          p.sub = [where.replace(' your usual range', ' usual'), n + '-day avg ' + ef(avg) + ' ' + eu()];
          p.stackM = true;
          p.stats = [['Days at goal', hit + ' of ' + n], [n + '-day average', ef(avg) + ' ' + eu()], ['Usual range', ef(Math.round(q1 / 10) * 10) + ' to ' + ef(Math.round(q3 / 10) * 10)]];
          p.aria += ' ' + where + ' over the last ' + n + ' days.';
          p.chart = function (w, h) { return actRuler(w, h, o.size, T, ctx.data, n, o.avg !== 'off'); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'D', name: 'Day clock',

        options: [OPT_SIZE3, OPT_NUM],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = actFacts(ctx.data), p = actBase(o, ctx, 'D', f), T = ctx.T;
          p.numIn = true;
          p.chart = function (w, h) { return actClockTile(w, h, o.size, T, ctx.data, f, o.number); };
          return tile(o, ctx, p);
        }
      }
    ]
  });

  /* =====================================================================
     4. STEPS
     ===================================================================== */
  function stFacts(D, goal) {
    let st = D.steps, peak = 0, i, w7 = st.series.slice(-7);
    for (i = 1; i < 24; i++) if (st.hourly[i] > st.hourly[peak]) peak = i;
    return { goal: goal, peak: peak, pct: Math.round(st.today / goal * 100), left: goal - st.today, avg: Math.round(sum(w7) / 7 / 10) * 10 };
  }
  function stBase(o, ctx, key, f) {
    let st = ctx.data.steps, reached = f.left <= 0;
    return {
      cls: 'ts2-steps-' + key, icon: 'steps', color: 'recovery', title: 'Steps', unit: 'steps', num: fmt(st.today), src: st.source || 'Apple Health',
      meta: 'Goal ' + fmt(f.goal), metaS: 'Goal ' + kfmt(f.goal),
      subS: reached ? 'Goal reached' : fmt(f.left) + ' to go',
      sub: [reached ? 'Goal reached' : fmt(f.left) + ' to go', f.pct + '% of goal'],
      stats: [['Goal', fmt(f.goal)], ['Busiest hour', hourLabel(f.peak)], ['7-day average', fmt(f.avg)]],
      aria: fmt(st.today) + ' steps today of a ' + fmt(f.goal) + ' goal, ' + (reached ? 'goal reached.' : fmt(f.left) + ' to go.') + ' Busiest hour ' + hourLabel(f.peak) + '.'
    };
  }
  let OPT_GOAL = { id: 'goal', label: 'Goal', choices: [['10000', '10,000'], ['8000', '8,000'], ['12000', '12,000']] };
  /* A: 24 slim raised pills, one per hour, the busiest in full colour and named. Quiet hours so far are a small recessed dot. */
  function stHourly(w, h, S, T, D, f, label, mode) {
    let st = D.steps, top = label ? 16 : 2, base = h - 18, ph = base - top, mx = maxOf(st.hourly) || 1, hw = w / 24, bw = Math.max(3, Math.min(8, hw * 0.56)), nowH = Math.floor(nowHour(D)), pills = '', quiet = '', s = '', i;
    for (i = 0; i < 24; i++) {
      let cx = hw * (i + 0.5), v = st.hourly[i];
      if (v <= 0) { if (i <= nowH) quiet += dot(cx, base - 1.5, 1.6, M.well); else s += dot(cx, base - 1.5, 0.9, T.hair2); continue; }
      let bh = Math.max(bw, v / mx * ph);
      pills += rect(cx - bw / 2, base - bh, bw, bh, bw / 2, G(i === f.peak ? 0 : 1));
    }
    s = quiet + s + lift(pills);
    if (label) { let txt = fmt(st.hourly[f.peak]) + ' at ' + hourLabel(f.peak, mode), tw = txt.length * 6.2, px = hw * (f.peak + 0.5); s += tx(Math.max(0, Math.min(w - tw, px - bw / 2)), top - 6, txt, T.text, 'start', 'n'); }
    return s + hourAxis(w, h, T, mode);
  }
  /* B: a calendar of fill levels. Each day is a recessed well filled from the bottom with a raised level to its share of the goal;
     a full well is a day at goal. Today is in full colour and outlined. */
  function stCal(w, h, S, T, D, f, n) {
    let st = D.steps, vals = st.series.slice(-n), days = D.days.slice(-n), wells = '', fills = '', marks = '', j;
    function cellAt(x, y, cw, ch, rx, j, txt) {
      let v = vals[j], today = j === n - 1, fh = Math.min(1, v / f.goal) * ch;
      wells += rect(x, y, cw, ch, rx, M.well);
      if (fh > 0.5) fills += rect(x, y + ch - fh, cw, fh, Math.min(rx, fh / 2), G(today ? 0 : 1));
      if (today) marks += rect(x - 2, y - 2, cw + 4, ch + 4, rx + 2, 'none', 1, ' stroke="' + T.text + '" stroke-width="1.25" stroke-opacity="0.75"');
      if (txt) txt(v, today, fh);
    }
    if (S === 'M' && n > 7) {
      let pitch = w / n, cwid = Math.max(4, pitch - (n > 14 ? 3 : 4)), hh = h - 18;
      for (j = 0; j < n; j++) cellAt(j * pitch + (pitch - cwid) / 2, 0, cwid, hh, Math.min(4, cwid / 2), j);
      return sink(wells) + lift(fills) + marks + dayAxis(D, n, w, h, T);
    }
    if (S === 'L') {
      let rowsL = Math.ceil(n / 7), leadL = rowsL * 7 - n, gL = n > 14 ? 4 : 6, lhL = 16, cwL = (w - gL * 6) / 7, chL = (h - lhL - 2 - gL * (rowsL - 1)) / rowsL, rxL = Math.min(9, chL * 0.22, cwL * 0.26), labsL = D.dayLabels.slice(-7);
      for (j = 0; j < 7; j++) marks += tx(j * (cwL + gL) + cwL / 2, 11, labsL[j].charAt(0), j === 6 ? T.text : T.muted, 'middle', 'b', 11, j === 6 ? 700 : 600);
      for (j = 0; j < n; j++) {
        let kL = j + leadL, xL = (kL % 7) * (cwL + gL), yL = lhL + Math.floor(kL / 7) * (chL + gL);
        cellAt(xL, yL, cwL, chL, rxL, j, function (v, today, fh) {
          if (chL >= 40) {
            marks += tx(xL + cwL / 2, yL + chL - 9, kfmt(v), fh >= 22 ? (today ? T.surface : T.text) : T.text, 'middle', 'n', 13, 600);
          }
        });
      }
      return sink(wells) + lift(fills) + marks;
    }
    let rows = Math.ceil(n / 7), lead = rows * 7 - n, lh = 15, g = n > 14 ? 3 : 4, labs = D.dayLabels.slice(-7);
    let cw = (w - g * 6) / 7, ch = Math.min(rows === 1 ? 60 : cw, (h - lh - g * (rows - 1)) / rows), rx = Math.min(7, ch * 0.24, cw * 0.28), gh = rows * (ch + g) - g;
    for (j = 0; j < 7; j++) marks += tx(j * (cw + g) + cw / 2, gh + 13, labs[j].charAt(0), j === 6 ? T.text : T.muted, 'middle', 'b', 11, j === 6 ? 700 : 600);
    for (j = 0; j < n; j++) {
      let k = j + lead, x = (k % 7) * (cw + g), y = Math.floor(k / 7) * (ch + g);
      cellAt(x, y, cw, ch, rx, j, rows === 1 && cw >= 30 ? function (v, today, fh) {
        marks += tx(x + cw / 2, y + ch - 9, kfmt(v), fh >= 20 ? (today ? T.surface : T.text) : T.text, 'middle', 'n', 11, 600);
      } : null);
    }
    return sink(wells) + lift(fills) + marks;
  }
  /* C: a switchback trail to the goal. A recessed path climbs in rows from the bottom left to a flag at the top; the walked part is
     a raised stroke in full colour and a knob marks where you are now. Past the goal the whole trail is walked and the knob sits
     on the flag. */
  function stTrail(w, h, S, T, D, f) {
    let st = D.steps, L = S === 'L', small = S === 'S', legs = small ? 2 : 3, sw = L ? 10 : (small ? 7 : 8), kr = sw / 2 + (small ? 2.5 : 3.5);
    let flagH = small ? 13 : 16, top = flagH + kr * 0.4 + 2, bot = h - (L ? 18 : 0) - kr - 1, R = (bot - top) / (legs - 1) / 2;
    let xa = kr + R, xb = w - kr - R, pts = [], i, k;
    function push(x, y) { pts.push([x, y]); }
    for (k = 0; k < legs; k++) {
      let y = bot - k * 2 * R, ltr = k % 2 === 0, last = k === legs - 1;
      let xs = k === 0 ? kr : (ltr ? xa : xb), xe = last ? (ltr ? w - kr - 6 : kr + 6) : (ltr ? xb : xa);
      push(xs, y); push(xe, y);
      if (!last) { let cx = ltr ? xb : xa; for (i = 1; i <= 24; i++) { let a = Math.PI / 2 + (ltr ? -1 : 1) * Math.PI * i / 24; push(cx + R * Math.cos(a), y - R + R * Math.sin(a)); } }
    }
    let cum = [0];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let total = cum[cum.length - 1], dist = Math.min(1, st.today / f.goal) * total, walked = [pts[0]], at = pts[0];
    for (i = 1; i < pts.length; i++) {
      if (cum[i] <= dist) { walked.push(pts[i]); at = pts[i]; continue; }
      let t = (dist - cum[i - 1]) / (cum[i] - cum[i - 1]);
      at = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; walked.push(at); break;
    }
    function poly(p, stroke, width) { return '<polyline points="' + p.map(function (q) { return r2(q[0]) + ',' + r2(q[1]); }).join(' ') + '" fill="none" stroke="' + stroke + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
    let end = pts[pts.length - 1], reached = st.today >= f.goal, fx = end[0], fy = end[1];
    let pole = ln(fx, fy - 2, fx, fy - flagH - 2, T.muted, 1.5, ' stroke-linecap="round"');
    let pen = '<path d="M' + r2(fx) + ' ' + r2(fy - flagH - 2) + 'L' + r2(fx + (small ? 9 : 11)) + ' ' + r2(fy - flagH + (small ? 2.5 : 3)) + 'L' + r2(fx) + ' ' + r2(fy - flagH + (small ? 7 : 8)) + 'Z" fill="' + (reached ? G(0) : T.muted) + '" stroke="' + (reached ? M.C : T.muted) + '" stroke-width="1" stroke-linejoin="round"/>';
    let s = sink(poly(pts, M.well, sw)) + lift(poly(walked, G(0), sw - 2)) + pole + lift(pen + dot(fx, fy, 2.5, T.muted));
    s += glow(at[0], at[1], kr) + lift(dot(at[0], at[1], kr, G(6))) + dot(at[0], at[1], kr * 0.42, M.C);
    if (!small) {
      let gl = 'Goal ' + kfmt(f.goal), rightEnd = fx > w / 2;
      s += tx(rightEnd ? fx - 8 : fx + (small ? 12 : 15), fy - flagH + 4, gl, T.text, rightEnd ? 'end' : 'start', 'b', 11, 700);
    }
    if (L) s += tx(0, h - 3, 'Start', T.muted) + tx(w, h - 3, reached ? fmt(st.today - f.goal) + ' past the flag' : f.pct + '% of the way', T.muted, 'end');
    return s;
  }
  /* D: milestones. A recessed track from zero to the goal with a node at each quarter of it. Passed nodes are raised discs with a
     check, the next one is ringed, and the fill runs to where you are now. */
  function stMiles(w, h, S, T, D, f) {
    let st = D.steps, L = S === 'L', small = S === 'S', th = L ? 10 : (small ? 6 : 8), nr = L ? 12 : (small ? 8 : 10), p = Math.min(1, st.today / f.goal);
    /* when each milestone was passed, from the hourly counts scaled to today's total */
    let times = [], cum = 0, hh, thr, hk = st.today / (sum(st.hourly) || 1);
    for (hh = 0, q = 1; hh < 24 && q <= 4; hh++) { let hv = (st.hourly[hh] || 0) * hk; while (q <= 4 && hv > 0 && cum + hv >= (thr = f.goal * q / 4)) { times[q] = hh + (thr - cum) / hv; q++; } cum += hv; }
    let x0 = nr, x1 = w - nr, cy = small ? h / 2 - 6 : (L ? h / 2 - 4 : h / 2 - 8), xp = x0 + (x1 - x0) * p, s = '', nodes = '', pits = '', marks = '', q, next = -1;
    s += sink(rect(x0, cy - th / 2, x1 - x0, th, th / 2, M.well));
    if (p > 0) s += lift(rect(x0, cy - th / 2, Math.max(th, xp - x0), th, th / 2, G(0)));
    for (q = 1; q <= 4; q++) {
      let x = x0 + (x1 - x0) * q / 4, done = p >= q / 4 - 1e-9, lab = kfmt(f.goal * q / 4);
      if (done) {
        nodes += dot(x, cy, nr, G(0));
        marks += '<path d="M' + r2(x - nr * 0.38) + ' ' + r2(cy + 0.2) + 'L' + r2(x - nr * 0.1) + ' ' + r2(cy + nr * 0.3) + 'L' + r2(x + nr * 0.42) + ' ' + r2(cy - nr * 0.3) + '" fill="none" stroke="' + T.onAccent + '" stroke-width="' + (small ? 1.6 : 2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        if (next < 0) next = q;
        pits += dot(x, cy, nr, M.well);
        nodes += dot(x, cy, nr * 0.46, G(6));
        if (next === q) marks += '<circle cx="' + r2(x) + '" cy="' + r2(cy) + '" r="' + r2(nr + 2.5) + '" fill="none" stroke="' + M.C + '" stroke-width="1.5" stroke-opacity="0.85"/>';
      }
      if (!small && done && times[q] != null && h - (cy + nr + 15) >= 14) marks += tx(Math.min(x, w - 24), cy + nr + 29, clockStr(times[q]), T.muted, 'middle', 'n', 11, 500);
      marks += tx(Math.min(x, w - lab.length * 3.2), cy + nr + 15, lab, done || next === q ? T.text : T.muted, 'middle', 'n', 11, done || next === q ? 600 : 500);
    }
    s += sink(pits) + lift(nodes) + marks;
    if (!small) s += tx(Math.max(0, Math.min(w - 40, xp - 20)), cy - nr - 8, fmt(st.today), T.text, 'start', 'n', 11, 600);
    return s;
  }

  TS2.tiles.push({
    id: 'steps', title: 'Steps', group: 'Body',

    versions: [
      {
        key: 'A', name: 'Day rhythm',

        options: [OPT_SIZE3, OPT_GOAL],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = stFacts(ctx.data, +o.goal || 10000), p = stBase(o, ctx, 'A', f), T = ctx.T;
          p.sub[1] = '7-day avg ' + fmt(f.avg); p.stats[1] = ['Busiest hour', hourLabel(f.peak)];
          p.chart = function (w, h) { return stHourly(w, h, o.size, T, ctx.data, f, o.size !== 'S', o.clock); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'B', name: 'Step calendar',

        options: [OPT_SIZE3, OPT_RANGE, OPT_GOAL],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = stFacts(ctx.data, +o.goal || 10000), p = stBase(o, ctx, 'B', f), T = ctx.T, n = +o.range || 7, vals = ctx.data.steps.series.slice(-n), hit = 0, i;
          for (i = 0; i < n; i++) if (vals[i] >= f.goal) hit++;
          let avg = Math.round(sum(vals) / n / 10) * 10;
          p.subS = hit + ' of ' + n + ' days at goal';
          p.sub = [p.sub[0], hit + ' of ' + n + ' days at goal'];
          p.stackM = true;
          p.stats = [['Goal', fmt(f.goal)], ['Days at goal', hit + ' of ' + n], [n + '-day average', fmt(avg)]];
          p.chart = function (w, h) { return stCal(w, h, o.size, T, ctx.data, f, n); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'C', name: 'Trail',

        options: [OPT_SIZE3, OPT_GOAL],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = stFacts(ctx.data, +o.goal || 10000), p = stBase(o, ctx, 'C', f), T = ctx.T;
          p.sub[1] = '7-day avg ' + fmt(f.avg);
          p.chart = function (w, h) { return stTrail(w, h, o.size, T, ctx.data, f); };
          return tile(o, ctx, p);
        }
      },
      {
        key: 'D', name: 'Milestones',

        options: [OPT_SIZE3, OPT_GOAL],
        sizes: ['S', 'M', 'L'],
        render: function (o, ctx) {
          let f = stFacts(ctx.data, +o.goal || 10000), p = stBase(o, ctx, 'D', f), T = ctx.T, today = ctx.data.steps.today, q = Math.min(4, Math.floor(today / f.goal * 4) + 1);
          let nextAt = f.goal * q / 4, dist = distStr(today * 0.00043);
          let nextTxt = today >= f.goal ? 'Goal reached' : fmt(nextAt - today) + ' to ' + kfmt(nextAt);
          p.subS = nextTxt;
          p.sub = [nextTxt, 'About ' + dist + ' walked'];
          p.stackM = true;
          p.stats = [['Goal', fmt(f.goal)], ['Distance', dist], ['7-day average', fmt(f.avg)]];
          p.chart = function (w, h) { return stMiles(w, h, o.size, T, ctx.data, f); };
          return tile(o, ctx, p);
        }
      }
    ]
  });
}
