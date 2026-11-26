import { initialWindowMetrics } from 'react-native-safe-area-context';
import { layoutDock } from '@/features/shell/geometry';
import { PAGES, visiblePages, type PageKey } from '@/features/shell/pages';
import type { Hole } from './coach';

export interface Screen { width: number; height: number; insetBottom: number }
/** The phone's own bottom inset. Inside the tabs the context's bottom inset also holds the bar, so the bar is placed from this. */
export const deviceInsetBottom = () => initialWindowMetrics?.insets.bottom ?? 0;
const dock = (s: Screen, page: PageKey, hidden: Partial<Record<PageKey, boolean>>) => {
  const active = PAGES.findIndex(p => p.key === page);
  return { active, layout: layoutDock(s.width, s.height, s.insetBottom, PAGES.length, visiblePages(hidden, active), active) };
};

/** The + button on the bar, padded 6 pt, nearly round (tip 2). */
export function plusHole(s: Screen, page: PageKey, hidden: Partial<Record<PageKey, boolean>> = {}): Hole {
  const { layout } = dock(s, page, hidden), c = layout.plusCenter, half = 28 * layout.scale + 6;
  return { x: c.x - half, y: c.y - half, w: half * 2, h: half * 2, r: 40 };
}

/** The open tab's circle on the bar, padded 4 pt (the tour stops). */
export function tabHole(s: Screen, page: PageKey, hidden: Partial<Record<PageKey, boolean>> = {}): Hole {
  const { active, layout } = dock(s, page, hidden), tab = layout.tabs[active], sc = layout.scale;
  const cx = s.width / 2 + (tab.x + tab.width / 2 - s.width / 2) * sc, cy = layout.plusCenter.y, half = (tab.width / 2) * sc + 4;
  return { x: cx - half, y: cy - half, w: half * 2, h: half * 2, r: 30 };
}

/** Anything laid out on screen that can say where it is in the window: a View's ref. */
export interface Measurable { measureInWindow(callback: (x: number, y: number, w: number, h: number) => void): void }

/** A view's place in the window, padded, or null while it isn't laid out. */
export function measureHole(view: Measurable | null, pad: number, r: number): Promise<Hole | null> {
  return new Promise(resolve => {
    if (!view?.measureInWindow) { resolve(null); return; }
    view.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, r } : null));
  });
}
