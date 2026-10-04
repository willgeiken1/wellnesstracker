import { app } from "../runtime.js";
import { HOME_REGISTRY_PAINT, HOME_WIDGETS, getHomeLayout, homeAwaitingSync } from "./home-widgets.js";

/* Home Oura gating.
   hasOura is the ring or sample data.
   seedOuraWidgets writes readiness and sleep-score once into homeV2.
   The flag lives on homeV2.ouraSeeded, next to the items it describes.
   Disconnect does not edit items or hidden. The filter hides Oura widgets. */

export const SEEDED_OURA_IDS = ["readiness", "sleep-score"];

export function hasOura(state) {
  if (!state) return false;
  return !!(state.demo || (state.oura && state.oura.connected));
}

/* Pure. A seeded layout is returned unchanged, even if a seeded widget was removed.
   Ids already in items or hidden stay where the person put them. Only a missing id is prepended. */
export function seedOuraWidgets(layout) {
  if (layout && layout.ouraSeeded) return layout;
  const rawItems = layout && Array.isArray(layout.items) ? layout.items : [];
  const hidden = layout && Array.isArray(layout.hidden) ? layout.hidden.filter((id) => typeof id === "string") : [];
  const hiddenSet = new Set(hidden);
  const items = [];
  const seen = new Set();
  for (const id of rawItems) {
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    items.push(id);
  }
  const missing = SEEDED_OURA_IDS.filter((id) => !seen.has(id) && !hiddenSet.has(id));
  return {
    ...(layout && typeof layout === "object" ? layout : {}),
    v: 2,
    items: [...missing, ...items],
    hidden: hidden.slice(),
    ouraSeeded: true,
    // TODO: the first Oura seed can beat another phone's edit made seconds earlier.
    updatedAt: Date.now(),
  };
}

/* Ids Home should paint. hidden is the person's list. needsOura drops out with no ring and no demo.
   items and hidden are guarded because a v2 layout can omit them. */
export function visibleHomeIds(state, widgets = HOME_WIDGETS) {
  const layout = getHomeLayout(state);
  if (!layout) return [];
  const items = Array.isArray(layout.items) ? layout.items : [];
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const oura = hasOura(state);
  return items.filter((id) => {
    if (typeof id !== "string" || hidden.has(id)) return false;
    const widget = widgets && widgets[id];
    if (widget && widget.needsOura && !oura) return false;
    return true;
  });
}

export function ouraWidgetShowing(state, id) {
  const homeV2 = state && state.layout && state.layout.homeV2;
  const ouraV2 = HOME_REGISTRY_PAINT && !!(homeV2 && homeV2.v === 2 && Array.isArray(homeV2.items));
  if (!ouraV2) return false;
  return visibleHomeIds(state).includes(id);
}

/* Oura tiles only. The rest of Home still comes from the current page until step 1's renderer lands. */
export function gatedOuraStripHTML(state) {
  const small = [];
  const medium = [];
  visibleHomeIds(state).forEach((id) => {
    const widget = HOME_WIDGETS[id];
    if (!widget || !widget.needsOura || typeof widget.render !== "function") return;
    const html = widget.render();
    if (!html) return;
    (widget.size === "small" ? small : medium).push(html);
  });
  const body = (small.length ? `<div class="stats">${small.join("")}</div>` : "") + medium.join("");
  if (!body || !homeAwaitingSync()) return body;
  return `<p class="sub oura-wait">Waiting for first sync</p>${body}`;
}

/* Called from ouraRefresh after the connection row is read.
   Seeds the first time a v2 layout is on the phone while the ring is connected.
   Already-connected saves still seed once, because oura.connected is persisted
   and would not flip again. A missing layout waits. Disconnect leaves homeV2 alone.
   Pass seed:false when this session has not pulled yet. settingsAt is left alone:
   bumping it makes a stale phone win muscle mode, uniEx, and the whole layout. */
export function noteOuraConnected(state, connected, opt) {
  if (!state || typeof state !== "object") return false;
  if (!state.oura || typeof state.oura !== "object" || Array.isArray(state.oura)) {
    state.oura = { connected: false, lastSync: null, days: {} };
  }
  const now = !!connected;
  state.oura.connected = now;
  if (!now || (opt && opt.seed === false)) return false;
  const raw = state.layout && state.layout.homeV2;
  const current = raw && raw.v === 2 && Array.isArray(raw.items) ? raw : null;
  if (!current || current.ouraSeeded) return false;
  const next = seedOuraWidgets(current);
  if (!state.layout || typeof state.layout !== "object" || Array.isArray(state.layout)) state.layout = {};
  state.layout.homeV2 = next;
  return true;
}

export function ouraReturnDialog(code) {
  if (code === "connected") {
    return {
      title: "Oura connected",
      body: "If there's a Done button in the corner, tap it to go back to Insight. Readiness and sleep show on Home as soon as your ring syncs.",
    };
  }
  const body = code === "expired"
    ? "That login took too long. Open Settings and tap Connect Oura again."
    : "The connection was cancelled or didn't finish. Open Settings and tap Connect Oura to try again.";
  return { title: "Oura wasn't connected", body };
}

app.hasOura = () => hasOura(app.state);
app.noteOuraConnected = noteOuraConnected;
app.ouraWidgetShowing = (id) => ouraWidgetShowing(app.state, id);
app.gatedOuraStripHTML = () => gatedOuraStripHTML(app.state);
