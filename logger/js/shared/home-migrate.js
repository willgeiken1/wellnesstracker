/* Migrate a saved Home arrangement into layout.homeV2.
   Pure: migrateHomeLayout does not mutate state and does not read homeV2.
   applyHomeMigration writes homeV2 once, behind migratedAt.

   Old keys stay in place (layout.home and brief) so a cached older client
   still has its order and hidden lists.

   Never-customized state returns null. That includes a missing layout, an
   empty home order, and the automatic one-map hide layoutOf writes
   (exactly "map-adv" or exactly "map-basic"). Step 1's default layout
   applies in that case. A saved size with no order, hidden list, or
   updatedAt is not a customization.

   Unknown ids are dropped. They do not land in items or hidden.

   The brief card, when it is showing, expands in place. Visible tiles follow
   the same fill as briefPrefs: saved known metrics first, then any current
   brief metric that was not listed (so "pattern" shows for an older saved
   brief, matching the card on screen today). Hidden brief metrics are
   carried into hidden. "train" is dropped. The brief headline is not a
   saved tile, so this does not invent a "headline" widget.

   Tiles that did not exist before (sleep duration, resting HR, steps,
   food today, cardio minutes, last night) are left out of both lists.

   Old home widgets: readiness → readiness + hrv, today → today,
   week → this-week, cardio → cardio, either muscle map → muscles.
   Duplicates keep the first occurrence. A visible source wins over a
   hidden source that maps to the same id (items are placed first).

   homeV2.updatedAt is the newest of settingsAt, brief.updatedAt, and
   layout.home.updatedAt (at least 1). It is not Date.now(), so a later
   edit on another device stays newer. migratedAt is the one-shot stamp.
*/

import { HOME_WIDGETS } from "./home-widgets.js";

const NATURAL = ["brief", "readiness", "today", "week", "cardio", "map-adv", "map-basic"];
const BRIEF_ORDER = ["pattern", "oura", "train", "food", "week", "weight"];

const BRIEF_TILES = {
  pattern: ["pattern"],
  oura: ["readiness", "sleep-score"],
  train: [],
  food: ["food-yesterday"],
  week: ["weekly-goal"],
  weight: ["weight-trend"],
};

const HOME_TILES = {
  readiness: ["readiness", "hrv"],
  today: ["today"],
  week: ["this-week"],
  cardio: ["cardio"],
  "map-adv": ["muscles"],
  "map-basic": ["muscles"],
};

function strings(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((id) => {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  });
  return out;
}

function briefCustomized(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return false;
  if ((brief.updatedAt || 0) > 0) return true;
  if (strings(brief.order).length) return true;
  if (strings(brief.hidden).length) return true;
  return false;
}

function homeCustomized(home) {
  if (!home || typeof home !== "object" || Array.isArray(home)) return false;
  if (strings(home.order).length) return true;
  const hidden = strings(home.hidden);
  if (!hidden.length) return false;
  if (hidden.length === 1 && (hidden[0] === "map-adv" || hidden[0] === "map-basic")) return false;
  return true;
}

function sourceStamp(state) {
  const home = state && state.layout && state.layout.home;
  const brief = state && state.brief;
  return Math.max(state && state.settingsAt || 0, brief && brief.updatedAt || 0, home && home.updatedAt || 0, 1);
}

function effectiveHomeOrder(home) {
  const saved = strings(home && home.order).filter((id) => NATURAL.includes(id));
  const hidden = new Set(strings(home && home.hidden));
  if (saved.length && !saved.includes("brief") && !hidden.has("brief")) saved.unshift("brief");
  NATURAL.forEach((id) => { if (!saved.includes(id)) saved.push(id); });
  return { order: saved, hidden };
}

function briefTileOrder(brief) {
  const saved = strings(brief && brief.order).filter((id) => Object.prototype.hasOwnProperty.call(BRIEF_TILES, id));
  BRIEF_ORDER.forEach((id) => { if (!saved.includes(id)) saved.push(id); });
  const hidden = new Set(strings(brief && brief.hidden).filter((id) => Object.prototype.hasOwnProperty.call(BRIEF_TILES, id)));
  return { order: saved, hidden };
}

function isV2(home) {
  return !!(home && home.v === 2 && (Array.isArray(home.items) || Array.isArray(home.hidden)));
}

export function migrateHomeLayout(state) {
  if (!state || typeof state !== "object") return null;
  const home = state.layout && state.layout.home;
  const brief = state.brief;
  if (!homeCustomized(home) && !briefCustomized(brief)) return null;

  const placed = effectiveHomeOrder(home);
  const tiles = briefTileOrder(brief);
  const items = [];
  const hidden = [];
  const seen = new Set();
  const put = (ids, conceal) => {
    (ids || []).forEach((id) => {
      if (!HOME_WIDGETS[id] || seen.has(id)) return;
      seen.add(id);
      (conceal ? hidden : items).push(id);
    });
  };

  placed.order.forEach((id) => {
    if (placed.hidden.has(id)) return;
    if (id === "brief") {
      tiles.order.forEach((metric) => {
        if (tiles.hidden.has(metric)) return;
        put(BRIEF_TILES[metric], false);
      });
      return;
    }
    put(HOME_TILES[id], false);
  });

  placed.order.forEach((id) => {
    if (id === "brief") {
      tiles.order.forEach((metric) => {
        if (placed.hidden.has("brief") || tiles.hidden.has(metric)) put(BRIEF_TILES[metric], true);
      });
      return;
    }
    if (!placed.hidden.has(id)) return;
    put(HOME_TILES[id], true);
  });

  return { v: 2, items, hidden, updatedAt: sourceStamp(state) };
}

/* Writes homeV2 once. A newer homeV2 (including one synced from another
   device) is kept. A null migration leaves the state alone so a later
   customization of the old keys can still migrate. */
export function applyHomeMigration(state, now = Date.now()) {
  if (!state || typeof state !== "object") return state;
  const existing = state.layout && state.layout.homeV2;
  if (existing && existing.migratedAt) return state;

  const built = migrateHomeLayout(state);
  if (isV2(existing)) {
    const at = existing.updatedAt || 0;
    const keep = !built || (at > 0 && at >= built.updatedAt);
    if (keep) {
      if (!existing.migratedAt) existing.migratedAt = now;
      return state;
    }
  }
  if (!built) return state;
  if (!state.layout || typeof state.layout !== "object") state.layout = {};
  state.layout.homeV2 = {
    v: 2,
    items: built.items,
    hidden: built.hidden,
    updatedAt: built.updatedAt,
    migratedAt: now,
  };
  return state;
}

/* Newest homeV2 wins on its own updatedAt. A tie keeps this phone.
   The winner picks up migratedAt from the other copy when it lacks one. */
export function pickHomeV2(localLayout, remoteLayout) {
  const local = isV2(localLayout && localLayout.homeV2) ? localLayout.homeV2 : null;
  const remote = isV2(remoteLayout && remoteLayout.homeV2) ? remoteLayout.homeV2 : null;
  if (!local && !remote) return null;
  if (!local) return remote;
  if (!remote) return local;
  const winner = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  const other = winner === remote ? local : remote;
  if (!winner.migratedAt && other.migratedAt) return { ...winner, migratedAt: other.migratedAt };
  return winner;
}
