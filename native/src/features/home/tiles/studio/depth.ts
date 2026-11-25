/**
 * The tile materials as the drawing code asks for them. One light from above: raised things are lighter on top and cast a
 * soft shadow, recessed tracks are darker with a shadow on their top inner edge, neutral plates sit a little above the tile.
 *
 * tile, well, raised and plate return a marker style (`--depth:...`) that the markup renderer draws as a native surface with
 * the shared depth specs (features/tiles/depth.ts). defs returns SVG filters and top-lit gradients for marks drawn in SVG.
 */
type Tokens = { surface: string; bg: string; text: string };

function hx(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** a mixed toward b by t (0..1), as hex. */
export function mix(a: string, b: string, t: number): string {
  const A = hx(a), B = hx(b);
  return '#' + A.map((v, i) => { const x = Math.round(v + (B[i] - v) * t); return (x < 16 ? '0' : '') + x.toString(16); }).join('');
}
export function rgba(h: string, a: number): string { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
export const isDark = (T: Tokens) => hx(T.surface)[0] < 128;

export type DepthKind = 'tile' | 'well' | 'raised' | 'plate';
const marker = (kind: DepthKind, r: number | null, color?: string) =>
  (r === null ? '' : `border-radius:${r}px;`) + `--depth:${kind}${color ? `;--depth-color:${color}` : ''};`;

export const studioDepth = {
  mix, rgba, isDark,
  tile: (_T: Tokens) => marker('tile', null),
  well: (_T: Tokens, r?: number | null) => marker('well', r == null ? 999 : r),
  raised: (c: string, _T: Tokens, r?: number | null) => marker('raised', r == null ? 999 : r, c),
  plate: (_T: Tokens, r?: number | null) => marker('plate', r == null ? 14 : r),
  /** SVG defs: #uid-lift (soft drop shadow), #uid-sink (inner shadow), #uid-glow (halo at a hero arc's end) and a top-lit gradient #uid-g-<i> per colour. */
  defs(T: Tokens, uid: string, cols?: readonly string[]) {
    const dk = isDark(T);
    let s = '<defs>' +
      `<filter id="${uid}-lift" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="${dk ? 2.4 : 2.2}" flood-color="#000" flood-opacity="${dk ? 0.5 : 0.16}"/></filter>` +
      `<filter id="${uid}-sink" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%"><feFlood flood-color="#000" flood-opacity="${dk ? 0.6 : 0.2}" result="f"/>` +
        '<feComposite in="f" in2="SourceAlpha" operator="out" result="inv"/><feOffset in="inv" dy="1.2" result="o"/><feGaussianBlur in="o" stdDeviation="1.1" result="b"/>' +
        '<feComposite in="b" in2="SourceAlpha" operator="in" result="sh"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge></filter>' +
      `<filter id="${uid}-glow" filterUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter>`;
    (cols ?? []).forEach((c, i) => {
      s += `<linearGradient id="${uid}-g-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c, '#FFFFFF', dk ? 0.24 : 0.16)}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#000000', dk ? 0.14 : 0.06)}"/></linearGradient>`;
    });
    return s + '</defs>';
  },
};
