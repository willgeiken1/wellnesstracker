import { DEFAULT_LAYOUT, WIDGETS, getWidget, isAvailable, type ServiceId, type WidgetId } from './registry';

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
/** Gray Home state for a placed widget whose service dropped (REDESIGN.md §2.5, FP73). */
export type DisconnectedState = { service: ServiceId; message: string; action: 'Reconnect' };
/** A Home layout entry; locked ones keep their slot and stay visible, grayed, until the service reconnects. */
export type HomeItem = { id: WidgetId; title: string; locked: boolean; disconnected: DisconnectedState | null };

const SERVICE_NAMES: Record<ServiceId, string> = { oura: 'Oura', appleHealth: 'Apple Health', fitbit: 'Fitbit', whoop: 'WHOOP' };

export const defaultHomeWidgetState = (): HomeWidgetState =>
  ({ layout: [...DEFAULT_LAYOUT], services: [], editDot: false, glowPending: [], glowSeen: [] });

/** True when the widget needs no service or any one of its services is connected. */
export function isUnlocked(state: HomeWidgetState, id: WidgetId) {
  const widget = getWidget(id);
  if (!widget) return false;
  return widget.services.length === 0 || widget.services.some(service => state.services.includes(service));
}

export function addWidget(state: HomeWidgetState, id: WidgetId): HomeWidgetState {
  if (state.layout.includes(id) || !isAvailable(id) || !isUnlocked(state, id)) return state;
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
  const unlocked: WidgetId[] = WIDGETS
    .filter(widget => widget.available && (widget.services as readonly ServiceId[]).includes(service) && !isUnlocked(state, widget.id))
    .map(widget => widget.id);
  const glow = unlocked.filter(id => !state.glowSeen.includes(id) && !state.glowPending.includes(id));
  return {
    unlocked,
    state: { ...state, services: [...state.services, service], editDot: state.editDot || unlocked.length > 0, glowPending: [...state.glowPending, ...glow] },
  };
}

/** Locks the service's widgets again. Layout keeps their slots so they return in place on reconnect. */
export function disconnectService(state: HomeWidgetState, service: ServiceId): HomeWidgetState {
  return state.services.includes(service) ? { ...state, services: state.services.filter(item => item !== service) } : state;
}

export const openEdit = (state: HomeWidgetState): HomeWidgetState => state.editDot ? { ...state, editDot: false } : state;

export const shouldGlow = (state: HomeWidgetState, id: WidgetId) => state.glowPending.includes(id) && !state.glowSeen.includes(id);

export function markGlowSeen(state: HomeWidgetState, id: WidgetId): HomeWidgetState {
  if (state.glowSeen.includes(id)) return state;
  return { ...state, glowPending: state.glowPending.filter(item => item !== id), glowSeen: [...state.glowSeen, id] };
}

/** Reconnect target for a locked widget; Oura first, as §2.5 names it for the Health-or-Oura widgets too. */
function disconnectedState(services: readonly ServiceId[]): DisconnectedState | null {
  const service = services.includes('oura') ? 'oura' : services[0];
  return service ? { service, message: `${SERVICE_NAMES[service]} disconnected`, action: 'Reconnect' } : null;
}

/** Home layout in order, locked widgets included (never hidden); indices match moveWidget. */
export const homeItems = (state: HomeWidgetState): HomeItem[] => state.layout.flatMap(id => {
  const widget = getWidget(id);
  if (!widget) return [];
  const locked = !isUnlocked(state, id);
  return [{ id, title: widget.title, locked, disconnected: locked ? disconnectedState(widget.services) : null }];
});

/** Every available widget not on Home, in registry order; locked ones show but cannot be added. Unavailable ones are hidden. */
export const trayItems = (state: HomeWidgetState): TrayItem[] => WIDGETS
  .filter(widget => widget.available && !state.layout.includes(widget.id))
  .map(widget => ({ id: widget.id, title: widget.title, locked: !isUnlocked(state, widget.id), glow: shouldGlow(state, widget.id) }));
