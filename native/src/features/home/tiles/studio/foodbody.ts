// @ts-nocheck -- generated tile drawing code: each style is a pure function from options and data to markup.
/* Home tiles: Calories, Protein, Water, Log a meal, Weight and Body fat. Each style draws the whole tile (frame, header and body) as markup that ./markup.tsx turns into
   native views and SVG. Materials come from ./depth (one light from above: raised fills, recessed tracks, neutral plates). */
export function install(window) {
  let TS2 = window.TS2, INS = window.INS;

  'use strict';
  let FH = TS2.type.fontHeading.replace(/"/g, "'");
  let FB = TS2.type.fontBody.replace(/"/g, "'");
  let DP = TS2.depth;
  let MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let MINUS = '−';
  let KG = 0.45359237, FLOZ = 33.814;
  let P = 16; /* inner padding, every edge */

  /* ---------- small helpers ---------- */
  function R(n) { return Math.round(n * 10) / 10; }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function signed(n, dec) {
    let a = Math.abs(n), s = dec ? f1(a) : String(Math.round(a));
    if (parseFloat(s) === 0) return s;
    return (n < 0 ? MINUS : '+') + s;
  }
  function plain(s) { return String(s).replace(/−/g, 'minus ').replace(/\+/g, 'plus '); }
  function fin(a) { let o = []; for (let i = 0; i < a.length; i++) if (typeof a[i] === 'number' && isFinite(a[i])) o.push(a[i]); return o; } /* days with no reading are left out */
  function mean(a) { a = fin(a); let s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function amax(a) { a = fin(a); return a.length ? Math.max.apply(null, a) : 0; }
  function amin(a) { a = fin(a); return a.length ? Math.min.apply(null, a) : 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function md(d) { return MON[d.getMonth()] + ' ' + d.getDate(); }
  function mealHour(t) {
    let p = /^(\d+):(\d+)\s*(AM|PM)$/.exec(t);
    if (!p) return 12;
    return (+p[1]) % 12 + (p[3] === 'PM' ? 12 : 0) + (+p[2]) / 60;
  }
  /* units follow Settings (INS.prefs): energy in kcal or kJ, weight in lb or kg, clock 12 or 24 hour. The data stays in kcal, lb and
     "h:mm AM"; only what a tile shows converts. Macros stay in grams; water keeps its own unit from the water section. */
  function PF() { return window.INS && INS.prefs; }
  /* a meal or day whose foods give no energy (or protein) reads as a dash, never 0 */
  function ek(kcal) { if (kcal == null) return '\u2013'; let p = PF(); return p ? p.enParts(kcal).n : commas(kcal); }
  function gq(g) { return g == null ? '\u2013' : String(Math.round(g)); }
  function eu() { let p = PF(); return p ? p.enU() : 'kcal'; }
  function isKg() { let p = PF(); return !!p && p.wtU() === 'kg'; }
  function clkS(t) { let p = PF(); return t && p ? p.clkStr(t) : t; }
  function h24() { let p = PF(); return !!p && p.get('units.clock') === '24'; }
  function clkT(s) { let p = PF(); return p ? p.clkText(s) : s; }
  function hourLabel(h) { if (h24()) return ('0' + (h % 24)).slice(-2) + ':00'; let x = h % 12 === 0 ? 12 : h % 12; return x + (h < 12 || h === 24 ? ' AM' : ' PM'); }
  function nowHour(ctx) { return ctx.data.now.getHours() + ctx.data.now.getMinutes() / 60; }
  function letters(ctx, n) { let dl = ctx.data.dayLabels, out = [], i; for (i = 0; i < n; i++) out.push(dl[dl.length - n + i].charAt(0)); return out; }

  /* ---------- materials ---------- */
  /* light and shade for the one light source above (the same white and black tiledepth.js mixes in); never a colour that means something */
  let LIGHT = '#FFFFFF', SHADE = '#000000';
  function dk(ctx) { return DP.isDark(ctx.T); }
  /* earlier days and secondary marks: the pillar colour eased toward the surface (opaque, so nothing shows through) */
  function past(ctx, col) { return DP.mix(col, ctx.T.surface, dk(ctx) ? 0.45 : 0.42); }
  /* the floor of a recessed track in SVG; the #sid-sink filter adds the inner shadow on its top edge */
  function wellCol(ctx) { return dk(ctx) ? DP.mix(ctx.T.surface, SHADE, 0.22) : DP.mix(ctx.T.bg, ctx.T.text, 0.06); }
  function lum(hx) { let c = hx.replace('#', ''); return (0.2126 * parseInt(c.substr(0, 2), 16) + 0.7152 * parseInt(c.substr(2, 2), 16) + 0.0722 * parseInt(c.substr(4, 2), 16)) / 255; }
  function onFill(ctx, hx) { return lum(hx) > 0.5 ? (dk(ctx) ? ctx.T.bg : ctx.T.text) : (dk(ctx) ? ctx.T.text : ctx.T.surface); }
  /* top-lit gradient in user space, so arcs and thin strokes shade as one surface */
  function ugrad(ctx, id, col, y0, y1) {
    let d = dk(ctx);
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + R(y0) + '" x2="0" y2="' + R(y1) + '">' +
      '<stop offset="0" stop-color="' + DP.mix(col, LIGHT, d ? 0.24 : 0.16) + '"/><stop offset=".6" stop-color="' + col + '"/><stop offset="1" stop-color="' + DP.mix(col, SHADE, d ? 0.14 : 0.06) + '"/></linearGradient>';
  }
  function defs(ctx, sid, extra) { return DP.defs(ctx.T, sid, []) + (extra ? '<defs>' + extra + '</defs>' : ''); }
  function sink(sid) { return ' filter="url(#' + sid + '-sink)"'; }
  function lift(sid) { return ' filter="url(#' + sid + '-lift)"'; }
  /* small coloured halo behind the end of a single hero mark */
  function glow(sid, x, y, r, col) { return '<circle cx="' + R(x) + '" cy="' + R(y) + '" r="' + R(r) + '" fill="' + col + '" fill-opacity="0.55" filter="url(#' + sid + '-glow)"/>'; }

  /* ---------- polar helpers: degrees clockwise from 12 o'clock ---------- */
  function polar(cx, cy, r, deg) { let a = deg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }
  function arcD(cx, cy, r, d0, d1) {
    let p0 = polar(cx, cy, r, d0), p1 = polar(cx, cy, r, d1);
    return 'M' + R(p0[0]) + ' ' + R(p0[1]) + ' A' + R(r) + ' ' + R(r) + ' 0 ' + (d1 - d0 > 180 ? 1 : 0) + ' 1 ' + R(p1[0]) + ' ' + R(p1[1]);
  }
  function arcPath(cx, cy, r, d0, d1, stroke, sw, cap, extra) {
    if (d1 - d0 >= 359.9) return '<circle cx="' + R(cx) + '" cy="' + R(cy) + '" r="' + R(r) + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"' + (extra || '') + '/>';
    return '<path d="' + arcD(cx, cy, r, d0, d1) + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="' + (cap || 'butt') + '"' + (extra || '') + '/>';
  }
  /* A recessed arc track with a raised, top-lit fill on it. fracs are parts of the full sweep (meals), split by hairline gaps.
     The end gets a round cap and, for a hero arc, a small halo. */
  function arcMeter(ctx, sid, cx, cy, r, sw, a0, a1, fracs, col, opt) {
    opt = opt || {};
    let sweep = a1 - a0, ring = sweep >= 360, gap = fracs.length > 1 ? (opt.gap || 2.2) : 0, s = '', i, cum = 0, tot = 0, g = 'url(#' + sid + '-u)';
    for (i = 0; i < fracs.length; i++) tot += fracs[i];
    tot = clamp(tot, 0, 1);
    s += defs(ctx, sid, ugrad(ctx, sid + '-u', col, cy - r - sw / 2, cy + r + sw / 2));
    s += ring ? arcPath(cx, cy, r, 0, 360, wellCol(ctx), sw, '', sink(sid)) : arcPath(cx, cy, r, a0, a1, wellCol(ctx), sw, 'round', sink(sid));
    if (tot <= 0.002) return s;
    let end = a0 + sweep * tot, pe = polar(cx, cy, r, end), ps = polar(cx, cy, r, a0), closed = ring && tot >= 1;
    if (opt.glow !== false && !closed) s += glow(sid, pe[0], pe[1], sw / 2 + 1, col);
    s += '<g' + lift(sid) + '>';
    if (closed && gap === 0) s += arcPath(cx, cy, r, 0, 360, g, sw);
    else {
      for (i = 0; i < fracs.length; i++) {
        let fa = clamp(cum, 0, tot), fb = clamp(cum + fracs[i], 0, tot); cum += fracs[i];
        let d0 = a0 + sweep * fa + (i ? gap / 2 : 0), d1 = a0 + sweep * fb - (fb < tot - 1e-6 ? gap / 2 : 0);
        if (d1 - d0 > 0.3) s += arcPath(cx, cy, r, d0, d1, g, sw);
      }
      if (!closed) {
        s += '<circle cx="' + R(ps[0]) + '" cy="' + R(ps[1]) + '" r="' + R(sw / 2) + '" fill="' + g + '"/>';
        s += '<circle cx="' + R(pe[0]) + '" cy="' + R(pe[1]) + '" r="' + R(sw / 2) + '" fill="' + g + '"/>';
      }
    }
    return s + '</g>';
  }

  /* ---------- shared tile chrome ---------- */
  function root(id, key, ctx, aria, inner) {
    let T = ctx.T;
    return '<div class="ts2-' + id + '-' + key + '" role="img" aria-label="' + esc(aria) + '" style="box-sizing:border-box;width:' + ctx.frame.w + 'px;height:' + ctx.frame.h +
      'px;border-radius:20px;' + DP.tile(T) + 'overflow:hidden;position:relative;font-family:' + FB + ';color:' + T.text + '">' + inner + '</div>';
  }
  function head(ctx, icon, color, title, meta) {
    let T = ctx.T;
    return '<div style="position:absolute;left:' + P + 'px;top:' + P + 'px;width:' + (ctx.frame.w - 2 * P) + 'px;height:20px;display:flex;align-items:center;gap:6px;white-space:nowrap">' +
      '<span style="display:flex;flex:none;align-items:center;justify-content:center;width:18px;height:20px">' + ctx.icon(icon, 18, color) + '</span>' +
      '<span style="font-size:14px;font-weight:600;line-height:20px;color:' + T.text + '">' + title + '</span>' +
      (meta ? '<span style="margin-left:auto;font-size:13px;font-weight:500;line-height:20px;color:' + T.muted + '">' + meta + '</span>' : '') + '</div>';
  }
  function at(x, y, w, html, css) {
    return '<div style="position:absolute;left:' + R(x) + 'px;top:' + R(y) + 'px;width:' + R(w) + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (css || '') + '">' + html + '</div>';
  }
  function numHtml(T, val, unit, size) {
    return '<span style="font-family:' + FH + ';font-weight:700;font-size:' + size + 'px;letter-spacing:' + (size >= 28 ? '-0.035em' : size >= 18 ? '-0.018em' : '0') + ';font-variant-numeric:tabular-nums;color:' + T.text + '">' + val + '</span>' +
      (unit ? '<span style="font-family:' + FB + ';font-weight:600;font-size:13px;color:' + T.muted + ';margin-left:4px">' + unit + '</span>' : '');
  }
  function capCss(T) { return 'font-size:13px;line-height:16px;font-weight:500;color:' + T.muted + ';'; }
  function smallCss(T) { return 'font-size:11px;line-height:13px;font-weight:600;color:' + T.muted + ';'; }
  function strong(T, s) { return '<span style="font-family:' + FH + ';font-weight:700;font-variant-numeric:tabular-nums;color:' + T.text + '">' + s + '</span>'; }
  /* one hero number and at most one line under it: 28 pt at S and M, 40 pt at L */
  function hero(ctx, o, v) {
    let T = ctx.T, L = o.size === 'L', fs = L ? 40 : 28, w = v.w || (o.size === 'M' ? 150 : ctx.frame.w - 2 * P), h = '';
    h += at(P, 40, w, numHtml(T, v.num, v.unit, fs), 'line-height:' + (fs + 6) + 'px;');
    if (v.cap) h += at(P, L ? 88 : 76, w, v.cap, capCss(T));
    return h;
  }
  /* a small centred number with a word under it, for the middle of a ring or dial */
  function centre(ctx, cx, cy, num, unit, word, fs) {
    let T = ctx.T, w = 96;
    return at(cx - w / 2, cy - fs / 2 - (word ? 7 : 2), w, numHtml(T, num, '', fs) + (unit ? '<span style="font-size:12px;font-weight:600;color:' + T.muted + ';margin-left:2px">' + unit + '</span>' : ''), 'text-align:center;line-height:' + (fs + 4) + 'px;') +
      (word ? at(cx - w / 2, cy + fs / 2 - 1, w, word, smallCss(T) + 'text-align:center;') : '');
  }
  function full(ctx, s) {
    return '<svg style="position:absolute;left:0;top:0;display:block;overflow:visible" width="' + ctx.frame.w + '" height="' + ctx.frame.h + '" viewBox="0 0 ' + ctx.frame.w + ' ' + ctx.frame.h + '" aria-hidden="true">' + s + '</svg>';
  }
  function txt(x, y, s, fill, opt) {
    opt = opt || {};
    return '<text x="' + R(x) + '" y="' + R(y) + '" font-family="' + (opt.num ? FH : FB) + '" font-size="' + (opt.size || 11) + '" font-weight="' + (opt.weight || (opt.num ? ((opt.size || 11) <= 12 ? 600 : 700) : 600)) + '" fill="' + fill + '"' +
      (opt.anchor ? ' text-anchor="' + opt.anchor + '"' : '') + (opt.num ? ' style="font-variant-numeric:tabular-nums"' : '') + '>' + s + '</text>';
  }
  /* HTML material boxes */
  function box(x, y, w, h, css, inner) {
    return '<div style="position:absolute;left:' + R(x) + 'px;top:' + R(y) + 'px;width:' + R(w) + 'px;height:' + R(h) + 'px;box-sizing:border-box;' + css + '">' + (inner || '') + '</div>';
  }
  /* a recessed cell or track with a raised fill: dir 'up' fills from the bottom, 'right' from the left */
  function cell(ctx, x, y, w, h, r, f, col, dir, extra) {
    let T = ctx.T, inner = '';
    f = clamp(f, 0, 1);
    if (f > 0.002) {
      let up = dir === 'up', fw = up ? w : Math.max(f >= 1 ? w : Math.min(w, r * 1.2), w * f), fh = up ? Math.max(f >= 1 ? h : Math.min(h, r * 1.2), h * f) : h;
      inner = '<div style="position:absolute;left:0;' + (up ? 'bottom:0;' : 'top:0;') + 'width:' + R(fw) + 'px;height:' + R(fh) + 'px;' + DP.raised(col, T, r) + '"></div>';
    }
    return box(x, y, w, h, DP.well(T, r) + 'overflow:hidden;' + (extra || ''), inner);
  }
  function lbl(ctx, x, y, w, s, align, bold) {
    let T = ctx.T;
    return at(x, y, w, s, smallCss(T) + 'text-align:' + (align || 'left') + ';' + (bold ? 'color:' + T.text + ';font-weight:700;' : ''));
  }

  let OPT_SIZE_SM = { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide']] };
  let OPT_SIZE_SML = { id: 'size', label: 'Size', choices: [['S', 'Small'], ['M', 'Wide'], ['L', 'Large']] };
  let OPT_RANGE = { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] };
  let OPT_EAT = { id: 'show', label: 'Shows', choices: [['eaten', 'Eaten'], ['left', 'Left']] };

  /* =====================================================================
     CALORIES
     ===================================================================== */
  function calModel(ctx, o) {
    let c = ctx.data.calories, left = Math.max(0, c.goal - c.today), isLeft = o.show === 'left';
    return {
      c: c, left: left, isLeft: isLeft,
      num: ek(isLeft ? left : c.today),
      cap: isLeft ? 'left of ' + ek(c.goal) + ' ' + eu() : 'of ' + ek(c.goal) + ' ' + eu(),
      capS: isLeft ? 'left of ' + ek(c.goal) : 'of ' + ek(c.goal),
      aria: 'Calories: ' + ek(c.today) + ' of ' + ek(c.goal) + ' ' + eu() + ' eaten today, ' + ek(left) + ' left, across ' + c.meals.length + ' meals.'
    };
  }

  /* A: Ring. The goal is the full ring; each meal is a raised stretch of it in order, split by a hairline gap. */
  function caloriesA(o, ctx) {
    let T = ctx.T, m = calModel(ctx, o), c = m.c, col = T.food, h = '', sid = ctx.uid + '-ca';
    let fr = c.meals.map(function (x) { return x.kcal / c.goal; });
    h += head(ctx, 'calories', col, 'Calories');
    if (o.size === 'S') {
      h += full(ctx, arcMeter(ctx, sid, 86.5, 106, 44, 10, 0, 360, fr, col));
      h += centre(ctx, 86.5, 106, m.num, '', m.capS, 24);
    } else {
      h += hero(ctx, o, { num: m.num, unit: eu(), cap: m.cap });
      h += full(ctx, arcMeter(ctx, sid, 268, 100, 50, 12, 0, 360, fr, col));
      h += centre(ctx, 268, 100, m.isLeft ? ek(c.today) : ek(m.left), '', m.isLeft ? 'eaten' : 'left', 20);
    }
    return root('calories', 'A', ctx, m.aria, h);
  }

  /* A segmented capsule: a recessed track with raised parts laid end to end, split by hairline gaps. Returns the html and
     each part's left and right edge so labels can sit under it. */
  function segBar(ctx, x, y, w, h, parts, top, gap) {
    let T = ctx.T, inner = '', cx = 0, i, n = parts.length, edges = [];
    gap = gap == null ? 2 : gap;
    for (i = 0; i < n; i++) {
      let pw = parts[i].v / top * w, x0 = cx + (i ? gap / 2 : 0), x1 = Math.min(w, cx + pw) - (i < n - 1 ? gap / 2 : 0);
      cx += pw; edges.push([x + x0, x + x1]);
      if (x1 - x0 < 1) continue;
      let rl = i ? Math.min(3, h / 2) : h / 2, rr = i === n - 1 ? h / 2 : Math.min(3, h / 2);
      inner += '<div style="position:absolute;left:' + R(x0) + 'px;top:0;width:' + R(x1 - x0) + 'px;height:' + h + 'px;' + DP.raised(parts[i].col, T, 0) +
        'border-radius:' + R(rl) + 'px ' + R(rr) + 'px ' + R(rr) + 'px ' + R(rl) + 'px"></div>';
    }
    return { html: box(x, y, w, h, DP.well(T, h / 2) + 'overflow:hidden;', inner), edges: edges, end: x + Math.min(w, cx) };
  }
  /* a thin upright mark across a track, in the text colour: the goal when intake runs past it, or where you should be by now */
  function pin(ctx, x, y, h) { return box(x - 1, y, 2, h, 'border-radius:1px;background:' + ctx.T.text + ';'); }

  /* B: Meals. Today as one capsule as long as the goal; each meal is a raised stretch of it in order and the open part is what is left. */
  function caloriesB(o, ctx) {
    let T = ctx.T, m = calModel(ctx, o), c = m.c, col = T.food, h = '', S = o.size === 'S', L = o.size === 'L', i;
    let top = Math.max(c.goal, c.today), parts = c.meals.map(function (x) { return { v: x.kcal, col: col }; });
    let z = S ? { y: 110, w: 141, h: 20 } : (L ? { y: 128, w: 326, h: 20 } : { y: 104, w: 326, h: 16 });
    let sb = segBar(ctx, P, z.y, z.w, z.h, parts, top);
    h += head(ctx, 'calories', col, 'Calories', S ? '' : 'Today');
    h += hero(ctx, o, { num: m.num, unit: eu(), cap: S ? m.capS : m.cap });
    h += sb.html;
    if (c.today > c.goal) h += pin(ctx, P + c.goal / top * z.w, z.y - 4, z.h + 8);
    if (S) {
      h += at(P, z.y + z.h + 8, 60, c.meals.length + (c.meals.length === 1 ? ' meal' : ' meals'), capCss(T));
      h += at(P + 41, z.y + z.h + 8, 100, m.isLeft ? strong(T, ek(c.today)) + ' eaten' : strong(T, ek(m.left)) + ' left', capCss(T) + 'text-align:right;');
    } else if (!L) {
      /* under each stretch: its energy and the meal; the open part is labelled as what is left */
      let cols = c.meals.map(function (x, k) { return { a: sb.edges[k][0], v: ek(x.kcal), n: x.name }; });
      if (m.left > 0) cols.push({ a: sb.end + 1, v: ek(m.left), n: 'Left', muted: true });
      for (i = 0; i < cols.length; i++) {
        let wcol = (i < cols.length - 1 ? cols[i + 1].a : P + z.w) - cols[i].a - 2;
        h += at(cols[i].a + (S ? 1 : 0), z.y + z.h + (S ? 8 : 8), wcol, cols[i].v, 'font-family:' + FH + ';font-weight:700;font-size:' + (S ? 12 : 13) + 'px;line-height:16px;font-variant-numeric:tabular-nums;text-overflow:clip;color:' + (cols[i].muted ? T.muted : T.text) + ';');
        if (!S) h += at(cols[i].a, z.y + z.h + 25, wcol, cols[i].n, smallCss(T));
      }
    } else {
      /* one quiet row per meal, then what is left */
      let rows = c.meals.map(function (x) { return { n: x.name, t: clkS(x.time) || '', v: ek(x.kcal) }; });
      rows.push({ n: 'Left', t: 'of ' + ek(c.goal) + ' ' + eu(), v: ek(m.left), sock: true });
      for (i = 0; i < rows.length; i++) {
        let y = 166 + i * 34, r = rows[i];
        if (i) h += box(P + 22, y - 6, z.w - 22, 1, 'background:' + T.hair + ';');
        h += box(P, y + 5, 10, 10, r.sock ? DP.well(T, 5) : DP.raised(col, T, 5));
        h += at(P + 22, y, 200, '<span style="font-size:14px;font-weight:600;color:' + T.text + '">' + r.n + '</span><span style="font-size:13px;font-weight:500;color:' + T.muted + ';margin-left:8px">' + r.t + '</span>', 'line-height:20px;');
        h += at(P + z.w - 100, y, 100, '<span style="font-family:' + FH + ';font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;color:' + (r.sock ? T.muted : T.text) + '">' + r.v + '</span>', 'text-align:right;line-height:20px;');
      }
    }
    return root('calories', 'B', ctx, m.aria + ' ' + c.meals.map(function (x) { return x.name + ' ' + ek(x.kcal) + ' ' + eu(); }).join(', ') + '.', h);
  }

  /* C: Macros. Protein, carbs and fat, each a recessed track that fills toward its own target, in the colours the Food tab uses. */
  function calMacros(ctx) {
    let T = ctx.T, c = ctx.data.calories, mc = c.macros;
    /* targets: protein from the protein goal; carbs and fat as 40 and 27 percent of the calorie goal */
    return [
      { n: 'Protein', g: mc.protein, goal: ctx.data.protein.goal, col: T.food },
      { n: 'Carbs', g: mc.carbs, goal: Math.round(c.goal * 0.40 / 4), col: T.accent },
      { n: 'Fat', g: mc.fat, goal: Math.round(c.goal * 0.27 / 9), col: T.sleep }
    ];
  }
  function caloriesC(o, ctx) {
    let T = ctx.T, m = calModel(ctx, o), col = T.food, h = '', S = o.size === 'S', L = o.size === 'L', mac = calMacros(ctx), i;
    h += head(ctx, 'calories', col, 'Calories', L ? 'Macros' : '');
    h += hero(ctx, o, { num: m.num, unit: eu(), cap: S ? m.capS : m.cap });
    for (i = 0; i < 3; i++) {
      let r = mac[i], f = r.g / r.goal;
      if (S) {
        let y = 104 + i * 19;
        h += lbl(ctx, P, y, 46, r.n);
        h += cell(ctx, P + 48, y + 4, 56, 6, 3, f, r.col, 'right');
        h += at(P + 106, y, 35, strong(T, String(r.g)) + ' g', smallCss(T) + 'text-align:right;');
      } else {
        let x = L ? P : 176, w = L ? 326 : 166, yy = L ? 136 + i * 58 : 44 + i * 38, th = L ? 10 : 8;
        h += at(x, yy, 120, r.n, 'font-size:' + (L ? 14 : 13) + 'px;line-height:18px;font-weight:600;color:' + T.text + ';');
        h += at(x + w - 120, yy, 120, '<span style="font-family:' + FH + ';font-weight:700;font-size:' + (L ? 15 : 13) + 'px;font-variant-numeric:tabular-nums;color:' + T.text + '">' + r.g + '</span>' +
          '<span style="font-size:' + (L ? 13 : 12) + 'px;font-weight:500;color:' + T.muted + '"> of ' + r.goal + ' g</span>', 'text-align:right;line-height:18px;');
        h += cell(ctx, x, yy + (L ? 26 : 23), w, th, th / 2, f, r.col, 'right');
      }
    }
    return root('calories', 'C', ctx, m.aria + ' Macros: ' + mac.map(function (r) { return r.n.toLowerCase() + ' ' + r.g + ' of ' + r.goal + ' g'; }).join(', ') + '.', h);
  }

  /* D: Week. One raised column per day against a dashed goal line; earlier days are eased and today, still filling, is the bright one. */
  function caloriesD(o, ctx) {
    let T = ctx.T, m = calModel(ctx, o), c = m.c, col = T.food, h = '', s = '', S = o.size === 'S', L = o.size === 'L', n = +o.range || 7, i;
    let vals = c.series.slice(-n), avg = mean(vals.slice(0, -1)), lt = letters(ctx, 7);
    let z = S ? { x: P, y: 100, w: 141, h: 44 } : (L ? { x: P, y: 124, w: 326, h: 150 } : { x: 176, y: 46, w: 166, h: 94 });
    let top = Math.max(amax(vals), c.goal) * 1.04, step = z.w / n, bw = clamp(step * (n > 14 ? 0.62 : 0.54), 3, L ? 26 : 16), gy = z.y + z.h - c.goal / top * z.h;
    h += head(ctx, 'calories', col, 'Calories', L ? n + ' days' : '');
    h += hero(ctx, o, { num: m.num, unit: eu(), cap: S ? m.capS : 'Avg ' + strong(T, ek(avg)) + ' ' + eu() + ' a day' });
    for (i = 0; i < n; i++) {
      let bh = Math.max(bw, vals[i] / top * z.h), today = i === n - 1;
      h += box(z.x + step * (i + 0.5) - bw / 2, z.y + z.h - bh, bw, bh, DP.raised(today ? col : past(ctx, col), T, Math.min(bw / 2, 6)));
    }
    s += '<line x1="' + R(z.x) + '" y1="' + R(gy) + '" x2="' + R(z.x + z.w) + '" y2="' + R(gy) + '" stroke="' + T.text + '" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="2 4" stroke-linecap="round"/>';
    h += full(ctx, s);
    if (!S) h += at(z.x + z.w - 60, gy - 17, 60, ek(c.goal), smallCss(T) + 'text-align:right;');
    let ly = z.y + z.h + 6;
    if (n === 7) for (i = 0; i < 7; i++) h += lbl(ctx, z.x + step * i, ly, step, lt[i], 'center', i === 6);
    else h += lbl(ctx, z.x, ly, 80, md(ctx.data.days[ctx.data.days.length - n])) + lbl(ctx, z.x + z.w - 80, ly, 80, 'Today', 'right', true);
    return root('calories', 'D', ctx, m.aria + ' Last ' + n + ' days: ' + vals.map(ek).join(', ') + ' ' + eu() + ' against a ' + ek(c.goal) + ' ' + eu() + ' goal.', h);
  }

  TS2.tiles.push({
    id: 'calories', title: 'Calories', group: 'Food',
    versions: [
      {
        key: 'A', name: 'Ring',
        options: [OPT_SIZE_SM, OPT_EAT], sizes: ['S', 'M'], render: caloriesA
      },
      {
        key: 'B', name: 'Meals',
        options: [OPT_SIZE_SML, OPT_EAT], sizes: ['S', 'M', 'L'], render: caloriesB
      },
      {
        key: 'C', name: 'Macros',
        options: [OPT_SIZE_SML, OPT_EAT], sizes: ['S', 'M', 'L'], render: caloriesC
      },
      {
        key: 'D', name: 'Week',
        options: [OPT_SIZE_SML, OPT_RANGE, OPT_EAT], sizes: ['S', 'M', 'L'], render: caloriesD
      }
    ]
  });

  /* =====================================================================
     PROTEIN
     ===================================================================== */
  function proModel(ctx, o) {
    let p = ctx.data.protein, left = Math.max(0, p.goal - p.today), isLeft = o.show === 'left';
    return {
      p: p, left: left, isLeft: isLeft, num: String(isLeft ? left : p.today),
      cap: isLeft ? 'left of ' + p.goal + ' g' : 'of ' + p.goal + ' g',
      aria: 'Protein: ' + p.today + ' of ' + p.goal + ' g today, ' + left + ' g left.'
    };
  }
  function proWeek(ctx) {
    let p = ctx.data.protein, v = p.series.slice(-7);
    return { v: v, hit: v.filter(function (x) { return x >= p.goal; }).length };
  }

  /* A: Dial. A 240 degree recessed track; each meal is a raised stretch of it and the far end is the goal. */
  function proteinA(o, ctx) {
    let T = ctx.T, m = proModel(ctx, o), p = m.p, col = T.food, h = '', sid = ctx.uid + '-pa';
    let fr = p.byMeal.map(function (g) { return g / p.goal; });
    h += head(ctx, 'protein', col, 'Protein');
    if (o.size === 'S') {
      h += full(ctx, arcMeter(ctx, sid, 86.5, 106, 44, 10, -120, 120, fr, col));
      h += centre(ctx, 86.5, 102, m.num, 'g', '', 26);
      h += lbl(ctx, 86.5 - 50, 138, 100, m.isLeft ? 'left of ' + p.goal + ' g' : 'of ' + p.goal + ' g', 'center');
    } else {
      h += hero(ctx, o, { num: m.num, unit: 'g', cap: m.cap });
      h += full(ctx, arcMeter(ctx, sid, 268, 104, 52, 12, -120, 120, fr, col));
      h += centre(ctx, 268, 102, m.isLeft ? String(p.today) : String(m.left), 'g', m.isLeft ? 'eaten' : 'to go', 20);
    }
    return root('protein', 'A', ctx, m.aria + ' By meal: ' + p.byMeal.map(gq).join(', ') + ' g.', h);
  }

  /* B: Goal days. One small ring per day for the last 7 days; a day that reached the goal becomes a solid raised disc. */
  function proteinB(o, ctx) {
    let T = ctx.T, m = proModel(ctx, o), p = m.p, col = T.food, h = '', s = '', sid = ctx.uid + '-pb', wk = proWeek(ctx), lt = letters(ctx, 7), i;
    let S = o.size === 'S', L = o.size === 'L';
    let g = S ? { x: P, w: 141, cy: 122, r: 6, sw: 3, ly: 136 } : (L ? { x: P, w: 326, cy: 196, r: 17.5, sw: 5, ly: 232 } : { x: 176, w: 166, cy: 94, r: 8, sw: 3.5, ly: 112 });
    let step = g.w / 7, ex = '';
    h += head(ctx, 'protein', col, 'Protein', L ? '7 days' : '');
    h += hero(ctx, o, { num: m.num, unit: 'g', cap: S ? m.cap : 'At goal ' + strong(T, wk.hit + ' of 7') + ' days' });
    for (i = 0; i < 7; i++) ex += ugrad(ctx, sid + '-g' + i, i === 6 ? col : past(ctx, col), g.cy - g.r - g.sw, g.cy + g.r + g.sw);
    s += defs(ctx, sid, ex);
    for (i = 0; i < 7; i++) {
      let cx = g.x + step * (i + 0.5), f = clamp(wk.v[i] / p.goal, 0, 1), gr = 'url(#' + sid + '-g' + i + ')';
      if (f >= 1) s += '<circle cx="' + R(cx) + '" cy="' + g.cy + '" r="' + R(g.r + g.sw / 2) + '" fill="' + gr + '"' + lift(sid) + '/>';
      else {
        s += arcPath(cx, g.cy, g.r, 0, 360, wellCol(ctx), g.sw, '', sink(sid));
        if (f > 0.01) s += arcPath(cx, g.cy, g.r, 0, 360 * f, gr, g.sw, 'round', lift(sid));
      }
      if (L) s += txt(cx, g.cy + 4.5, gq(wk.v[i]), f >= 1 ? onFill(ctx, col) : T.text, { anchor: 'middle', num: true, size: 12, weight: 600 });
    }
    h += full(ctx, s);
    for (i = 0; i < 7; i++) h += lbl(ctx, g.x + step * i, g.ly, step, lt[i], 'center', i === 6);
    return root('protein', 'B', ctx, m.aria + ' Goal reached on ' + wk.hit + ' of the last 7 days: ' + wk.v.map(gq).join(', ') + ' g.', h);
  }

  /* C: Goal line. The goal is a recessed groove; each day is a raised bead above or below it by how far it landed from the goal. */
  function proteinC(o, ctx) {
    let T = ctx.T, m = proModel(ctx, o), p = m.p, col = T.food, h = '', s = '', sid = ctx.uid + '-pc', wk = proWeek(ctx), lt = letters(ctx, 7), i;
    let S = o.size === 'S', z = S ? { x: P, y: 104, w: 141, h: 32, ly: 144, r: 4 } : { x: 176, y: 48, w: 166, h: 80, ly: 140, r: 5.5 };
    let hi = Math.max(amax(wk.v), p.goal), lo = Math.min(amin(wk.v), p.goal), span = (hi - lo) || 1;
    let Y = function (v) { return z.y + (hi - v) / span * z.h; }, step = z.w / 7, gy = Y(p.goal);
    h += head(ctx, 'protein', col, 'Protein');
    h += hero(ctx, o, { num: m.num, unit: 'g', cap: S ? m.cap : 'Avg ' + strong(T, Math.round(mean(wk.v)) + ' g') + ' a day' });
    s += defs(ctx, sid, ugrad(ctx, sid + '-t', col, z.y - 6, z.y + z.h + 6) + ugrad(ctx, sid + '-p', past(ctx, col), z.y - 6, z.y + z.h + 6));
    s += '<rect x="' + R(z.x) + '" y="' + R(gy - 3) + '" width="' + R(z.w) + '" height="6" rx="3" fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
    for (i = 0; i < 7; i++) {
      if (wk.v[i] == null) continue;
      let cx = z.x + step * (i + 0.5), y = Y(wk.v[i]);
      if (Math.abs(y - gy) > z.r + 3) s += '<line x1="' + R(cx) + '" y1="' + R(gy) + '" x2="' + R(cx) + '" y2="' + R(y) + '" stroke="' + T.muted + '" stroke-opacity="0.45" stroke-width="1.25"/>';
    }
    let ty = Y(wk.v[6]), tx = z.x + step * 6.5;
    s += '<g' + lift(sid) + '>';
    for (i = 0; i < 7; i++) if (wk.v[i] != null) s += '<circle cx="' + R(z.x + step * (i + 0.5)) + '" cy="' + R(Y(wk.v[i])) + '" r="' + (i === 6 ? z.r + 1 : z.r) + '" fill="url(#' + sid + (i === 6 ? '-t' : '-p') + ')"/>';
    s += '</g>';
    if (!S) s += txt(z.x + z.w + 2, gy - 6, String(p.goal), T.muted, { anchor: 'end', num: true, weight: 600 });
    h += full(ctx, s);
    for (i = 0; i < 7; i++) h += lbl(ctx, z.x + step * i, z.ly, step, lt[i], 'center', i === 6);
    return root('protein', 'C', ctx, m.aria + ' Last 7 days against the ' + p.goal + ' g goal: ' + wk.v.map(gq).join(', ') + ' g.', h);
  }

  /* D: Timeline. Meals sit on a recessed groove of the day as raised discs sized by grams; the recessed socket after now is what is left. */
  function proteinD(o, ctx) {
    let T = ctx.T, m = proModel(ctx, o), p = m.p, col = T.food, meals = ctx.data.calories.meals, h = '', s = '', sid = ctx.uid + '-pd', i, j;
    let S = o.size === 'S', z = S ? { x: P, w: 141, cy: 128, rMax: 15 } : { x: 176, w: 166, cy: 96, rMax: 20 };
    let h0 = 6, h1 = 22, X = function (hr) { return z.x + clamp((hr - h0) / (h1 - h0), 0, 1) * z.w; };
    let left = m.left, mx = Math.max(amax(p.byMeal), left) || 1, rOf = function (g) { return Math.max(4, Math.sqrt(g / mx) * z.rMax); };
    let items = p.byMeal.map(function (g, k) { return { g: g, r: rOf(g || 0), x: X(meals[k] ? mealHour(meals[k].time) : 8 + k * 4), name: meals[k] ? meals[k].name : '' }; });
    if (left > 0) items.push({ g: left, r: rOf(left), x: X(nowHour(ctx)) + rOf(left), sock: true });
    /* pack left to right without overlaps, then pull back inside the zone */
    for (i = 0; i < items.length; i++) items[i].x = Math.max(items[i].x, i ? items[i - 1].x + items[i - 1].r + items[i].r + 3 : z.x + items[i].r);
    let over = items.length ? items[items.length - 1].x + items[items.length - 1].r - (z.x + z.w) : 0;
    for (i = items.length - 1; i >= 0 && over > 0; i--) {
      let room = i ? items[i].x - items[i].r - (items[i - 1].x + items[i - 1].r + 3) : items[i].x - items[i].r - z.x, mv = Math.min(over, Math.max(0, room));
      for (j = i; j < items.length; j++) items[j].x -= mv;
      over -= mv;
    }
    h += head(ctx, 'protein', col, 'Protein');
    h += hero(ctx, o, { num: m.num, unit: 'g', cap: S ? m.cap : strong(T, left + ' g') + ' to go today' });
    s += defs(ctx, sid, ugrad(ctx, sid + '-u', col, z.cy - z.rMax, z.cy + z.rMax));
    s += '<rect x="' + R(z.x) + '" y="' + R(z.cy - 3) + '" width="' + R(z.w) + '" height="6" rx="3" fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
    for (i = 0; i < items.length; i++) {
      let it = items[i];
      if (it.sock) s += '<circle cx="' + R(it.x) + '" cy="' + z.cy + '" r="' + R(it.r) + '" fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
      else s += '<circle cx="' + R(it.x) + '" cy="' + z.cy + '" r="' + R(it.r) + '" fill="url(#' + sid + '-u)"' + lift(sid) + '/>';
      if (it.r >= 10) s += txt(it.x, z.cy + (S ? 3.5 : 4), gq(it.g), it.sock ? T.muted : onFill(ctx, col), { anchor: 'middle', num: true, size: S ? 10 : 12, weight: 600 });
    }
    h += full(ctx, s);
    if (!S) for (i = 0; i < items.length; i++) h += lbl(ctx, items[i].x - 30, z.cy + z.rMax + 8, 60, items[i].sock ? 'To go' : items[i].name, 'center', items[i].sock);
    return root('protein', 'D', ctx, m.aria + ' Meals: ' + p.byMeal.map(function (g, k) { return (meals[k] ? meals[k].name : 'Meal ' + (k + 1)) + ' ' + gq(g) + ' g'; }).join(', ') + '.', h);
  }

  TS2.tiles.push({
    id: 'protein', title: 'Protein', group: 'Food',
    versions: [
      {
        key: 'A', name: 'Dial',
        options: [OPT_SIZE_SM, OPT_EAT], sizes: ['S', 'M'], render: proteinA
      },
      {
        key: 'B', name: 'Goal days',
        options: [OPT_SIZE_SML, OPT_EAT], sizes: ['S', 'M', 'L'], render: proteinB
      },
      {
        key: 'C', name: 'Goal line',
        options: [OPT_SIZE_SM, OPT_EAT], sizes: ['S', 'M'], render: proteinC
      },
      {
        key: 'D', name: 'Timeline',
        options: [OPT_SIZE_SM, OPT_EAT], sizes: ['S', 'M'], render: proteinD
      }
    ]
  });

  /* =====================================================================
     WATER
     ===================================================================== */
  /* Units follow the app's water setting (w.unit: 'oz', the default, or 'ml'), set once in the water section's Edit containers;
     totals read as whole ounces or 10 mL steps. Liters stay the stored unit. */
  let OPT_DRUNK = { id: 'show', label: 'Shows', choices: [['drunk', 'Drunk'], ['left', 'Left']] };
  function watModel(ctx, o) {
    let w = ctx.data.water, ml = w.unit === 'ml', left = Math.max(0, w.goal - w.today), isLeft = o.show === 'left';
    let F = function (v) { return ml ? commas(Math.round(v * 100) * 10) : String(Math.round(v * FLOZ)); };
    let u = ml ? 'mL' : 'oz', said = ml ? 'milliliters' : 'fluid ounces', lastH = -1, n = 0, i;
    for (i = 0; i < w.hourly.length; i++) if (w.hourly[i] > 0) { lastH = i; n++; }
    if (w.log) n = w.log.length;
    return {
      w: w, F: F, u: u, ml: ml, left: left, isLeft: isLeft, lastH: lastH, drinks: n,
      num: F(isLeft ? left : w.today), cap: (isLeft ? 'left of ' : 'of ') + F(w.goal) + ' ' + u,
      aria: 'Water: ' + F(w.today) + ' of ' + F(w.goal) + ' ' + said + ' today, ' + F(left) + ' ' + said + ' left.'
    };
  }
  /* container icons (glass, bottle, tumbler, jug) on the 24 grid with the app's 1.75 stroke; INS.icon draws them too */
  let WCI = {
    glass: '<path d="M6 4h12l-1.6 15.6a1.6 1.6 0 0 1-1.6 1.4H9.2a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M6.7 10.5h10.6"/>',
    bottle: '<path d="M10 2.75h4v2.5h-4z"/><path d="M10 5.25c0 1.6-2.75 2.4-2.75 4.75v9.5c0 .9.7 1.75 1.75 1.75h6c1 0 1.75-.85 1.75-1.75V10c0-2.35-2.75-3.15-2.75-4.75"/><path d="M7.25 12.5h9.5M7.25 16.5h9.5"/>',
    tumbler: '<path d="M5.75 7.25h12.5"/><path d="M6.5 7.25c0-1.5.9-2.5 2.4-2.5h6.2c1.5 0 2.4 1 2.4 2.5"/><path d="M6.75 7.25 7.9 19.7a1.6 1.6 0 0 0 1.6 1.45h5a1.6 1.6 0 0 0 1.6-1.45l1.15-12.45"/><path d="M13.5 4.75 15.25 1.75"/>',
    jug: '<path d="M9.25 2.75h5.5v2.75h-5.5z"/><path d="M8 5.5h8a2 2 0 0 1 2 2v12a1.75 1.75 0 0 1-1.75 1.75h-8.5A1.75 1.75 0 0 1 6 19.5v-12a2 2 0 0 1 2-2z"/><path d="M6 10.5h2.75M6 13.75h2.75M6 17h2.75"/>'
  };
  Object.keys(WCI).forEach(function (k) { TS2.icons['wc-' + k] = '<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + WCI[k] + '</g>'; });

  /* Water is drawn as a liquid: the pillar colour eased toward the surface and deepening downward, under one bright surface line. */
  function liquid(ctx, id, col, y0, y1) {
    let T = ctx.T, d = dk(ctx);
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + R(y0) + '" x2="0" y2="' + R(y1) + '">' +
      '<stop offset="0" stop-color="' + (d ? DP.mix(col, T.surface, 0.26) : DP.mix(col, LIGHT, 0.10)) + '"/><stop offset="1" stop-color="' + (d ? DP.mix(col, T.surface, 0.56) : DP.mix(col, T.text, 0.16)) + '"/></linearGradient>';
  }
  function meniscus(ctx, col) { return dk(ctx) ? col : DP.mix(col, LIGHT, 0.45); }
  /* A: Level. A recessed glass filled with water to today's level; the rim is the goal. */
  function vessel(ctx, sid, x, y, w, hh, frac, col) {
    let r = Math.min(14, w / 3), f = clamp(frac, 0, 1), s = '';
    let body = '<rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(w) + '" height="' + R(hh) + '" rx="' + R(r) + '"', yl = y + hh * (1 - f);
    s += defs(ctx, sid, liquid(ctx, sid + '-u', col, yl, y + hh) + '<clipPath id="' + sid + '-c">' + body + '/></clipPath>');
    s += body + ' fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
    if (f > 0) {
      s += '<g clip-path="url(#' + sid + '-c)"><rect x="' + R(x) + '" y="' + R(yl) + '" width="' + R(w) + '" height="' + R(hh * f + 1) + '" fill="url(#' + sid + '-u)"/>' +
        (f < 1 ? '<rect x="' + R(x) + '" y="' + R(yl) + '" width="' + R(w) + '" height="1.5" fill="' + meniscus(ctx, col) + '"/>' : '') + '</g>';
    }
    return s;
  }
  function waterA(o, ctx) {
    let m = watModel(ctx, o), w = m.w, col = ctx.T.water, h = '', sid = ctx.uid + '-wa';
    h += head(ctx, 'water', col, 'Water');
    if (o.size === 'S') {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: m.cap, w: 92 });
      h += full(ctx, vessel(ctx, sid, 113, 48, 44, 112, w.today / w.goal, col));
    } else {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: m.cap });
      h += full(ctx, vessel(ctx, sid, 236, 40, 64, 120, w.today / w.goal, col));
      h += lbl(ctx, 308, 40, 34, m.F(w.goal) + ' ' + m.u, 'left');
    }
    return root('water', 'A', ctx, m.aria, h);
  }

  /* B: Clock. A 24 hour recessed ring with midnight at the top; each drink is a raised petal at its hour, its length the amount. */
  function waterClock(ctx, sid, cx, cy, r, sw) {
    let T = ctx.T, w = ctx.data.water, col = T.water, s = '', i, mx = amax(w.hourly) || 1, ri = r - sw / 2 + 3, ro = r + sw / 2 - 3;
    s += defs(ctx, sid, ugrad(ctx, sid + '-u', col, cy - r - sw / 2, cy + r + sw / 2));
    s += arcPath(cx, cy, r, 0, 360, wellCol(ctx), sw, '', sink(sid));
    s += '<g' + lift(sid) + '>';
    for (i = 0; i < 24; i++) {
      if (w.hourly[i] <= 0) continue;
      let deg = (i + 0.5) / 24 * 360, len = (ro - ri) * (0.35 + 0.65 * w.hourly[i] / mx), p0 = polar(cx, cy, ri, deg), p1 = polar(cx, cy, ri + len, deg);
      s += '<line x1="' + R(p0[0]) + '" y1="' + R(p0[1]) + '" x2="' + R(p1[0]) + '" y2="' + R(p1[1]) + '" stroke="url(#' + sid + '-u)" stroke-width="' + (sw > 18 ? 5 : 4.5) + '" stroke-linecap="round"/>';
    }
    s += '</g>';
    let pn = polar(cx, cy, r + sw / 2 + 5, nowHour(ctx) / 24 * 360);
    s += '<circle cx="' + R(pn[0]) + '" cy="' + R(pn[1]) + '" r="2.5" fill="' + T.text + '"/>';
    return s;
  }
  function waterB(o, ctx) {
    let T = ctx.T, m = watModel(ctx, o), col = T.water, h = '', sid = ctx.uid + '-wb';
    let last = m.lastH >= 0 ? hourLabel(m.lastH) : 'none yet';
    h += head(ctx, 'water', col, 'Water');
    if (o.size === 'S') {
      h += full(ctx, waterClock(ctx, sid, 86.5, 106, 38, 18));
      h += centre(ctx, 86.5, 106, m.num, '', m.isLeft ? 'left' : m.u, 22);
    } else {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: 'Last drink ' + strong(T, last) });
      h += full(ctx, waterClock(ctx, sid, 268, 100, 42, 20));
      h += centre(ctx, 268, 100, String(m.drinks), '', m.drinks === 1 ? 'drink' : 'drinks', 20);
    }
    return root('water', 'B', ctx, m.aria + ' ' + m.drinks + ' drinks logged, the last around ' + last + '.', h);
  }

  /* C: Week levels. One recessed capsule per day as tall as the goal, filled with raised water; today is the bright one. */
  function capsules(ctx, z, vals, goal, col, maxW) {
    let n = vals.length, step = z.w / n, cw = clamp(step * 0.5, 3, maxW), h = '', i, lt = letters(ctx, 7), ch = z.h - 18;
    for (i = 0; i < n; i++) {
      h += cell(ctx, z.x + step * (i + 0.5) - cw / 2, z.y, cw, ch, cw / 2, vals[i] / goal, i === n - 1 ? col : past(ctx, col), 'up');
      if (n === 7) h += lbl(ctx, z.x + step * i, z.y + ch + 5, step, lt[i], 'center', i === 6);
    }
    if (n !== 7) h += lbl(ctx, z.x, z.y + ch + 5, 80, md(ctx.data.days[ctx.data.days.length - n])) + lbl(ctx, z.x + z.w - 80, z.y + ch + 5, 80, 'Today', 'right', true);
    return h;
  }
  function waterC(o, ctx) {
    let T = ctx.T, m = watModel(ctx, o), w = m.w, col = T.water, h = '', n = +o.range || 7;
    let vals = w.series.slice(-n), hit = vals.filter(function (v) { return v >= w.goal; }).length, avg = mean(vals.slice(0, -1));
    h += head(ctx, 'water', col, 'Water', o.size === 'L' ? n + ' days' : '');
    if (o.size === 'S') {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: m.cap });
      h += capsules(ctx, { x: P, y: 102, w: 141, h: 60 }, vals, w.goal, col, 10);
    } else if (o.size === 'M') {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: 'Avg ' + strong(T, m.F(avg) + ' ' + m.u) + ' a day' });
      h += capsules(ctx, { x: 176, y: 44, w: 166, h: 118 }, vals, w.goal, col, 14);
    } else {
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: 'Avg ' + strong(T, m.F(avg) + ' ' + m.u) + ' a day · at goal ' + strong(T, hit + ' of ' + n) });
      h += capsules(ctx, { x: P, y: 118, w: 326, h: 186 }, vals, w.goal, col, 24);
    }
    return root('water', 'C', ctx, m.aria + ' Goal reached on ' + hit + ' of the last ' + n + ' days.', h);
  }

  /* D: On pace. One recessed capsule as long as the goal, filled with water to today's amount; a pin marks where an even pace
     from 7 AM to 9 PM would have you by now, so ahead or behind reads as the gap between the water and the pin. */
  let WAKE = 7, SLEEP = 21;
  function watPace(ctx, m) {
    let w = m.w, f = clamp((nowHour(ctx) - WAKE) / (SLEEP - WAKE), 0, 1), exp = w.goal * f, d = w.today - exp, T = ctx.T;
    let cap = Math.abs(d) < 0.05 ? 'Right on pace' : (d < 0 ? strong(T, m.F(-d) + ' ' + m.u) + ' behind pace' : strong(T, m.F(d) + ' ' + m.u) + ' ahead of pace');
    if (w.today >= w.goal) cap = 'Goal reached';
    return { exp: exp, d: d, cap: cap };
  }
  function paceBar(ctx, sid, x, y, w, hh, m, pc) {
    let T = ctx.T, col = T.water, f = clamp(m.w.today / m.w.goal, 0, 1), s = '', r = hh / 2, xe = x + w * f;
    let body = '<rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(w) + '" height="' + R(hh) + '" rx="' + R(r) + '"';
    s += defs(ctx, sid, liquid(ctx, sid + '-u', col, y, y + hh) + '<clipPath id="' + sid + '-c">' + body + '/></clipPath>');
    s += body + ' fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
    if (f > 0) {
      s += '<g clip-path="url(#' + sid + '-c)"><rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(Math.max(r * 2, w * f)) + '" height="' + R(hh) + '" rx="' + R(r) + '" fill="url(#' + sid + '-u)"/>' +
        (f < 1 ? '<rect x="' + R(xe - 1.5) + '" y="' + R(y) + '" width="1.5" height="' + R(hh) + '" fill="' + meniscus(ctx, col) + '"/>' : '') + '</g>';
    }
    let xp = x + w * clamp(pc.exp / m.w.goal, 0, 1);
    s += '<rect x="' + R(xp - 1) + '" y="' + R(y - 5) + '" width="2" height="' + R(hh + 10) + '" rx="1" fill="' + T.text + '"' + lift(sid) + '/>';
    return { svg: s, xp: xp };
  }
  function waterD(o, ctx) {
    let T = ctx.T, m = watModel(ctx, o), col = T.water, h = '', sid = ctx.uid + '-wd', S = o.size === 'S', pc = watPace(ctx, m);
    let z = S ? { y: 112, w: 141, h: 18 } : { y: 118, w: 326, h: 20 };
    let pb = paceBar(ctx, sid, P, z.y, z.w, z.h, m, pc), by = m.F(pc.exp) + ' ' + m.u + ' by now';
    h += head(ctx, 'water', col, 'Water', S ? '' : 'Today');
    h += hero(ctx, o, { num: m.num, unit: m.u, cap: S ? m.cap : pc.cap, w: S ? 141 : 326 });
    h += full(ctx, pb.svg);
    if (S) h += at(P, z.y + z.h + 8, 141, pc.cap, capCss(T));
    else {
      h += lbl(ctx, clamp(pb.xp - 50, P, P + z.w - 100), z.y - 22, 100, by, 'center');
      h += lbl(ctx, P, z.y + z.h + 9, 120, m.drinks + (m.drinks === 1 ? ' drink' : ' drinks'));
      h += lbl(ctx, P + z.w - 120, z.y + z.h + 9, 120, 'Goal ' + m.F(m.w.goal) + ' ' + m.u, 'right', true);
    }
    return root('water', 'D', ctx, m.aria + ' An even pace from ' + hourLabel(WAKE) + ' to ' + hourLabel(SLEEP) + ' would be ' + m.F(pc.exp) + ' ' + m.u + ' by now; you are ' + m.F(Math.abs(pc.d)) + ' ' + m.u + (pc.d < 0 ? ' behind it.' : ' ahead of it.'), h);
  }

  /* ---------- quick log: buttons inside a tile ----------
     Tiles that log in place are a group (not an image) holding real buttons. Each button carries data-ql (water, meal, food or saved)
     and its payload; the host (Home) logs on tap and ignores them while editing. Press state: a small scale and a darker tint, or
     only a fade with Reduce Motion. Every button is at least 44 pt to the finger (small round ones grow their hit area).
     Native: Pressable with an Animated scale of 0.93 and Haptics.impactAsync(Light) on log. */
  let QCSS = [
    '.ts2-qb{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:4px;margin:0;padding:0;border:0;outline:none;cursor:pointer;font:inherit;color:inherit;text-align:left;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:manipulation;transition:transform .14s cubic-bezier(.2,.8,.2,1),filter .14s linear,opacity .14s linear}',
    '.ts2-qb:active{transform:scale(.94);filter:brightness(.9)}',
    '.ts2-qb:focus-visible{outline:2px solid var(--accent,currentColor);outline-offset:2px}',
    '.ts2-qb-s::after{content:"";position:absolute;inset:-7px;border-radius:50%}',
    '.ts2-qb>*{pointer-events:none}',
    '.ts2-water-E>svg,.ts2-logMeal-A>svg,.ts2-logMeal-B>svg{pointer-events:none}',
    '.phone[data-rm="on"] .ts2-qb{transition:opacity .12s linear}',
    '.phone[data-rm="on"] .ts2-qb:active{transform:none;filter:none;opacity:.55}'
  ].join('\n');
  function groot(id, key, ctx, aria, inner) {
    let T = ctx.T;
    return '<div class="ts2-' + id + '-' + key + '" role="group" aria-label="' + esc(aria) + '" style="box-sizing:border-box;width:' + ctx.frame.w + 'px;height:' + ctx.frame.h +
      'px;border-radius:20px;' + DP.tile(T) + 'overflow:hidden;position:relative;font-family:' + FB + ';color:' + T.text + '">' + inner + '</div>';
  }
  function qbtn(x, y, w, h, css, attrs, aria, inner, small) {
    return '<button type="button" class="ts2-qb' + (small ? ' ts2-qb-s' : '') + '" ' + attrs + ' aria-label="' + esc(aria) + '" style="left:' + R(x) + 'px;top:' + R(y) + 'px;width:' + R(w) + 'px;height:' + R(h) + 'px;' + css + '">' + inner + '</button>';
  }
  /* a tinted plate button: a raised neutral plate with the label in the pillar colour */
  function qplate(ctx, x, y, w, h, col, label, attrs, aria) {
    let T = ctx.T, tight = w < 76;
    return qbtn(x, y, w, h, DP.plate(T, 14) + 'color:' + col + ';gap:' + (tight ? 2 : 4) + 'px;', attrs, aria,
      ctx.icon('plus', tight ? 13 : 15, col) + '<span style="font-family:' + FB + ';font-size:' + (tight ? 13 : 14) + 'px;font-weight:700;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums">' + label + '</span>');
  }
  /* a round plus: raised in the pillar colour when it is the main action, otherwise a soft tint of it */
  function qplus(ctx, x, y, d, col, raised, attrs, aria) {
    let T = ctx.T, fg = raised ? T.onAccent : col;
    let bg = raised ? DP.raised(col, T, d / 2) : 'border-radius:' + d / 2 + 'px;background:' + DP.mix(col, T.surface, dk(ctx) ? 0.8 : 0.86) + ';';
    return qbtn(x, y, d, d, bg, attrs, aria, ctx.icon('plus', Math.round(d * (raised ? 0.46 : 0.56)), fg), d < 44);
  }

  /* E: Quick add. Today against the goal on one slim capsule of water, and one-tap containers: the person's quick containers
     (Glass 8 oz, Bottle 16.9 oz, Tumbler 24 oz, Large bottle 32 oz by default; set in the water section's Edit containers).
     Small shows the first 2; wide shows up to 4 beside today's pace and what is left. Each button logs one container
     (data-ql="water" data-wc="<id>"); Home logs it with an Undo toast. */
  let WC_SAMPLE = [{ id: 'glass', name: 'Glass', oz: 8, icon: 'glass' }, { id: 'bottle', name: 'Bottle', oz: 16.9, icon: 'bottle' }, { id: 'tumbler', name: 'Tumbler', oz: 24, icon: 'tumbler' }, { id: 'large', name: 'Large bottle', oz: 32, icon: 'jug' }];
  function wcSize(c, ml) { return ml ? commas(Math.round(c.oz / FLOZ * 1000)) + ' mL' : (Math.round(c.oz * 10) / 10) + ' oz'; }
  function wcSaid(c, ml) { return ml ? Math.round(c.oz / FLOZ * 1000) + ' milliliters' : (Math.round(c.oz * 10) / 10) + ' fluid ounces'; }
  /* a container button: a raised neutral plate, the container drawn in the pillar colour, then its size (and name when wide) */
  function cplate(ctx, x, y, w, h, c, ml) {
    let T = ctx.T, col = T.water, tight = w < 72, mid = w < 100, named = w >= 150;
    let label = (named ? '<span style="color:' + T.text + ';font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0">' + esc(c.name) + '</span><span style="color:' + T.muted + ';font-weight:600;flex:none">·</span>' : '') +
      (tight ? '<span style="flex:none;font-variant-numeric:tabular-nums">' + wcSize(c, ml).replace(/ (oz|mL)$/, '<span style="font-size:10.5px;font-weight:600;margin-left:1.5px;letter-spacing:0">$1</span>') + '</span>'
        : '<span style="flex:none;font-variant-numeric:tabular-nums">' + wcSize(c, ml) + '</span>');
    return qbtn(x, y, w, h, DP.plate(T, 14) + 'color:' + col + ';gap:' + (tight ? 2 : mid ? 4 : 6) + 'px;padding:0 ' + (tight ? 2 : mid ? 6 : 12) + 'px;', 'data-ql="water" data-wc="' + esc(c.id) + '"', 'Add ' + c.name + ', ' + wcSaid(c, ml),
      '<span style="display:flex;flex:none">' + ctx.icon('wc-' + c.icon, tight ? 16 : 18, col) + '</span><span style="display:flex;align-items:center;gap:5px;min-width:0;font-family:' + FB + ';font-size:' + (tight ? 13 : 14) + 'px;font-weight:700;line-height:1;white-space:nowrap;letter-spacing:' + (tight ? '-.02em' : '-.01em') + '">' + label + '</span>');
  }
  function liquidBar(ctx, sid, x, y, w, hh, f) {
    let col = ctx.T.water, s = '', r = hh / 2, xe = x + w * f;
    let body = '<rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(w) + '" height="' + R(hh) + '" rx="' + R(r) + '"';
    s += defs(ctx, sid, liquid(ctx, sid + '-u', col, y, y + hh) + '<clipPath id="' + sid + '-c">' + body + '/></clipPath>');
    s += body + ' fill="' + wellCol(ctx) + '"' + sink(sid) + '/>';
    if (f > 0) s += '<g clip-path="url(#' + sid + '-c)"><rect x="' + R(x) + '" y="' + R(y) + '" width="' + R(Math.max(r * 2, w * f)) + '" height="' + R(hh) + '" rx="' + R(r) + '" fill="url(#' + sid + '-u)"/>' +
      (f < 1 ? '<rect x="' + R(xe - 1.5) + '" y="' + R(y) + '" width="1.5" height="' + R(hh) + '" fill="' + meniscus(ctx, col) + '"/>' : '') + '</g>';
    return s;
  }
  function waterE(o, ctx) {
    let T = ctx.T, m = watModel(ctx, o), w = m.w, col = T.water, h = '', sid = ctx.uid + '-we', S = o.size === 'S', i;
    let cs = (w.containers && w.containers.length ? w.containers : WC_SAMPLE).slice(0, S ? 2 : 4), n = cs.length;
    let f = clamp(w.today / w.goal, 0, 1), pc = watPace(ctx, m);
    let togo = w.today >= w.goal ? 'Goal reached' : strong(T, m.F(m.left) + ' ' + m.u) + ' to go';
    if (S) {
      h += head(ctx, 'water', col, 'Water');
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: m.cap });
      h += full(ctx, liquidBar(ctx, sid, P, 101, 141, 6, f));
      for (i = 0; i < n; i++) h += cplate(ctx, P + i * 74.5, 116, n === 1 ? 141 : 66.5, 44, cs[i], m.ml);
    } else {
      h += head(ctx, 'water', col, 'Water', 'Goal ' + m.F(w.goal) + ' ' + m.u);
      h += hero(ctx, o, { num: m.num, unit: m.u, cap: pc.cap, w: 150 });
      h += lbl(ctx, P, 102, 150, togo);
      /* buttons on the right: 2 stacked full width (named), 3 as two then one, 4 as a 2 by 2 grid */
      let gx = 176, gw = 166, bw = (gw - 6) / 2;
      for (i = 0; i < n; i++) {
        let full2 = n <= 2 || (n === 3 && i === 2), row = n <= 2 ? i : Math.floor(i / 2), col2 = n <= 2 ? 0 : i % 2;
        h += cplate(ctx, gx + (full2 ? 0 : col2 * (bw + 6)), 40 + row * 50, full2 ? gw : bw, 44, cs[i], m.ml);
      }
      h += full(ctx, liquidBar(ctx, sid, P, 148, 326, 10, f));
    }
    return groot('water', 'E', ctx, m.aria + (S ? '' : ' ' + plain(String(pc.cap).replace(/<[^>]+>/g, '')) + '.') + ' Tap a container to add it.', h);
  }

  TS2.tiles.push({
    id: 'water', title: 'Water', group: 'Food',
    versions: [
      {
        key: 'A', name: 'Level',
        options: [OPT_SIZE_SM, OPT_DRUNK], sizes: ['S', 'M'], render: waterA
      },
      {
        key: 'B', name: 'Clock',
        options: [OPT_SIZE_SM, OPT_DRUNK], sizes: ['S', 'M'], render: waterB
      },
      {
        key: 'C', name: 'Week levels',
        options: [OPT_SIZE_SML, OPT_RANGE, OPT_DRUNK], sizes: ['S', 'M', 'L'], render: waterC
      },
      {
        key: 'D', name: 'On pace',
        options: [OPT_SIZE_SM, OPT_DRUNK], sizes: ['S', 'M'], render: waterD
      },
      {
        key: 'E', name: 'Quick add',
        options: [OPT_SIZE_SM, OPT_DRUNK], sizes: ['S', 'M'], render: waterE, css: QCSS, interactive: true
      }
    ]
  });

  /* =====================================================================
     LOG A MEAL
     Today's meals as places to log into. Reads ctx.data.mealLog (Home fills it from INS.D.food); the sample below matches INS.D.
     ===================================================================== */
  let MEAL_SAMPLE = {
    goal: 2200, eaten: 1364, pGoal: 165, pEaten: 92, next: 'dinner',
    meals: [
      { id: 'breakfast', name: 'Breakfast', time: '7:40 AM', kcal: 412, p: 26, n: 3 },
      { id: 'lunch', name: 'Lunch', time: '12:35 PM', kcal: 618, p: 61, n: 4 },
      { id: 'snack', name: 'Snack', time: '3:20 PM', kcal: 334, p: 14, n: 4 },
      { id: 'dinner', name: 'Dinner', time: null, kcal: 0, p: 0, n: 0 }
    ],
    recent: [
      { n: 'Chicken breast, grilled', q: '6 oz', kcal: 280, p: 52 }, { n: 'Greek yogurt, plain 2%', q: '1 cup', kcal: 180, p: 20 },
      { n: 'Jasmine rice', q: '1 cup cooked', kcal: 205, p: 4 }, { n: 'Banana', q: '1 medium', kcal: 105, p: 1 },
      { n: 'Eggs, scrambled', q: '2 large', kcal: 182, p: 12 }, { n: 'Protein shake', q: '1 scoop', kcal: 120, p: 24 }
    ],
    saved: [
      { id: 's0', n: 'Yogurt bowl', q: '3 foods', kcal: 412, p: 26 }, { id: 's1', n: 'Chicken and rice bowl', q: '4 foods', kcal: 618, p: 61 },
      { id: 's2', n: 'Salmon dinner', q: '3 foods', kcal: 660, p: 43 }, { id: 's3', n: 'Chili night', q: '2 foods', kcal: 530, p: 36 },
      { id: 's4', n: 'Post-lift shake', q: '2 foods', kcal: 225, p: 25 }, { id: 's5', n: 'Apple and peanut butter', q: '2 foods', kcal: 285, p: 8 }
    ]
  };
  let OPT_MVAL = { id: 'value', label: 'Shows', tray: true, choices: [['kcal', 'Calories'], ['p', 'Protein']] };
  let OPT_MLIST = { id: 'list', label: 'List', tray: true, choices: [['recent', 'Recent'], ['saved', 'Saved meals', 'Saved']] };
  function mealModel(ctx, o) {
    let src = ctx.data.mealLog || MEAL_SAMPLE, pv = o.value === 'p', d = {}, k;
    for (k in src) d[k] = src[k];
    d.recent = d.recent || MEAL_SAMPLE.recent; d.saved = d.saved || MEAL_SAMPLE.saved;
    let nx = d.meals.filter(function (x) { return x.id === d.next; })[0] || d.meals[d.meals.length - 1];
    let left = pv ? Math.max(0, d.pGoal - d.pEaten) : Math.max(0, d.goal - d.eaten);
    return {
      d: d, pv: pv, nx: nx, left: left, u: pv ? 'g' : eu(), logged: d.meals.filter(function (x) { return x.n > 0; }).length,
      V: function (x) { return pv ? gq(x.p) : ek(x.kcal); },
      W: function (x) { return pv ? gq(x.p) + ' grams of protein' : ek(x.kcal) + ' ' + eu(); },
      leftTx: (pv ? Math.round(left) + ' g' : ek(left) + ' ' + eu()) + (pv ? ' protein left' : ' left')
    };
  }
  function lower(s) { return String(s).charAt(0).toLowerCase() + String(s).slice(1); }
  function shortFood(n) { return String(n).split(',')[0]; }

  /* A: Next meal. Small: the meal that is due, what it holds so far, and one big plus. Wide: all four meals as chips, each with its
     amount or a plus; a logged meal is a raised plate, an open one a recessed socket. */
  function mealA(o, ctx) {
    let T = ctx.T, m = mealModel(ctx, o), col = T.food, h = '', i, nx = m.nx;
    let nm = lower(nx.name), aria = 'Log a meal. ' + m.logged + ' of ' + m.d.meals.length + ' meals logged today, ' + m.leftTx + '.';
    if (o.size === 'S') {
      h += head(ctx, 'pillar-food', col, nx.name, 'Next');
      /* an open meal leads with what is left today; once it holds something, with what it holds so far */
      h += nx.n ? hero(ctx, o, { num: m.V(nx), unit: m.u, cap: 'so far · ' + (m.pv ? Math.round(m.left) + ' g' : ek(m.left)) + ' left' })
        : hero(ctx, o, { num: m.pv ? String(Math.round(m.left)) : ek(m.left), unit: m.u, cap: m.pv ? 'protein left today' : 'left today' });
      for (i = 0; i < m.d.meals.length; i++) {
        let on = m.d.meals[i].n > 0, me = m.d.meals[i].id === nx.id;
        h += box(P + i * 17, 126, 13, 6, on ? DP.raised(col, T, 3) : DP.well(T, 3) + (me ? 'box-shadow:inset 0 0 0 1.5px ' + col + ';' : ''));
      }
      h += lbl(ctx, P, 140, 80, m.logged + ' of ' + m.d.meals.length + ' logged');
      h += qplus(ctx, 173 - P - 52, 176 - P - 52, 52, col, true, 'data-ql="meal" data-meal="' + esc(nx.id) + '"', 'Log ' + nm);
      return groot('logMeal', 'A', ctx, nx.name + ' is next, ' + (nx.n ? m.W(nx) + ' so far' : 'nothing logged yet') + '. ' + aria, h);
    }
    h += head(ctx, 'pillar-food', col, 'Log a meal', esc(m.leftTx));
    let cw = 159, ch = 52;
    for (i = 0; i < m.d.meals.length; i++) {
      let x = P + (i % 2) * (cw + 8), y = 48 + Math.floor(i / 2) * (ch + 8), ml = m.d.meals[i], has = ml.n > 0, next = ml.id === nx.id;
      let sub = has ? (clkS(ml.time) || 'Today') : next ? 'Next up' : 'Not logged', inner = '';
      inner += '<span style="position:absolute;left:12px;top:9px;right:' + (has ? 70 : 48) + 'px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:' + FB + ';font-size:14px;font-weight:600;line-height:18px;color:' + T.text + '">' + esc(ml.name) + '</span>';
      inner += '<span style="position:absolute;left:12px;top:27px;right:' + (has ? 70 : 48) + 'px;display:block;white-space:nowrap;font-family:' + FB + ';font-size:11.5px;font-weight:600;line-height:15px;color:' + (next && !has ? col : T.muted) + '">' + sub + '</span>';
      if (has) inner += '<span style="position:absolute;right:12px;top:0;bottom:0;display:flex;align-items:baseline;gap:2px;padding-top:17px;box-sizing:border-box;white-space:nowrap"><span style="font-family:' + FH + ';font-size:17px;font-weight:700;letter-spacing:-0.2px;font-variant-numeric:tabular-nums;color:' + T.text + '">' + m.V(ml) + '</span><span style="font-family:' + FB + ';font-size:11px;font-weight:600;color:' + T.muted + '">' + m.u + '</span></span>';
      else inner += '<span style="position:absolute;right:10px;top:10px;width:32px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;' + (next ? DP.raised(col, T, 16) : 'background:' + DP.mix(col, T.surface, dk(ctx) ? 0.8 : 0.86) + ';') + '">' + ctx.icon('plus', next ? 16 : 18, next ? T.onAccent : col) + '</span>';
      h += qbtn(x, y, cw, ch, (has ? DP.plate(T, 16) : DP.well(T, 16)) + 'display:block;', 'data-ql="meal" data-meal="' + esc(ml.id) + '"',
        has ? 'Add to ' + lower(ml.name) + ', ' + m.W(ml) + ' logged at ' + (clkS(ml.time) || 'today') : 'Log ' + lower(ml.name) + (next ? ', next up' : ', not logged yet'), inner);
    }
    return groot('logMeal', 'A', ctx, aria, h);
  }

  /* B: Quick add. Recent foods or saved meals, each with a one-tap plus that adds it to the meal due next. */
  function mealB(o, ctx) {
    let T = ctx.T, m = mealModel(ctx, o), col = T.food, h = '', L = o.size === 'L', saved = o.list === 'saved', i;
    let list = (saved ? m.d.saved : m.d.recent).slice(0, L ? 6 : 3), y0 = 46, rh = L ? (320 - P - y0) / 6 : (176 - P - y0) / 3, nm = lower(m.nx.name);
    h += head(ctx, 'pillar-food', col, 'Quick add', 'Adds to ' + nm);
    for (i = 0; i < list.length; i++) {
      let x = list[i], y = y0 + i * rh, cy = y + rh / 2;
      if (i) h += box(P, y, 326 - 44, 1, 'background:' + T.hair + ';');
      let sub = (saved ? x.q : x.q) + ' · ' + (m.pv ? ek(x.kcal) + ' ' + eu() : gq(x.p) + ' g protein');
      h += at(P, cy - (L ? 17 : 16), 200, esc(saved || L ? x.n : shortFood(x.n)), 'font-size:14px;line-height:18px;font-weight:600;color:' + T.text + ';');
      h += at(P, cy + (L ? 2 : 2), 200, esc(sub), 'font-size:11.5px;line-height:15px;font-weight:600;color:' + T.muted + ';');
      h += at(P + 326 - 44 - 96, cy - 10, 88, '<span style="font-family:' + FH + ';font-weight:700;font-size:15px;font-variant-numeric:tabular-nums;color:' + T.text + '">' + m.V(x) + '</span><span style="font-size:11px;font-weight:600;color:' + T.muted + ';margin-left:3px">' + m.u + '</span>', 'text-align:right;line-height:20px;');
      h += qplus(ctx, P + 326 - 32, cy - 16, 32, col, false, saved ? 'data-ql="saved" data-saved="' + esc(x.id) + '"' : 'data-ql="food" data-food="' + esc(x.n) + '"',
        'Add ' + x.n + ' to ' + nm + ', ' + m.W(x));
    }
    return groot('logMeal', 'B', ctx, 'Quick add to ' + nm + ': ' + list.map(function (x) { return x.n + ' ' + m.W(x); }).join(', ') + '.', h);
  }

  TS2.tiles.push({
    id: 'logMeal', title: 'Log a meal', group: 'Food',
    versions: [
      {
        key: 'A', name: 'Next meal',
        options: [OPT_SIZE_SM, OPT_MVAL], sizes: ['S', 'M'], render: mealA, css: QCSS, interactive: true
      },
      {
        key: 'B', name: 'Quick add',
        options: [{ id: 'size', label: 'Size', choices: [['M', 'Wide'], ['L', 'Large']] }, OPT_MLIST, OPT_MVAL], sizes: ['M', 'L'], render: mealB, css: QCSS, interactive: true
      }
    ]
  });

  /* =====================================================================
     WEIGHT
     ===================================================================== */
  let OPT_GOAL = { id: 'goal', label: 'Goal line', choices: [['on', 'On'], ['off', 'Off']] };
  /* weight and body fat follow Settings, Units (lb or kg); the tiles have no unit option of their own */
  let OPT_WSHOW = { id: 'show', label: 'Shows', choices: [['trend', 'Weight'], ['change', 'Change']] };
  let OPT_WRANGE = { id: 'range', label: 'Range', choices: [['30', '30 days'], ['14', '14 days'], ['7', '7 days']] };
  function wtModel(ctx, o) {
    let d = ctx.data.weight, kg = isKg(), k = kg ? KG : 1, u = kg ? 'kg' : 'lb', n = +o.range || 30, i;
    /* a day with no weigh-in stays null in raw; the trend carries through it (and starts at the first weigh-in) */
    let raw = d.series.map(function (v) { return v == null ? null : v * k; }), first = fin(raw)[0], tr = [raw[0] == null ? first : raw[0]];
    for (i = 1; i < raw.length; i++) tr.push(raw[i] == null ? tr[i - 1] : tr[i - 1] + 0.3 * (raw[i] - tr[i - 1]));
    let goal = d.goal * k, today = d.today * k;
    return {
      d: d, u: u, n: n, raw: raw, tr: tr, goal: goal, today: today, goalOn: o.goal !== 'off', isChange: o.show === 'change',
      rawN: raw.slice(-n), trN: tr.slice(-n), change: tr[tr.length - 1] - tr[tr.length - n], toGoal: today - goal
    };
  }
  function wtAria(m) {
    return 'Weight: ' + f1(m.today) + ' ' + m.u + ' at the last weigh-in, ' + clkT(m.d.lastWeighIn) + '. Trend change over ' + m.n + ' days: ' + plain(signed(m.change, true)) + ' ' + m.u + '.' +
      (m.goalOn ? ' Goal ' + f1(m.goal) + ' ' + m.u + '.' : '');
  }
  function g1(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : f1(v); }
  function smoothPath(p) {
    let d = 'M' + R(p[0][0]) + ' ' + R(p[0][1]), i;
    for (i = 1; i < p.length - 1; i++) d += ' Q' + R(p[i][0]) + ' ' + R(p[i][1]) + ' ' + R((p[i][0] + p[i + 1][0]) / 2) + ' ' + R((p[i][1] + p[i + 1][1]) / 2);
    return d + ' L' + R(p[p.length - 1][0]) + ' ' + R(p[p.length - 1][1]);
  }
  function wtHero(ctx, o, m) {
    let T = ctx.T, chg = signed(m.change, true);
    if (m.isChange) return hero(ctx, o, { num: chg, unit: m.u, cap: 'in ' + m.n + ' days · now ' + strong(T, f1(m.today)) });
    return hero(ctx, o, { num: f1(m.today), unit: m.u, cap: strong(T, chg + ' ' + m.u) + ' in ' + m.n + ' days' });
  }

  /* A: Trend. The smoothed trend as one raised line over a soft fill, with the goal as a quiet dashed floor. */
  function weightA(o, ctx) {
    let T = ctx.T, m = wtModel(ctx, o), col = T.accent, h = '', s = '', sid = ctx.uid + '-ta', S = o.size === 'S', L = o.size === 'L';
    let z = S ? { x: P, y: 104, w: 137, h: 50 } : (L ? { x: P, y: 118, w: 322, h: 160 } : { x: 176, y: 48, w: 162, h: 92 });
    let v = m.trN, lo = amin(v), hi = amax(v), pad = Math.max(0.3, (hi - lo) * 0.12);
    let top = hi + pad, bot = m.goalOn ? Math.min(lo - pad, m.goal) : lo - pad;
    let Y = function (x) { return z.y + (top - x) / (top - bot) * z.h; }, n = v.length;
    let pts = v.map(function (x, i) { return [z.x + i / (n - 1) * z.w, Y(x)]; }), line = smoothPath(pts), end = pts[n - 1];
    h += head(ctx, 'weight', col, 'Weight', L ? m.n + ' days' : '');
    h += wtHero(ctx, o, m);
    s += defs(ctx, sid, '<linearGradient id="' + sid + '-f" gradientUnits="userSpaceOnUse" x1="0" y1="' + z.y + '" x2="0" y2="' + (z.y + z.h) + '"><stop offset="0" stop-color="' + col + '" stop-opacity="' + (dk(ctx) ? 0.30 : 0.20) + '"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient>' +
      ugrad(ctx, sid + '-u', col, end[1] - 6, end[1] + 6));
    if (m.goalOn) {
      let gy = Y(m.goal);
      s += '<line x1="' + z.x + '" y1="' + R(gy) + '" x2="' + (z.x + z.w) + '" y2="' + R(gy) + '" stroke="' + T.muted + '" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="2 4" stroke-linecap="round"/>';
      if (!S) s += txt(z.x, gy - 6, 'Goal ' + g1(m.goal), T.muted, { num: true, weight: 600 });
    }
    s += '<path d="' + line + ' L' + R(z.x + z.w) + ' ' + R(z.y + z.h) + ' L' + z.x + ' ' + R(z.y + z.h) + ' Z" fill="url(#' + sid + '-f)"/>';
    s += '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"' + lift(sid) + '/>';
    s += '<circle cx="' + R(end[0]) + '" cy="' + R(end[1]) + '" r="4.5" fill="url(#' + sid + '-u)" stroke="' + DP.mix(col, LIGHT, 0.5) + '" stroke-width="1"' + lift(sid) + '/>';
    h += full(ctx, s);
    if (!S) h += lbl(ctx, z.x, z.y + z.h + 8, 80, md(ctx.data.days[ctx.data.days.length - m.n])) + lbl(ctx, z.x + z.w - 76, z.y + z.h + 8, 80, 'Today', 'right', true);
    return root('weight', 'A', ctx, wtAria(m), h);
  }

  /* B: Weeks. The last four weeks as weekly averages: each is a raised column standing on a recessed groove at the goal, so the
     columns shrink as you close in on it. This week is the bright one. */
  function weightB(o, ctx) {
    let T = ctx.T, m = wtModel(ctx, o), col = T.accent, h = '', S = o.size === 'S', L = o.size === 'L', i, days = ctx.data.days, N = m.raw.length;
    let wk = [0, 1, 2, 3].map(function (k) { let a = m.raw.slice(N - 28 + k * 7, N - 21 + k * 7); return { v: mean(a), d: days[N - 28 + k * 7] }; });
    let rate = (wk[3].v - wk[0].v) / 3, vs = wk.map(function (x) { return x.v; });
    let floor = m.goalOn ? Math.min(m.goal, amin(vs) - 0.4) : amin(vs) - Math.max(0.6, (amax(vs) - amin(vs)) * 0.5);
    let z = S ? { x: P, y: 102, w: 141, h: 38 } : (L ? { x: P, y: 146, w: 326, h: 112 } : { x: 176, y: 62, w: 166, h: 62 });
    let step = z.w / 4, bw = S ? 22 : (L ? 46 : 28), gh = S ? 6 : 8, mx = amax(vs) - floor;
    h += head(ctx, 'weight', col, 'Weight', !S && m.goalOn ? 'Goal ' + g1(m.goal) + ' ' + m.u : '');
    if (m.isChange) h += hero(ctx, o, { num: signed(rate, true), unit: m.u + (S ? '/wk' : ' a week'), cap: S ? 'weekly average' : 'Weekly average · now ' + strong(T, f1(m.today)) });
    else h += hero(ctx, o, { num: f1(m.today), unit: m.u, cap: strong(T, signed(rate, true) + ' ' + m.u) + ' a week' });
    h += box(z.x, z.y + z.h, z.w, gh, DP.well(T, gh / 2));
    for (i = 0; i < 4; i++) {
      let cx = z.x + step * (i + 0.5), bh = Math.max(bw * 0.5, (wk[i].v - floor) / mx * z.h), now = i === 3;
      h += box(cx - bw / 2, z.y + z.h - bh + gh / 2, bw, bh, DP.raised(now ? col : past(ctx, col), T, Math.min(bw / 2, L ? 12 : 8)));
      if (!S) {
        h += at(cx - 30, z.y + z.h - bh + gh / 2 - (L ? 22 : 19), 60, f1(wk[i].v), 'font-family:' + FH + ';font-weight:700;font-size:' + (L ? 14 : 12) + 'px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;color:' + (now ? T.text : T.muted) + ';');
        h += lbl(ctx, cx - step / 2, z.y + z.h + gh + 8, step, md(wk[i].d), 'center', now);
      }
    }
    return root('weight', 'B', ctx, wtAria(m) + ' Weekly averages: ' + wk.map(function (x) { return f1(x.v); }).join(', ') + ' ' + m.u + ', about ' + plain(signed(rate, true)) + ' ' + m.u + ' a week.', h);
  }

  /* C: Weigh-ins. Every weigh-in is a small raised bead and the smoothed trend is a recessed groove through them, so the daily
     noise and the real direction read apart. The latest weigh-in is the bright one. */
  function weightC(o, ctx) {
    let T = ctx.T, m = wtModel(ctx, o), col = T.accent, h = '', s = '', sid = ctx.uid + '-tc', S = o.size === 'S', L = o.size === 'L', i;
    let z = S ? { x: P + 5, y: 106, w: 131, h: 42, br: 2.2, gw: 10 } : (L ? { x: P + 8, y: 128, w: 310, h: 140, br: 3.2, gw: 16 } : { x: 184, y: 50, w: 150, h: 84, br: 2.5, gw: 12 });
    let raw = m.rawN, tr = m.trN, n = raw.length, all = raw.concat(tr).concat(m.goalOn ? [m.goal] : []);
    let lo = amin(all), hi = amax(all), pad = (hi - lo) * 0.06 || 0.3;
    lo -= pad; hi += pad;
    let X = function (k) { return z.x + k / (n - 1) * z.w; }, Y = function (v) { return z.y + (hi - v) / (hi - lo) * z.h; };
    let li = n - 1; while (li > 0 && raw[li] == null) li--;
    let tp = tr.map(function (v, k) { return [X(k), Y(v)]; }), last = [X(li), Y(raw[li])], trNow = tr[n - 1];
    h += head(ctx, 'weight', col, 'Weight', L ? m.n + ' days' : '');
    if (m.isChange) h += hero(ctx, o, { num: signed(m.change, true), unit: m.u, cap: 'trend, ' + m.n + ' days' });
    else h += hero(ctx, o, { num: f1(m.today), unit: m.u, cap: 'Trend ' + strong(T, f1(trNow) + ' ' + m.u) });
    s += defs(ctx, sid, ugrad(ctx, sid + '-p', past(ctx, col), z.y - 4, z.y + z.h + 4) + ugrad(ctx, sid + '-t', col, last[1] - 6, last[1] + 6));
    if (m.goalOn) {
      let gy = Y(m.goal);
      s += '<line x1="' + R(z.x) + '" y1="' + R(gy) + '" x2="' + R(z.x + z.w) + '" y2="' + R(gy) + '" stroke="' + T.text + '" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="2 4" stroke-linecap="round"/>';
      if (!S) s += txt(z.x + z.w, gy - 6, 'Goal ' + g1(m.goal), T.muted, { num: true, weight: 600, anchor: 'end' });
    }
    let groove = dk(ctx) ? DP.mix(T.surface, SHADE, 0.36) : DP.mix(T.bg, T.text, 0.10);
    s += '<path d="' + smoothPath(tp) + '" fill="none" stroke="' + groove + '" stroke-width="' + z.gw + '" stroke-linecap="round" stroke-linejoin="round"' + sink(sid) + '/>';
    s += '<g' + lift(sid) + '>';
    for (i = 0; i < n - 1; i++) if (raw[i] != null) s += '<circle cx="' + R(X(i)) + '" cy="' + R(Y(raw[i])) + '" r="' + z.br + '" fill="url(#' + sid + '-p)"/>';
    s += '<circle cx="' + R(last[0]) + '" cy="' + R(last[1]) + '" r="' + R(z.br + 2) + '" fill="url(#' + sid + '-t)"/></g>';
    h += full(ctx, s);
    if (!S) h += lbl(ctx, z.x - 2, z.y + z.h + 10, 80, md(ctx.data.days[ctx.data.days.length - m.n])) + lbl(ctx, z.x + z.w - 76, z.y + z.h + 10, 80, 'Today', 'right', true);
    return root('weight', 'C', ctx, wtAria(m) + ' Smoothed trend now ' + f1(trNow) + ' ' + m.u + '; weigh-ins over ' + m.n + ' days ranged from ' + f1(amin(raw)) + ' to ' + f1(amax(raw)) + ' ' + m.u + '.', h);
  }

  /* D before there is a goal: the same track with every step still recessed, and where to add the goal at its end, so the style
     reads as itself and shows what it is waiting for rather than a note in place of the tile. */
  function weightNoGoal(o, ctx, m) {
    let T = ctx.T, col = T.accent, h = '', S = o.size === 'S', segs = S ? 7 : 12, i;
    let z = S ? { x: P, y: 114, w: 141, h: 16, gap: 3 } : { x: P, y: 118, w: 326, h: 18, gap: 4 }, sw = (z.w - z.gap * (segs - 1)) / segs;
    m.goalOn = false;
    h += head(ctx, 'weight', col, 'Weight', S ? '' : 'To goal');
    h += hero(ctx, o, { num: f1(m.today), unit: m.u, cap: S ? 'No goal yet' : 'No goal weight yet', w: S ? 141 : 326 });
    for (i = 0; i < segs; i++) h += cell(ctx, z.x + i * (sw + z.gap), z.y, sw, z.h, Math.min(6, z.h / 2), 0, col, 'right');
    h += lbl(ctx, z.x, z.y + z.h + 8, 80, S ? 'Now' : 'Now ' + f1(m.today)) + lbl(ctx, z.x + z.w - 150, z.y + z.h + 8, 150, S ? 'Add a goal' : 'Add a goal in Settings', 'right', true);
    return root('weight', 'D', ctx, wtAria(m) + ' No goal weight yet. Add one in Settings, Goals, to see your progress toward it.', h);
  }

  /* D: Progress. From where the range started to the goal as recessed segments, one per lb (half a kg in kg), raised as far as the trend has come. */
  function weightD(o, ctx) {
    let T = ctx.T, m = wtModel(ctx, o), col = T.accent, h = '', S = o.size === 'S', n = m.n, i;
    if (!(m.goal > 0)) return weightNoGoal(o, ctx, m);
    let start = m.tr[m.tr.length - n], dir = m.goal < start ? -1 : 1, total = Math.abs(m.goal - start), done = clamp((m.today - start) * dir, 0, total);
    let unit = m.u === 'kg' ? 0.5 : 1; while (total / unit > 14) unit *= 2;
    let segs = Math.max(1, Math.ceil(total / unit - 1e-6)), z = S ? { x: P, y: 114, w: 141, h: 16, gap: 3 } : { x: P, y: 118, w: 326, h: 18, gap: 4 };
    let avail = z.w - z.gap * (segs - 1), x = z.x, togo = Math.max(0, total - done), word = dir < 0 ? 'lost' : 'gained', isW = o.show === 'weight';
    h += head(ctx, 'weight', col, 'Weight', S ? '' : 'To goal');
    h += hero(ctx, o, { num: isW ? f1(m.today) : f1(done), unit: isW ? m.u : m.u + ' ' + word, cap: strong(T, f1(togo) + ' ' + m.u) + ' to goal' + (S ? '' : ' of ' + g1(m.goal) + ' ' + m.u), w: S ? 141 : 326 });
    for (i = 0; i < segs; i++) {
      let span = Math.min(unit, total - i * unit) || unit, sw = avail * span / (total || unit);
      h += cell(ctx, x, z.y, sw, z.h, Math.min(6, z.h / 2), (done - i * unit) / span, col, 'right');
      x += sw + z.gap;
    }
    h += lbl(ctx, z.x, z.y + z.h + 8, 80, f1(start)) + lbl(ctx, z.x + z.w - 90, z.y + z.h + 8, 90, 'Goal ' + g1(m.goal), 'right', true);
    return root('weight', 'D', ctx, wtAria(m) + ' Progress to goal: ' + f1(done) + ' of ' + f1(total) + ' ' + m.u + ' ' + word + ' since ' + md(ctx.data.days[ctx.data.days.length - n]) + ', ' + f1(togo) + ' ' + m.u + ' to go.', h);
  }

  TS2.tiles.push({
    id: 'weight', title: 'Weight', group: 'Body',
    versions: [
      {
        key: 'A', name: 'Trend',
        options: [OPT_SIZE_SML, OPT_WRANGE, OPT_WSHOW, OPT_GOAL],
        sizes: ['S', 'M', 'L'], render: weightA
      },
      {
        key: 'B', name: 'Weeks',
        options: [OPT_SIZE_SML, { id: 'show', label: 'Shows', choices: [['trend', 'Weight'], ['change', 'Weekly change']] }, OPT_GOAL],
        sizes: ['S', 'M', 'L'], render: weightB
      },
      {
        key: 'C', name: 'Weigh-ins',
        options: [OPT_SIZE_SML, OPT_WRANGE, OPT_WSHOW, OPT_GOAL],
        sizes: ['S', 'M', 'L'], render: weightC
      },
      {
        key: 'D', name: 'Progress',
        options: [OPT_SIZE_SM, { id: 'show', label: 'Shows', choices: [['progress', 'Progress'], ['weight', 'Weight']] }, OPT_WRANGE], sizes: ['S', 'M'], render: weightD
      }
    ]
  });

  /* =====================================================================
     BODY FAT  (sparse readings: one every 2 to 3 days; last reading Sat, Nov 21)
     ===================================================================== */
  let BF_IDX = [0, 2, 5, 7, 10, 12, 15, 17, 20, 22, 25, 27];
  let OPT_BFRANGE = { id: 'range', label: 'Range', choices: [['30', '30 days'], ['14', '14 days']] };
  let OPT_BFSHOW = { id: 'show', label: 'Shows', choices: [['latest', 'Latest'], ['change', 'Change']] };
  function bfModel(ctx, o) {
    let b = ctx.data.bodyFat, D = ctx.data, n = +o.range || 30, N = b.series.length, all = [], i;
    /* the readings are the days that have one (Apple Health body fat is occasional) */
    for (i = 0; i < N; i++) if (b.series[i] != null) all.push({ i: i, v: b.series[i], d: D.days[i] });
    let rd = all.filter(function (x) { return x.i >= N - n; }), last = rd[rd.length - 1], prev = rd[rd.length - 2] || last, first = rd[0];
    return {
      b: b, n: n, N: N, rd: rd, last: last, prev: prev, first: first, isChange: o.show === 'change',
      change: last.v - first.v, dPrev: last.v - prev.v,
      aria: 'Body fat: ' + f1(last.v) + ' percent at the last reading, ' + clkT(b.lastReading) + ', ' + plain(signed(last.v - first.v, true)) + ' points since ' + md(first.d) + ' across ' + rd.length + ' readings. From Apple Health.'
    };
  }
  function bfMass(ctx, o, m) {
    /* the weigh-in on the reading's day, or the closest one before it */
    let ws = ctx.data.weight.series, j = m.last.i; while (j > 0 && ws[j] == null) j--;
    let kg = isKg(), k = kg ? KG : 1, wt = (ws[j] == null ? ctx.data.weight.today : ws[j]) * k, fat = wt * m.last.v / 100;
    return { u: kg ? 'kg' : 'lb', wt: wt, fat: fat, lean: wt - fat };
  }
  function bfHero(ctx, o, m) {
    let T = ctx.T;
    if (m.isChange) return hero(ctx, o, { num: signed(m.change, true), unit: 'pts', cap: 'since ' + md(m.first.d) + (o.size === 'S' ? '' : ' · now ' + strong(T, f1(m.last.v) + ' %')) });
    return hero(ctx, o, { num: f1(m.last.v), unit: '%', cap: o.size === 'S' ? clkT(m.b.lastReading) : strong(T, signed(m.change, true) + ' pts') + ' since ' + md(m.first.d) });
  }

  /* A: Readings. Each reading is a raised bead on its real date, joined by a hairline; the latest is the bright one. */
  function bodyFatA(o, ctx) {
    let T = ctx.T, m = bfModel(ctx, o), col = T.accent, h = '', s = '', sid = ctx.uid + '-fa', S = o.size === 'S', L = o.size === 'L', i;
    let z = S ? { x: P + 4, y: 106, w: 133, h: 46, r: 3 } : (L ? { x: P + 6, y: 126, w: 314, h: 146, r: 4.5 } : { x: 182, y: 52, w: 154, h: 80, r: 3.75 });
    let vs = m.rd.map(function (x) { return x.v; }), lo = amin(vs), hi = amax(vs), span = (hi - lo) || 1, n = m.n, N = m.N;
    let X = function (idx) { return z.x + (idx - (N - n)) / (n - 1) * z.w; }, Y = function (v) { return z.y + (hi - v) / span * z.h; };
    let pts = m.rd.map(function (r) { return [X(r.i), Y(r.v)]; }), lp = pts[pts.length - 1];
    h += head(ctx, 'weight', col, 'Body fat', L ? m.rd.length + ' readings' : '');
    h += bfHero(ctx, o, m);
    s += defs(ctx, sid, ugrad(ctx, sid + '-p', past(ctx, col), z.y - 6, z.y + z.h + 6) + ugrad(ctx, sid + '-t', col, lp[1] - 6, lp[1] + 6));
    s += '<path d="' + pts.map(function (p, k) { return (k ? 'L' : 'M') + R(p[0]) + ' ' + R(p[1]); }).join(' ') + '" fill="none" stroke="' + col + '" stroke-opacity="0.45" stroke-width="1.5" stroke-linejoin="round"/>';
    s += '<g' + lift(sid) + '>';
    for (i = 0; i < pts.length; i++) {
      let last = i === pts.length - 1;
      s += '<circle cx="' + R(pts[i][0]) + '" cy="' + R(pts[i][1]) + '" r="' + (last ? z.r + 1.5 : z.r) + '" fill="url(#' + sid + (last ? '-t' : '-p') + ')"/>';
    }
    s += '</g>';
    h += full(ctx, s);
    if (!S) h += lbl(ctx, z.x - 6, z.y + z.h + 12, 80, md(m.first.d)) + lbl(ctx, z.x + z.w - 74, z.y + z.h + 12, 80, md(m.last.d), 'right', true);
    return root('bodyFat', 'A', ctx, m.aria, h);
  }

  /* B: Dot grid. One hundred dots, one per percent of that day's weight: the raised ones are fat, the recessed ones lean. */
  function bodyFatB(o, ctx) {
    let T = ctx.T, m = bfModel(ctx, o), col = T.accent, ms = bfMass(ctx, o, m), h = '', s = '', fs = '', ls = '', sid = ctx.uid + '-fb', S = o.size === 'S', isLean = o.show === 'lean';
    let cols = S ? 20 : 10, rows = 100 / cols, g = S ? { x: P + 0.5, y: 108, dx: 7.05, dy: 9.6, r: 2.6 } : { x: 210, y: 46, dx: 11.6, dy: 11.6, r: 4.2 }, k, nf = Math.round(m.last.v);
    h += head(ctx, 'weight', col, 'Body fat');
    if (isLean) h += hero(ctx, o, { num: f1(ms.lean), unit: ms.u, cap: S ? 'lean · ' + f1(m.last.v) + ' % fat' : 'lean mass · ' + strong(T, f1(m.last.v) + ' %') + ' fat' });
    else h += hero(ctx, o, { num: f1(m.last.v), unit: '%', cap: strong(T, f1(ms.fat) + ' ' + ms.u) + ' fat' + (S ? '' : ' of ' + f1(ms.wt) + ' ' + ms.u) });
    s += defs(ctx, sid, ugrad(ctx, sid + '-u', col, g.y, g.y + rows * g.dy));
    for (k = 0; k < 100; k++) {
      /* fat fills from the bottom row up, left to right */
      let row = rows - 1 - Math.floor(k / cols), c = k % cols, cx = g.x + c * g.dx + g.r, cy = g.y + row * g.dy + g.r;
      if (k < nf) fs += '<circle cx="' + R(cx) + '" cy="' + R(cy) + '" r="' + g.r + '"/>';
      else ls += '<circle cx="' + R(cx) + '" cy="' + R(cy) + '" r="' + R(g.r * 0.82) + '"/>';
    }
    s += '<g fill="' + wellCol(ctx) + '"' + sink(sid) + '>' + ls + '</g><g fill="url(#' + sid + '-u)"' + lift(sid) + '>' + fs + '</g>';
    h += full(ctx, s);
    return root('bodyFat', 'B', ctx, m.aria + ' That is ' + f1(ms.fat) + ' ' + ms.u + ' of fat and ' + f1(ms.lean) + ' ' + ms.u + ' of lean mass at ' + f1(ms.wt) + ' ' + ms.u + '.', h);
  }

  /* C: Log. The latest readings, newest first, each with its change from the one before; the newest sits on a raised plate. */
  function bodyFatC(o, ctx) {
    let T = ctx.T, m = bfModel(ctx, o), col = T.accent, h = '', S = o.size === 'S', i;
    let k = S ? 3 : 4, rows = m.rd.slice(-k - 1).reverse(), shown = rows.slice(0, k), x0 = S ? P : 176, w = S ? 141 : 166, y0 = S ? 102 : 42, step = S ? 19 : 29, rh = S ? 18 : 26;
    h += head(ctx, 'weight', col, 'Body fat');
    h += hero(ctx, o, S ? { num: m.isChange ? signed(m.change, true) : f1(m.last.v), unit: m.isChange ? 'pts' : '%', cap: m.isChange ? 'since ' + md(m.first.d) : clkT(m.b.lastReading) } :
      (m.isChange ? { num: signed(m.change, true), unit: 'pts', cap: 'since ' + md(m.first.d) } : { num: f1(m.last.v), unit: '%', cap: clkT(m.b.lastReading) }));
    for (i = 0; i < shown.length; i++) {
      let r = shown[i], before = rows[i + 1], d = before ? r.v - before.v : null, nw = i === 0, y = y0 + step * i;
      let dTxt = d === null ? '' : (Math.abs(d) < 0.05 ? '0.0' : signed(d, true));
      let row = '<div style="display:flex;align-items:center;height:' + rh + 'px;padding:0 ' + (S ? 0 : 10) + 'px;white-space:nowrap">' +
        '<span style="flex:none;width:' + (S ? 46 : 54) + 'px;font-size:' + (S ? 11 : 12) + 'px;font-weight:' + (nw ? 700 : 600) + ';color:' + (nw ? T.text : T.muted) + '">' + md(r.d) + '</span>' +
        '<span style="font-family:' + FH + ';font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:' + (d !== null && d < 0 ? col : T.muted) + '">' + dTxt + '</span>' +
        '<span style="margin-left:auto;font-family:' + FH + ';font-weight:700;font-size:' + (S ? 13 : 14) + 'px;font-variant-numeric:tabular-nums;color:' + (nw ? T.text : T.muted) + '">' + f1(r.v) +
        '<span style="font-family:' + FB + ';font-size:11px;font-weight:600;color:' + T.muted + ';margin-left:2px">%</span></span></div>';
      h += box(x0, y, w, rh, nw && !S ? DP.plate(T, 10) : '', row);
    }
    return root('bodyFat', 'C', ctx, m.aria + ' Latest readings: ' + shown.map(function (x) { return md(x.d) + ' ' + f1(x.v) + ' percent'; }).join(', ') + '.', h);
  }

  /* D: Composition. That day's weight as one capsule split into fat and lean mass, with how each has moved since the first
     reading in the range: the change that matters when the scale barely moves. */
  function bodyFatD(o, ctx) {
    let T = ctx.T, m = bfModel(ctx, o), col = T.accent, ms = bfMass(ctx, o, m), h = '', S = o.size === 'S', L = o.size === 'L';
    let k = ms.u === 'kg' ? KG : 1, w0 = ctx.data.weight.series[m.first.i] * k, fat0 = w0 * m.first.v / 100, lean0 = w0 - fat0;
    let dF = ms.fat - fat0, dL = ms.lean - lean0, since = md(m.first.d);
    let parts = [{ v: ms.fat, col: col }, { v: ms.lean, col: past(ctx, col) }];
    let z = S ? { x: P, y: 110, w: 141, h: 18 } : (L ? { x: P, y: 136, w: 326, h: 22 } : { x: 176, y: 48, w: 166, h: 16 });
    h += head(ctx, 'weight', col, 'Body fat', L ? 'Since ' + since : '');
    if (L) h += lbl(ctx, P, 290, 200, 'Apple Health');
    h += hero(ctx, o, { num: f1(m.last.v), unit: '%', cap: S ? strong(T, signed(dF, true) + ' ' + ms.u) + ' fat mass' : strong(T, signed(m.change, true) + ' pts') + ' since ' + since });
    h += segBar(ctx, z.x, z.y, z.w, z.h, parts, ms.wt, 2).html;
    if (S) {
      h += at(P, z.y + z.h + 8, 70, 'Fat ' + strong(T, f1(ms.fat)), capCss(T));
      h += at(P + 51, z.y + z.h + 8, 90, 'Lean ' + strong(T, f1(ms.lean)), capCss(T) + 'text-align:right;');
    } else {
      /* two stat columns under the capsule: fat on the left, lean on the right, each with its change */
      let cw = L ? 150 : 80, y = z.y + z.h + (L ? 26 : 14), fs = L ? 28 : 18;
      [['Fat mass', ms.fat, dF, 'left', z.x, true], ['Lean mass', ms.lean, dL, 'right', z.x + z.w - cw, false]].forEach(function (c) {
        let css = 'text-align:' + c[3] + ';';
        h += box(c[3] === 'left' ? c[4] : c[4] + cw - 8, y + 4, 8, 8, DP.raised(c[5] ? col : past(ctx, col), T, 4), '');
        h += at(c[4] + (c[3] === 'left' ? 14 : 0), y, cw - 14, c[0], smallCss(T) + 'line-height:16px;' + css);
        h += at(c[4], y + (L ? 22 : 18), cw, numHtml(T, f1(c[1]), ms.u, fs), 'line-height:' + (fs + 4) + 'px;' + css);
        h += at(c[4], y + (L ? 58 : 42), cw, strong(T, signed(c[2], true) + ' ' + ms.u) + (L ? ' since ' + since : ''), capCss(T) + css);
      });
    }
    return root('bodyFat', 'D', ctx, m.aria + ' Of ' + f1(ms.wt) + ' ' + ms.u + ', ' + f1(ms.fat) + ' ' + ms.u + ' is fat (' + plain(signed(dF, true)) + ' since ' + since + ') and ' + f1(ms.lean) + ' ' + ms.u + ' is lean mass (' + plain(signed(dL, true)) + ').', h);
  }

  TS2.tiles.push({
    id: 'bodyFat', title: 'Body fat', group: 'Body',
    versions: [
      {
        key: 'A', name: 'Readings',
        options: [OPT_SIZE_SML, OPT_BFRANGE, OPT_BFSHOW], sizes: ['S', 'M', 'L'], render: bodyFatA
      },
      {
        key: 'B', name: 'Dot grid',
        options: [OPT_SIZE_SM, { id: 'show', label: 'Shows', choices: [['percent', 'Percent'], ['lean', 'Lean mass']] }], sizes: ['S', 'M'], render: bodyFatB
      },
      {
        key: 'C', name: 'Log',
        options: [OPT_SIZE_SM, OPT_BFRANGE, OPT_BFSHOW], sizes: ['S', 'M'], render: bodyFatC
      },
      {
        key: 'D', name: 'Composition',
        options: [OPT_SIZE_SML, OPT_BFRANGE], sizes: ['S', 'M', 'L'], render: bodyFatD
      }
    ]
  });
}
