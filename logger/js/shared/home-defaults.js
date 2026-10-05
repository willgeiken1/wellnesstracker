import { app } from "../runtime.js";
import { HOME_WIDGETS, homeRegistryActive, renderHomeWidgets } from "./home-widgets.js";
import { hasOura, visibleHomeIds } from "./oura-gate.js";

/* Home defaults for people who have not edited Home.
   A real edit (homeRegistryActive) is never touched: nothing here writes homeV2.
   The defaults are painted from the account state each time, so they follow a ring
   that connects or lapses, and they never reach cloud sync. A tile only paints when
   it has something to show, so Home never has an empty or "Connect a ring" tile. */

export const OURA_DEFAULT_IDS = ["readiness", "sleep-score"];
export const PLAIN_DEFAULT_IDS = ["food-today", "weekly-goal", "weight-trend"];

/* A lapsed membership keeps its connection row and gets no new data. */
export function ouraLapsed(state) {
  const o = state && state.oura;
  return !!(o && o.connected && typeof o.lastError === "string" && o.lastError.toLowerCase().includes("membership_inactive"));
}

export function defaultHomeIds(state) {
  return (hasOura(state) && !ouraLapsed(state) ? OURA_DEFAULT_IDS : PLAIN_DEFAULT_IDS).slice();
}

function legacyHidden(state, slot) {
  const home = state && state.layout && state.layout.home;
  return !!(home && Array.isArray(home.hidden) && home.hidden.includes(slot));
}

/* Just enough of the Home snapshot to decide which default tiles have data. */
function liveData() {
  const data = { live: true, oura: null, foodToday: { logged: false }, weekGoal: null, weight: { empty: true } };
  try { data.oura = app.latestOura(app.src().oura); } catch (e) { /* no days */ }
  try { data.foodToday = { logged: app.dayEntries(app.today()).length > 0 }; } catch (e) { /* nothing logged */ }
  try { data.weekGoal = app.weekGoalStatus(); } catch (e) { /* no goal */ }
  try { data.weight = { empty: !app.weighIns().length }; } catch (e) { /* no weigh-ins */ }
  return data;
}

function hasData(id, data) {
  if (!data) return false;
  if (id === "readiness") return !!(data.oura && data.oura.readiness != null);
  if (id === "sleep-score") return !!(data.oura && data.oura.sleepScore != null);
  if (id === "food-today") return !!(data.foodToday && data.foodToday.logged);
  if (id === "weekly-goal") return !!(data.weekGoal && data.weekGoal.goal);
  if (id === "weight-trend") return !!(data.weight && !data.weight.empty);
  return true;
}

/* The Readiness card is part of the legacy Home when there is a score and the
   person has not hidden it. */
function legacyReadinessCard(state, data) {
  return !legacyHidden(state, "readiness") && hasData("readiness", data);
}

/* The legacy Readiness card already shows the day's advice ("Train as planned"). */
export function readinessCardShowing(state, data) {
  return !homeRegistryActive(state) && legacyReadinessCard(state, data || liveData());
}

/* Default tiles that would paint right now. */
export function defaultTileIds(state, data) {
  if (homeRegistryActive(state)) return [];
  const d = data || liveData();
  const card = legacyReadinessCard(state, d);
  return defaultHomeIds(state).filter((id) => HOME_WIDGETS[id] && hasData(id, d) && !(id === "readiness" && card));
}

/* Is this card on Home right now? The brief asks so it can skip what a card
   already says. A registry Home answers from its layout. The legacy Home has
   the Readiness card and the Today hero unless hidden, plus the default tiles. */
export function homeCardShowing(state, id, data) {
  if (homeRegistryActive(state)) return visibleHomeIds(state).includes(id);
  const d = data || liveData();
  if (id === "readiness") return legacyReadinessCard(state, d) || defaultTileIds(state, d).includes("readiness");
  if (id === "today") return !legacyHidden(state, "today");
  return defaultTileIds(state, d).includes(id);
}

export function defaultHomeStripHTML(state, data) {
  const ids = defaultTileIds(state, data);
  if (!ids.length) return "";
  const html = renderHomeWidgets({ v: 2, items: ids, hidden: [] }, data);
  return html.includes("data-hw=") ? html : "";
}

app.defaultHomeIds = defaultHomeIds;
app.homeCardShowing = (id) => homeCardShowing(app.state, id);
app.defaultHomeStripHTML = (data) => defaultHomeStripHTML(app.state, data);
