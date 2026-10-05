import { app } from "../runtime.js";
import { HOME_WIDGETS, getHomeLayout, homeAwaitingSync, homeRegistryActive } from "./home-widgets.js";

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

function finiteAt(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/* Pure. A seeded layout is returned unchanged, even if a seeded widget was removed.
   Ids already in items or hidden stay where the person put them, including ids
   this build does not know. Only a missing id is prepended.
   The stamp is one millisecond past the layout (or the pulled edit), never the
   clock. A pulled edit newer than this layout is left untouched, so a seed
   cannot outrank another phone's edit made seconds earlier. */
export function seedOuraWidgets(layout, opt) {
  if (layout && layout.ouraSeeded) return layout;
  const base = finiteAt(layout && layout.updatedAt);
  const pulled = opt && typeof opt.pulledUpdatedAt === "number" && Number.isFinite(opt.pulledUpdatedAt) ? opt.pulledUpdatedAt : null;
  if (pulled != null && pulled > base) return layout;
  const rawItems = layout && Array.isArray(layout.items) ? layout.items : [];
  const hidden = layout && Array.isArray(layout.hidden) ? layout.hidden.filter((id) => typeof id === "string") : [];
  const hiddenSet = new Set(hidden);
  const items = [];
  const seen = new Set();
  for (const id of rawItems) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    items.push(id);
  }
  const missing = SEEDED_OURA_IDS.filter((id) => !seen.has(id) && !hiddenSet.has(id));
  const stampFrom = pulled != null ? Math.max(base, pulled) : base;
  return {
    ...(layout && typeof layout === "object" ? layout : {}),
    v: 2,
    items: [...missing, ...items],
    hidden: hidden.slice(),
    ouraSeeded: true,
    updatedAt: stampFrom + 1,
  };
}

function dayBag(days) {
  if (!days || typeof days !== "object" || Array.isArray(days)) return false;
  return Object.keys(days).some((key) => days[key] && typeof days[key] === "object");
}

/* Demo counts as ready. A connected ring with no stored day does not. */
export function ouraReady(state) {
  if (!state) return false;
  if (state.demo) return true;
  if (dayBag(state.oura && state.oura.days)) return true;
  if (typeof app.src === "function") {
    try {
      const src = app.src();
      if (dayBag(src && src.oura)) return true;
    } catch (e) { /* treat a missing store as no days */ }
  }
  return false;
}

/* Ids Home should paint. hidden is the person's list.
   needsOura drops out with no ring, no demo, or a ring that has not synced a day.
   items and hidden are guarded because a v2 layout can omit them. */
export function visibleHomeIds(state, widgets = HOME_WIDGETS) {
  const layout = getHomeLayout(state);
  if (!layout) return [];
  const items = Array.isArray(layout.items) ? layout.items : [];
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const oura = hasOura(state) && ouraReady(state);
  return items.filter((id) => {
    if (typeof id !== "string" || hidden.has(id)) return false;
    const widget = widgets && widgets[id];
    if (widget && widget.needsOura && !oura) return false;
    return true;
  });
}

/* One line on Home when the layout wants Oura cards and the ring has no days yet. */
export function homeOuraWaiting(state) {
  if (!state || state.demo || ouraReady(state)) return false;
  if (!state.oura || !state.oura.connected) return false;
  const err = state.oura.lastError;
  if (typeof err === "string" && err.toLowerCase().includes("membership_inactive")) return false;
  const layout = getHomeLayout(state);
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const items = Array.isArray(layout.items) ? layout.items : [];
  return items.some((id) => {
    const widget = HOME_WIDGETS[id];
    return !!(widget && widget.needsOura && !hidden.has(id));
  });
}

export function ouraWidgetShowing(state, id) {
  if (!homeRegistryActive(state)) return false;
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
  if (!body) return "";
  if (!homeAwaitingSync()) return body;
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
  const fromOpt = opt && typeof opt.pulledUpdatedAt === "number" ? opt.pulledUpdatedAt : null;
  const fromPull = typeof app.homeV2PulledAt === "number" ? app.homeV2PulledAt : null;
  const pulledUpdatedAt = fromOpt != null ? fromOpt : fromPull;
  const next = seedOuraWidgets(current, pulledUpdatedAt == null ? undefined : { pulledUpdatedAt });
  if (next === current) return false;
  if (!state.layout || typeof state.layout !== "object" || Array.isArray(state.layout)) state.layout = {};
  state.layout.homeV2 = next;
  return true;
}

/* Insights with no nights. Never-connected and a connected ring with no days
   both need the card. Demo hides it; sample nights are a separate path. */
export function needsSleepRecovery(state, nights) {
  if (!state || state.demo) return false;
  return !nights;
}

/* 403, an expired membership, or an inactive token. A ring that just connected
   and has not synced yet is not one of these. */
export function ouraMembershipLapsed(state) {
  const err = state && state.oura && state.oura.lastError;
  if (typeof err !== "string" || !err) return false;
  return /403|lapsed|inactive|expired/i.test(err);
}

export function sleepRecoveryLabel(state, signedIn) {
  if (!signedIn) return "Learn more";
  if (ouraMembershipLapsed(state)) return "Reconnect";
  if (state && state.oura && state.oura.connected) return "Sync now";
  return "Connect Oura";
}

export function sleepRecoveryCopy(state) {
  if (ouraMembershipLapsed(state)) return "Reconnect Oura to bring sleep and readiness back. This stays empty when the membership has lapsed.";
  if (state && state.oura && state.oura.connected) return "Oura is connected. Sleep and readiness show up after the first sync.";
  return "Connect an Oura Ring to see how sleep and readiness affect your lifts.";
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
