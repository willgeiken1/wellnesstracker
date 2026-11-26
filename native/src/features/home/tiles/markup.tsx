import { Fragment, memo, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type DimensionValue, type TextStyle, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { plate, raised, well, type DepthSpec } from '@/features/tiles/depth';
import { TileSurface } from '@/features/tiles/tile-surface';
import { parseMarkup, type MarkupElement, type MarkupNode, type MarkupSvg } from './markup-parse';
import { STUDIO_FONT } from './studio';

/**
 * Draws a tile's markup with native views: boxes become Views (CSS block and flex layout mapped onto Yoga), text runs become
 * Text, depth materials become the shared Skia surfaces, SVG goes to react-native-svg, and quick-log buttons become Pressables
 * that call `onAction` with the button's data attributes.
 */
export interface MarkupProps {
  html: string;
  colors: ThemeColors;
  mode: ThemeMode;
  /** Quick-log buttons are live only when this is given and the tile is neither editing nor a preview. */
  onAction?: (data: Record<string, string>) => void;
  reduceMotion?: boolean;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Inherited = {
  weight: number; size: number; lineHeight?: number | { k: number }; color: string; letterSpacing?: number | { em: number };
  align?: TextStyle['textAlign']; wrap: boolean; tabular: boolean; opacity?: number;
};
interface Ctx { colors: ThemeColors; mode: ThemeMode; defs: Defs; onAction?: (data: Record<string, string>) => void; rm: boolean }

const FACE: Record<number, string> = { 500: tokens.font.body, 600: tokens.font.bodyStrong, 700: tokens.font.heading };
export const faceFor = (weight: number) => FACE[weight >= 700 ? 700 : weight >= 600 ? 600 : 500];

/* ---------- values ---------- */
function len(v: string | undefined): DimensionValue | undefined {
  if (v == null) return undefined;
  v = v.trim();
  if (v === 'auto') return 'auto';
  if (v.endsWith('%')) return v as DimensionValue;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
const num = (v: string | undefined) => { const n = len(v); return typeof n === 'number' ? n : undefined; };
function box4(v: string | undefined): [DimensionValue | undefined, DimensionValue | undefined, DimensionValue | undefined, DimensionValue | undefined] | null {
  if (!v) return null;
  const p = v.trim().split(/\s+/).map(len);
  const [a, b = a, c = a, d = b] = p;
  return [a, b, c, d];
}
function border(v: string | undefined): { w: number; c: string } | null {
  if (!v || v === 'none' || v === '0') return null;
  const m = /([\d.]+)px\s+solid\s+(.+)/.exec(v);
  return m ? { w: parseFloat(m[1]), c: m[2].trim() } : null;
}
const isHex = (c: string | undefined): c is string => !!c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim());

/* ---------- text ---------- */
function inheritText(parent: Inherited, s: Record<string, string>): Inherited {
  const out: Inherited = { ...parent };
  if (s.font) {
    const m = /^(\d{3})\s+([\d.]+)px(?:\/([\d.]+)(px)?)?/.exec(s.font);
    if (m) { out.weight = +m[1]; out.size = +m[2]; if (m[3]) out.lineHeight = m[4] ? +m[3] : { k: +m[3] }; }
  }
  if (s['font-weight']) out.weight = parseInt(s['font-weight'], 10) || out.weight;
  if (s['font-size']) out.size = parseFloat(s['font-size']) || out.size;
  if (s['line-height']) { const v = s['line-height']; out.lineHeight = v.endsWith('px') ? parseFloat(v) : v === 'normal' ? undefined : { k: parseFloat(v) }; }
  if (s.color) out.color = s.color;
  if (s['letter-spacing']) { const v = s['letter-spacing']; out.letterSpacing = v.endsWith('em') ? { em: parseFloat(v) } : parseFloat(v) || 0; }
  if (s['text-align']) out.align = s['text-align'] as TextStyle['textAlign'];
  if (s['white-space']) out.wrap = s['white-space'] !== 'nowrap';
  if (s['font-variant-numeric']) out.tabular = s['font-variant-numeric'].includes('tabular');
  return out;
}
function textStyle(t: Inherited): TextStyle {
  const lh = t.lineHeight == null ? undefined : typeof t.lineHeight === 'number' ? t.lineHeight : t.lineHeight.k * t.size;
  const ls = t.letterSpacing == null ? undefined : typeof t.letterSpacing === 'number' ? t.letterSpacing : t.letterSpacing.em * t.size;
  return {
    fontFamily: faceFor(t.weight), fontSize: t.size, color: t.color, ...(lh != null ? { lineHeight: lh } : null), ...(ls ? { letterSpacing: ls } : null),
    ...(t.tabular ? { fontVariant: ['tabular-nums'] } : null), ...(t.align ? { textAlign: t.align } : null),
  };
}
/** A span inside running text: only what text can carry. */
function spanStyle(parent: Inherited, el: MarkupElement): { inh: Inherited; style: TextStyle } {
  const inh = inheritText(parent, el.style), st = textStyle(inh);
  const op = num(el.style.opacity);
  return { inh, style: op != null ? { ...st, opacity: op } : st };
}

/* ---------- layout ---------- */
type Display = 'block' | 'flex' | 'inline' | 'inline-block';
function displayOf(el: MarkupElement): Display {
  const d = el.style.display;
  if (d === 'flex' || d === 'inline-flex') return 'flex';
  if (d === 'block') return 'block';
  if (d === 'inline-block') return 'inline-block';
  if (d === 'inline') return 'inline';
  return el.tag === 'span' || el.tag === 'b' || el.tag === 'i' || el.tag === 'em' || el.tag === 'strong' ? 'inline' : el.tag === 'button' ? 'flex' : 'block';
}
const BOX_KEYS = ['margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'background', 'background-color', 'border', 'border-top', 'border-radius', 'box-shadow', '--depth', 'float', 'width', 'height', 'position', 'vertical-align'];
const hasBox = (el: MarkupElement) => BOX_KEYS.some(k => el.style[k] != null);
const isInline = (n: MarkupNode) => n.kind === 'text' || (n.kind === 'svg' ? n.style.position !== 'absolute' : (displayOf(n) === 'inline' || displayOf(n) === 'inline-block') && n.style.position !== 'absolute');
/** Text and plain spans only: drawn as one Text with nested runs. */
const plainRun = (list: MarkupNode[]): boolean => list.every(n => n.kind === 'text' || (n.kind === 'el' && displayOf(n) === 'inline' && !hasBox(n) && plainRun(n.children)));

function viewStyle(el: MarkupElement, parentFlex: boolean): ViewStyle {
  const s = el.style, v: Mutable<ViewStyle> = {};
  const d = displayOf(el);
  if (s.position === 'absolute') v.position = 'absolute';
  if (s.inset != null) { const n = len(s.inset); v.left = n; v.top = n; v.right = n; v.bottom = n; }
  for (const k of ['left', 'top', 'right', 'bottom'] as const) if (s[k] != null) v[k] = len(s[k]);
  if (s.width != null) v.width = len(s.width);
  if (s.height != null) v.height = len(s.height);
  if (s['min-width'] != null) v.minWidth = len(s['min-width']);
  if (s['min-height'] != null) v.minHeight = len(s['min-height']);
  if (s['max-width'] != null) v.maxWidth = len(s['max-width']);
  if (d === 'flex') {
    v.flexDirection = s['flex-direction'] === 'column' ? 'column' : s['flex-direction'] === 'column-reverse' ? 'column-reverse' : s['flex-direction'] === 'row-reverse' ? 'row-reverse' : 'row';
    v.alignItems = 'stretch';
  } else v.flexDirection = 'column';
  if (s['align-items']) v.alignItems = s['align-items'] === 'start' ? 'flex-start' : s['align-items'] === 'end' ? 'flex-end' : s['align-items'] as ViewStyle['alignItems'];
  if (s['justify-content']) v.justifyContent = s['justify-content'] === 'start' ? 'flex-start' : s['justify-content'] === 'end' ? 'flex-end' : s['justify-content'] as ViewStyle['justifyContent'];
  if (s['align-self']) v.alignSelf = s['align-self'] as ViewStyle['alignSelf'];
  if (s['flex-wrap']) v.flexWrap = s['flex-wrap'] === 'wrap' ? 'wrap' : 'nowrap';
  const gap = num(s.gap); if (gap != null) v.gap = gap;
  const rg = num(s['row-gap']); if (rg != null) v.rowGap = rg;
  const cg = num(s['column-gap']); if (cg != null) v.columnGap = cg;
  if (parentFlex) {
    // CSS flex items shrink only past their content when told to (min-width:0 or clipped overflow).
    v.flexShrink = s['min-width'] === '0' || s['min-width'] === '0px' || s.overflow === 'hidden' ? 1 : 0;
    if (s.flex != null) {
      const f = s.flex.trim().split(/\s+/);
      if (f[0] === 'none') { v.flexGrow = 0; v.flexShrink = 0; }
      else if (f[0] === 'auto') { v.flexGrow = 1; v.flexShrink = 1; }
      else { v.flexGrow = parseFloat(f[0]) || 0; if (f[1] != null) v.flexShrink = parseFloat(f[1]) || 0; else v.flexShrink = 1; v.flexBasis = f[2] != null ? len(f[2]) ?? 'auto' : 0; }
    }
    if (s['flex-grow'] != null) v.flexGrow = parseFloat(s['flex-grow']);
    if (s['flex-shrink'] != null) v.flexShrink = parseFloat(s['flex-shrink']);
  }
  const pad = box4(s.padding); if (pad) { v.paddingTop = pad[0]; v.paddingRight = pad[1]; v.paddingBottom = pad[2]; v.paddingLeft = pad[3]; }
  for (const [k, rk] of [['padding-top', 'paddingTop'], ['padding-right', 'paddingRight'], ['padding-bottom', 'paddingBottom'], ['padding-left', 'paddingLeft']] as const) if (s[k] != null) v[rk] = len(s[k]);
  const mar = box4(s.margin); if (mar) { v.marginTop = mar[0]; v.marginRight = mar[1]; v.marginBottom = mar[2]; v.marginLeft = mar[3]; }
  for (const [k, rk] of [['margin-top', 'marginTop'], ['margin-right', 'marginRight'], ['margin-bottom', 'marginBottom'], ['margin-left', 'marginLeft']] as const) if (s[k] != null) v[rk] = len(s[k]);
  if (s.float === 'right') v.marginLeft = 'auto';
  const r = num(s['border-radius']); if (r != null) v.borderRadius = r;
  const bg = s['background-color'] ?? s.background;
  if (bg && !bg.includes('gradient')) v.backgroundColor = bg;
  const b = border(s.border); if (b) { v.borderWidth = b.w; v.borderColor = b.c; }
  const bt = border(s['border-top']); if (bt) { v.borderTopWidth = bt.w; v.borderTopColor = bt.c; }
  const ring = s['box-shadow'] && /^inset\s+0(px)?\s+0(px)?\s+0(px)?\s+([\d.]+)px\s+(.+)$/.exec(s['box-shadow']);
  if (ring) { v.borderWidth = parseFloat(ring[4]); v.borderColor = ring[5].trim(); }
  const op = num(s.opacity); if (op != null) v.opacity = op;
  if (s.overflow === 'hidden') v.overflow = 'hidden';
  const z = num(s['z-index']); if (z != null) v.zIndex = z;
  const va = num(s['vertical-align']); if (va) v.transform = [{ translateY: -va }];
  return v;
}

/* ---------- depth ---------- */
function depthSpec(el: MarkupElement, ctx: Ctx): DepthSpec | null {
  const kind = el.style['--depth'];
  if (!kind || kind === 'tile') return null;
  const r = num(el.style['border-radius']) ?? (kind === 'plate' ? 14 : 999);
  if (kind === 'well') return well(ctx.colors, ctx.mode, r);
  if (kind === 'plate') return plate(ctx.colors, ctx.mode, r);
  const c = el.style['--depth-color'];
  return isHex(c) ? raised(c, ctx.mode, r) : null;
}
function DepthFill({ spec, w, h, inset = 0 }: { spec: DepthSpec; w?: number; h?: number; inset?: number }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const W = w ?? size?.w, H = h ?? size?.h;
  return <View pointerEvents="none" style={{ position: 'absolute', left: -inset, top: -inset, right: -inset, bottom: -inset }}
    onLayout={w != null && h != null ? undefined : e => { const l = e.nativeEvent.layout; setSize(o => o && o.w === l.width && o.h === l.height ? o : { w: l.width, h: l.height }); }}>
    {W && H ? <TileSurface spec={spec} width={W} height={H} /> : null}
  </View>;
}

/* ---------- svg ---------- */
type Defs = Readonly<Record<string, string>>;
/** Every definition (filter, gradient) in a tile's markup by id, so an SVG can use one drawn in another. */
export function collectDefs(html: string): Defs {
  const out: Record<string, string> = {};
  for (const block of html.match(/<defs>[\s\S]*?<\/defs>/g) ?? []) {
    const re = /<(filter|linearGradient|radialGradient|clipPath|mask|pattern)\b[^>]*\bid="([^"]+)"[\s\S]*?<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) if (!(m[2] in out)) out[m[2]] = m[0];
  }
  return out;
}
/** The definitions an SVG refers to but does not hold itself. */
function missingDefs(xml: string, defs: Defs): string {
  const own = new Set<string>();
  for (const m of xml.matchAll(/\bid="([^"]+)"/g)) own.add(m[1]);
  const need = new Set<string>();
  for (const m of xml.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) { const id = m[1] ?? m[2]; if (!own.has(id) && defs[id]) need.add(id); }
  return need.size ? `<defs>${[...need].map(id => defs[id]).join('')}</defs>` : '';
}
function prepareSvg(xml: string, defs: Defs): string {
  let out = xml
    // the app's faces by weight: a face per weight, no synthesized bold
    .replace(/<(text|tspan|g|svg)\b([^>]*)>/g, (m, tag: string, attrs: string) => {
      if (!/font-family=|font-weight=/.test(attrs)) return m;
      const w = /font-weight="(\d+)"/.exec(attrs), fam = /font-family="([^"]*)"/.exec(attrs);
      if (fam && !fam[1].includes(STUDIO_FONT)) return m;
      const face = faceFor(w ? +w[1] : 500);
      let a = attrs.replace(/\s*font-weight="\d+"/, '').replace(/\s*style="font-variant-numeric:tabular-nums;?"/, '');
      a = fam ? a.replace(/font-family="[^"]*"/, `font-family="${face}"`) : `${a} font-family="${face}"`;
      return `<${tag}${a}>`;
    })
    .replace(/\s(aria-hidden|focusable|role|aria-label)="[^"]*"/g, '');
  const extra = missingDefs(out, defs);
  if (extra) out = out.replace(/^<svg\b[^>]*>/, open => `${open}${extra}`);
  return out;
}
const SvgMark = memo(function SvgMark({ node, ctx, style }: { node: MarkupSvg; ctx: Ctx; style: ViewStyle }) {
  const xml = useMemo(() => prepareSvg(node.xml, ctx.defs), [node.xml, ctx.defs]);
  const w = num(node.attrs.width), h = num(node.attrs.height);
  if (!w || !h) return null;
  return <View pointerEvents="none" style={[{ width: w, height: h }, style]}>
    <SvgXml xml={xml} width={w} height={h} color={node.style.color} style={{ overflow: 'visible' }} />
  </View>;
});

