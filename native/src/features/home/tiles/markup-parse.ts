/**
 * The small markup language Home's tile drawings are written in: positioned boxes and text runs (div, span, button) with
 * inline styles, and SVG for the marks. Parsing is plain and strict to that subset; SVG is kept whole as text, because
 * react-native-svg reads it directly.
 */
export interface MarkupElement { kind: 'el'; tag: string; attrs: Record<string, string>; style: Record<string, string>; children: MarkupNode[] }
export interface MarkupSvg { kind: 'svg'; xml: string; attrs: Record<string, string>; style: Record<string, string> }
export interface MarkupText { kind: 'text'; text: string }
export type MarkupNode = MarkupElement | MarkupSvg | MarkupText;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', thinsp: ' ', minus: '−', middot: '·', rsquo: '’', lsquo: '‘', ndash: '–', hellip: '…' };
export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Inline CSS as a map of lower-case property names (custom properties keep their leading dashes). */
export function parseStyle(css: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!css) return out;
  for (const part of css.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);

/** Parses markup into a tree. Unknown or unbalanced closing tags are ignored rather than thrown, so one stray tag never blanks a tile. */
export function parseMarkup(src: string): MarkupNode[] {
  const root: MarkupElement = { kind: 'el', tag: '#root', attrs: {}, style: {}, children: [] };
  const stack: MarkupElement[] = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(top(), src.slice(i)); break; }
    if (lt > i) pushText(top(), src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); i = e < 0 ? src.length : e + 3; continue; }
    const gt = src.indexOf('>', lt);
    if (gt < 0) { pushText(top(), src.slice(lt)); break; }
    const raw = src.slice(lt + 1, gt);
    if (raw[0] === '/') {
      const tag = raw.slice(1).trim().toLowerCase();
      const at = stack.map(e => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = gt + 1;
      continue;
    }
    const m = /^([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)(\/?)$/.exec(raw);
    if (!m) { i = gt + 1; continue; }
    const tag = m[1].toLowerCase(), attrs = parseAttrs(m[2]), selfClose = m[3] === '/' || VOID.has(tag);
    if (tag === 'svg') {
      // Keep the whole SVG (nested SVGs included) as text.
      let depth = 1, j = gt + 1;
      if (!selfClose) {
        const re = /<(\/?)svg\b[^>]*?(\/?)>/gi;
        re.lastIndex = j;
        let t: RegExpExecArray | null;
        while (depth > 0 && (t = re.exec(src))) { if (t[1]) depth--; else if (!t[2]) depth++; j = re.lastIndex; }
        if (depth > 0) j = src.length;
      }
      top().children.push({ kind: 'svg', xml: src.slice(lt, j), attrs, style: parseStyle(attrs.style) });
      i = j;
      continue;
    }
    const el: MarkupElement = { kind: 'el', tag, attrs, style: parseStyle(attrs.style), children: [] };
    top().children.push(el);
    if (!selfClose) stack.push(el);
    i = gt + 1;
  }
  return root.children;
}
function pushText(parent: MarkupElement, raw: string) {
  if (!raw) return;
  parent.children.push({ kind: 'text', text: decode(raw) });
}
