import { DEFAULT_LAYOUT, WIDGETS, getWidget, type ServiceId, type WidgetId } from './registry';

/** Local-only Home layout state. Holds widget ids and service names, never health values. */
export type HomeWidgetState = {
  layout: WidgetId[];
  services: ServiceId[];
  /** Quiet dot on the Edit button after an unlock (I9b); cleared when Edit opens. */
  editDot: boolean;
  /** Unlocked widgets waiting to glow once in the tray. */
  glowPending: WidgetId[];
  /** Widgets whose glow has shown; they never glow again. */
  glowSeen: WidgetId[];
};

export type TrayItem = { id: WidgetId; title: string; locked: boolean; glow: boolean };

export const defaultHomeWidgetState = (): HomeWidgetState =>
  ({ layout: [...DEFAULT_LAYOUT], services: [], editDot: false, glowPending: [], glowSeen: [] });

export function isUnlocked(state: HomeWidgetState, id: WidgetId) {
  const service = getWidget(id).requiredService;
  return service === null || state.services.includes(service);
}

export function addWidget(state: HomeWidgetState, id: WidgetId): HomeWidgetState {
  if (state.layout.includes(id) || !isUnlocked(state, id)) return state;
  return { ...state, layout: [...state.layout, id] };
}

export function removeWidget(state: HomeWidgetState, id: WidgetId): HomeWidgetState {
  return state.layout.includes(id) ? { ...state, layout: state.layout.filter(item => item !== id) } : state;
}

export function moveWidget(state: HomeWidgetState, from: number, to: number): HomeWidgetState {
  const { length } = state.layout;
  if (from === to || from < 0 || to < 0 || from >= length || to >= length) return state;
  const layout = [...state.layout];
  const [id] = layout.splice(from, 1);
  layout.splice(to, 0, id);
  return { ...state, layout };
}

/** Unlocks a service's widgets without adding them to Home; no alerts, just the dot and a one-time glow. */
export function connectService(state: HomeWidgetState, service: ServiceId): { state: HomeWidgetState; unlocked: WidgetId[] } {
  if (state.services.includes(service)) return { state, unlocked: [] };
  const unlocked: WidgetId[] = WIDGETS.filter(widget => widget.requiredService === service).map(widget => widget.id);
  const glow = unlocked.filter(id => !state.glowSeen.includes(id) && !state.glowPending.includes(id));
  return {
    unlocked,
    state: { ...state, services: [...state.services, service], editDot: state.editDot || unlocked.length > 0, glowPending: [...state.glowPending, ...glow] },
  };
}

export const openEdit = (state: HomeWidgetState): HomeWidgetState => state.editDot ? { ...state, editDot: false } : state;

export const shouldGlow = (state: HomeWidgetState, id: WidgetId) => state.glowPending.includes(id) && !state.glowSeen.includes(id);

export function markGlowSeen(state: HomeWidgetState, id: WidgetId): HomeWidgetState {
  if (state.glowSeen.includes(id)) return state;
  return { ...state, glowPending: state.glowPending.filter(item => item !== id), glowSeen: [...state.glowSeen, id] };
}

/** Every widget not on Home, in registry order; locked ones show but cannot be added. */
export const trayItems = (state: HomeWidgetState): TrayItem[] => WIDGETS
  .filter(widget => !state.layout.includes(widget.id))
  .map(widget => ({ id: widget.id, title: widget.title, locked: !isUnlocked(state, widget.id), glow: shouldGlow(state, widget.id) }));