/* ---------- elements ---------- */
function renderChildren(list: MarkupNode[], inh: Inherited, ctx: Ctx, flex: boolean, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let run: MarkupNode[] = [];
  const flush = () => {
    if (!run.length) return;
    const k = `${keyBase}r${out.length}`;
    // Whitespace between boxes is not text.
    if (run.every(n => n.kind === 'text' && !n.text.trim())) { run = []; return; }
    out.push(renderRun(run, inh, ctx, k, flex));
    run = [];
  };
  list.forEach((n, i) => {
    // In a flex box every element is its own item and only bare text runs together; in a block, inline pieces share a line.
    if (flex ? n.kind === 'text' : isInline(n)) { run.push(n); return; }
    flush();
    const k = `${keyBase}${i}`;
    if (n.kind === 'svg') out.push(<SvgMark key={k} node={n} ctx={ctx} style={svgPos(n)} />);
    else if (n.kind === 'el') out.push(renderElement(n, inh, ctx, flex, k));
  });
  flush();
  return out;
}
function svgPos(n: MarkupSvg): ViewStyle {
  const s = n.style, v: Mutable<ViewStyle> = {};
  if (s.position === 'absolute') { v.position = 'absolute'; v.left = len(s.left); v.top = len(s.top); if (s.right != null) v.right = len(s.right); if (s.bottom != null) v.bottom = len(s.bottom); }
  for (const [k, rk] of [['margin-top', 'marginTop'], ['margin-right', 'marginRight'], ['margin-bottom', 'marginBottom'], ['margin-left', 'marginLeft']] as const) if (s[k] != null) v[rk] = len(s[k]);
  const va = num(s['vertical-align']); if (va) v.transform = [{ translateY: -va }];
  v.flexShrink = 0;
  return v;
}
/** Running text. Plain text and spans become one Text; with icons or boxed spans in it, a row of pieces on one baseline. */
function renderRun(run: MarkupNode[], inh: Inherited, ctx: Ctx, key: string, inFlex: boolean): ReactNode {
  const lines = inh.wrap ? undefined : 1;
  if (plainRun(run)) {
    const nested = (list: MarkupNode[], p: Inherited, kb: string): ReactNode[] => list.map((n, i) => {
      if (n.kind === 'text') return n.text.replace(/\s+/g, ' ');
      if (n.kind !== 'el') return null;
      const { inh: ci, style } = spanStyle(p, n);
      return <Text key={`${kb}${i}`} style={style}>{nested(n.children, ci, `${kb}${i}.`)}</Text>;
    });
    const parts = nested(trimRun(run), inh, `${key}.`);
    return <Text key={key} numberOfLines={lines} ellipsizeMode={lines ? 'tail' : undefined} style={[textStyle(inh), inFlex ? { flexShrink: 1 } : null]}>{parts}</Text>;
  }
  const justify = inh.align === 'center' ? 'center' : inh.align === 'right' ? 'flex-end' : 'flex-start';
  return <View key={key} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: justify, flexWrap: lines ? 'nowrap' : 'wrap', flexShrink: 1, minWidth: 0 }}>
    {trimRun(run).map((n, i) => {
      const k = `${key}.${i}`;
      if (n.kind === 'text') {
        // A space at either end of a piece becomes a margin: a line's own edge spaces are not drawn.
        const t = n.text.replace(/\s+/g, ' '), body = t.trim();
        const sp = spaceWidth(inh);
        if (!body) return t ? <View key={k} style={{ width: sp }} /> : null;
        return <Text key={k} numberOfLines={lines} style={[textStyle(inh), { marginLeft: t.startsWith(' ') ? sp : 0, marginRight: t.endsWith(' ') ? sp : 0 }]}>{body}</Text>;
      }
      if (n.kind === 'svg') return <SvgMark key={k} node={n} ctx={ctx} style={svgPos(n)} />;
      if (displayOf(n) === 'inline' && !hasBox(n) && plainRun(n.children)) {
        const { inh: ci, style } = spanStyle(inh, n);
        const t = n.children.map(c => c.kind === 'text' ? c.text : '').join('').replace(/\s+/g, ' '), sp = spaceWidth(ci);
        return <Text key={k} numberOfLines={lines} style={[style, { marginLeft: t.startsWith(' ') ? sp : 0, marginRight: t.endsWith(' ') ? sp : 0 }]}>{t.trim()}</Text>;
      }
      return renderElement(n, inh, ctx, true, k);
    })}
  </View>;
}
/** The width of one space in the app's faces (advance per em, by weight), with any letter spacing. */
function spaceWidth(t: Inherited): number {
  const em = t.weight >= 700 ? 0.178 : t.weight >= 600 ? 0.175 : 0.173;
  const ls = t.letterSpacing == null ? 0 : typeof t.letterSpacing === 'number' ? t.letterSpacing : t.letterSpacing.em * t.size;
  return em * t.size + ls;
}
/** Leading and trailing spaces of a line are not drawn. */
function trimRun(run: MarkupNode[]): MarkupNode[] {
  const out = run.slice();
  const first = out[0], last = out[out.length - 1];
  if (first?.kind === 'text') out[0] = { kind: 'text', text: first.text.replace(/^\s+/, '') };
  if (last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: (out[out.length - 1] as { text: string }).text.replace(/\s+$/, '') };
  return out;
}

