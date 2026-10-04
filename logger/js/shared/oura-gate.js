import { app } from "../runtime.js";
import { HOME_WIDGETS, getHomeLayout, setHomeLayout } from "./home-widgets.js";

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

/* Pure. A seeded layout is returned unchanged, even if a seeded widget was removed. */
export function seedOuraWidgets(layout) {
  if (layout && layout.ouraSeeded) return layout;
  const items = layout && Array.isArray(layout.items) ? layout.items.filter((id) => typeof id === "string") : [];
  const hidden = layout && Array.isArray(layout.hidden) ? layout.hidden.filter((id) => typeof id === "string") : [];
  const rest = items.filter((id) => !SEEDED_OURA_IDS.includes(id));
  return {
    ...(layout && typeof layout === "object" ? layout : {}),
    v: 2,
    items: [...SEEDED_OURA_IDS, ...rest],
    hidden: hidden.slice(),
    ouraSeeded: true,
    updatedAt: Date.now(),
  };
}

/* Ids Home should paint. hidden is the person's list. needsOura drops out with no ring and no demo. */
export function visibleHomeIds(state, widgets = HOME_WIDGETS) {
  const layout = getHomeLayout(state);
  if (!layout) return [];
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const oura = hasOura(state);
  return layout.items.filter((id) => {
    if (typeof id !== "string" || hidden.has(id)) return false;
    const widget = widgets && widgets[id];
    if (widget && widget.needsOura && !oura) return false;
    return true;
  });
}

export function ouraWidgetShowing(state, id) {
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
  return (small.length ? `<div class="stats">${small.join("")}</div>` : "") + medium.join("");
}

/* Called from ouraRefresh after the connection row is read.
   Seeds the first time a v2 layout is on the phone while the ring is connected.
   Already-connected saves still seed once, because oura.connected is persisted
   and would not flip again. A missing layout waits. Disconnect leaves homeV2 alone. */
export function noteOuraConnected(state, connected) {
  if (!state || typeof state !== "object") return false;
  if (!state.oura || typeof state.oura !== "object" || Array.isArray(state.oura)) {
    state.oura = { connected: false, lastSync: null, days: {} };
  }
  const now = !!connected;
  state.oura.connected = now;
  if (!now) return false;
  const current = getHomeLayout(state);
  if (!current || current.ouraSeeded) return false;
  setHomeLayout(state, seedOuraWidgets(current));
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