/** The quick-log button's own class rules, under its inline style. */
const QB_STYLE: Readonly<Record<string, string>> = { position: 'absolute', display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '4px', 'text-align': 'left' };
function renderElement(source: MarkupElement, parentInh: Inherited, ctx: Ctx, parentFlex: boolean, key: string): ReactNode {
  const el = source.tag === 'button' && (source.attrs.class ?? '').split(/\s+/).includes('ts2-qb') ? { ...source, style: { ...QB_STYLE, ...source.style } } : source;
  const inh = inheritText(parentInh, el.style);
  const d = displayOf(el);
  const style: Mutable<ViewStyle> = viewStyle(el, parentFlex);
  const spec = depthSpec(el, ctx);
  const w = typeof style.width === 'number' ? style.width : undefined, h = typeof style.height === 'number' ? style.height : undefined;
  const kids = renderChildren(el.children, inh, ctx, d === 'flex', `${key}.`);
  // A border sits on top of the element's own fill, as in CSS, so a filled box keeps its border as an overlay.
  let ring: ReactNode = null;
  const bw = spec && typeof style.borderWidth === 'number' ? style.borderWidth : 0;
  if (bw) {
    ring = <View pointerEvents="none" style={{ position: 'absolute', left: -bw, top: -bw, right: -bw, bottom: -bw, borderRadius: style.borderRadius, borderWidth: bw, borderColor: style.borderColor }} />;
    style.borderColor = 'transparent';
  }
  const body = <>{spec ? <DepthFill spec={spec} w={w} h={h} inset={bw} /> : null}{ring}{kids}</>;
  if (el.tag === 'button' && el.attrs['data-ql'] != null) {
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.attrs)) if (k.startsWith('data-')) data[k.slice(5)] = v;
    const small = (el.attrs.class ?? '').includes('ts2-qb-s');
    const live = !!ctx.onAction;
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={el.attrs['aria-label']} disabled={!live}
      hitSlop={small ? 7 : undefined} onPress={() => ctx.onAction?.(data)}
      style={({ pressed }) => [style,
        pressed ? (ctx.rm ? { opacity: 0.55 } : { transform: [{ scale: 0.94 }], opacity: 0.9 }) : null]}>
      {body}
    </Pressable>;
  }
  return <View key={key} pointerEvents={el.style['pointer-events'] === 'none' ? 'none' : 'box-none'} style={style}>{body}</View>;
}

const BASE: Inherited = { weight: 500, size: 16, color: '#000', wrap: true, tabular: false };

/** One tile drawn from its markup. The tile frame itself (its surface and shadow) is the grid's; this draws everything on it. */
export const Markup = memo(function Markup({ html, colors, mode, onAction, reduceMotion = false }: MarkupProps) {
  const tree = useMemo(() => parseMarkup(html), [html]);
  // Every SVG in a tile shares one set of filters and gradients.
  const defs = useMemo(() => collectDefs(html), [html]);
  const ctx: Ctx = { colors, mode, defs, onAction, rm: reduceMotion };
  const inh = { ...BASE, color: colors.text };
  return <Fragment>{tree.map((n, i) => n.kind === 'el' ? renderRoot(n, inh, ctx, `m${i}`) : null)}</Fragment>;
});
function renderRoot(el: MarkupElement, inh: Inherited, ctx: Ctx, key: string): ReactNode {
  const s = el.style;
  // The root's own surface is the tile frame the grid draws; its size and padding still lay out what is inside.
  const style: Record<string, string> = { ...s, position: 'absolute', left: '0', top: '0' };
  delete style.background;
  const root: MarkupElement = { ...el, style };
  return renderElement(root, inh, ctx, false, key);
}
