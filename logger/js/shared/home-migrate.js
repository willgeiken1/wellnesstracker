/* Migrate a saved Home arrangement into layout.homeV2.
   Pure: migrateHomeLayout does not mutate state and does not read homeV2.

   A migrated copy is marked migrated:true. Its updatedAt is the source stamp
   (newest of settingsAt, brief.updatedAt, and layout.home.updatedAt, at least 1),
   not the clock. applyHomeMigration writes that once at load so an offline
   phone still has a layout. A second call is a no-op.

   After a cloud merge, applyHomeMigration(state, now, { afterMerge: true })
   rebuilds only when that copy is still a migration and the merged old keys
   carry a newer source stamp. A user edit is unflagged. setHomeLayout clears
   migrated and migratedAt. An unflagged copy is never rebuilt, and in
   pickHomeV2 it beats a migrated copy no matter which timestamp is higher.
   updatedAt is compared only between copies of the same kind.

   pickHomeV2 caps a timestamp at about one day past now so a skewed clock
   cannot win forever. Equal timestamps prefer the copy with more distinct
   ids (items union hidden), then the JSON of items, hidden, and sizes, so
   two phones converge and an older client that drops an unknown id cannot
   erase it by rewriting the same updatedAt. ouraSeeded sticks to whichever
   copy is kept.
   A copy must have a numeric v of exactly 2 (the string "2" is rejected) and
   an items array; hidden, when present, must be an array. Ids are strings.
   Unknown strings stay in items and hidden so a newer client's cards are not
   dropped. An empty items array is a real layout that shows nothing and can
   win. A non-empty items array that contains neither a HOME_WIDGETS id nor a
   routine tile id is malformed, and pickHomeV2 keeps the other copy. A Home
   made only of routine tiles is a real layout.

   Old keys stay in place so a cached older client still has its order.
   Never-customized state returns null (missing layout, empty order, or only
   the automatic one-map hide). Step 1's default applies then. A stored size
   with no order, hidden list, or updatedAt is not a customization.

   Unknown ids in the old Home order are dropped. The brief, when visible, expands in place: saved
   metrics first, then any current brief metric that was not listed. oura →
   readiness + sleep score, train is dropped, food → food yesterday, week →
   weekly goal, weight → weight trend, pattern → pattern. The headline is
   not a saved tile. Old home widgets: readiness → readiness + hrv, today →
   today, week → this week, cardio → cardio, either muscle map → muscles.
   Duplicates keep the first id. A visible source wins over a hidden one.
*/

import { app } from "../runtime.js";
import { HOME_WIDGETS } from "./home-widgets.js";
import { NEXT_UP_TILE_ID, isRoutineTileId } from "./routine-home-tiles.js";

const NATURAL = ["brief", "readiness", "today", "week", "cardio", "map-adv", "map-basic"];
const BRIEF_ORDER = ["pattern", "oura", "train", "food", "week", "weight"];
const DAY = 86400000;

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

/* Non-blank strings once. Unknown ids stay; nulls, numbers, and blanks do not. */
function storedIds(list) {
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

/* What the migration was built from. A settingsAt bump does not change it,
   and the brief prepend widgetize writes is the same arrangement. */
function sourceKey(state) {
  const home = state && state.layout && state.layout.home;
  const brief = state && state.brief && typeof state.brief === "object" && !Array.isArray(state.brief) ? state.brief : null;
  const order = strings(home && home.order).filter((id) => NATURAL.includes(id));
  const hidden = strings(home && home.hidden);
  if (order.length && !order.includes("brief") && !hidden.includes("brief")) order.unshift("brief");
  return JSON.stringify({
    order,
    hidden,
    briefOrder: strings(brief && brief.order).filter((id) => Object.prototype.hasOwnProperty.call(BRIEF_TILES, id)),
    briefHidden: strings(brief && brief.hidden).filter((id) => Object.prototype.hasOwnProperty.call(BRIEF_TILES, id)),
  });
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

/* A migrated copy, including one saved before the boolean flag existed. */
export function homeV2Migrated(home) {
  if (!home || typeof home !== "object") return false;
  if (home.migrated === true) return true;
  return typeof home.migratedAt === "number" && home.migratedAt > 0;
}

function clampAt(at, now) {
  if (typeof at !== "number" || !Number.isFinite(at)) return 0;
  const cap = now + DAY;
  return at > cap ? cap : at;
}

function acceptedTile(id) {
  return !!(HOME_WIDGETS[id] || isRoutineTileId(id));
}

/* null when the record cannot be a layout. A clean record is returned as-is.
   items: [] is valid. A non-empty list with no catalog id and no routine tile
   id is not. Unknown string ids are kept. Routine-only lists are real layouts. */
function asV2(home, now) {
  if (!home || typeof home !== "object" || Array.isArray(home)) return null;
  if (typeof home.v !== "number" || home.v !== 2) return null;
  if (!Array.isArray(home.items)) return null;
  if ("hidden" in home && home.hidden != null && !Array.isArray(home.hidden)) return null;
  const items = storedIds(home.items);
  if (home.items.length > 0 && !items.some(acceptedTile)) return null;
  const hidden = storedIds(Array.isArray(home.hidden) ? home.hidden : []).filter((id) => !items.includes(id));
  const at = clampAt(home.updatedAt, now);
  const sameItems = items.length === home.items.length && items.every((id, i) => id === home.items[i]);
  const hiddenSrc = Array.isArray(home.hidden) ? home.hidden : [];
  const sameHidden = hidden.length === hiddenSrc.length && hidden.every((id, i) => id === hiddenSrc[i]);
  const sameAt = typeof home.updatedAt !== "number" ? at === 0 : at === home.updatedAt;
  if (sameItems && sameHidden && sameAt) return home;
  return { ...home, v: 2, items, hidden, updatedAt: at };
}

/* Postgres jsonb sorts object keys by length, then bytewise. */
function pgKeyOrder(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalSizes(home) {
  const raw = home && home.sizes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).sort(pgKeyOrder).forEach((key) => { out[key] = raw[key]; });
  return out;
}

/* Second tie-break, used only when both copies have the same distinct-id count. */
function contentKey(home) {
  return JSON.stringify({ items: home.items || [], hidden: home.hidden || [], sizes: canonicalSizes(home) });
}

function distinctIdCount(home) {
  const ids = new Set();
  (home && home.items || []).forEach((id) => { if (typeof id === "string" && id) ids.add(id); });
  (home && home.hidden || []).forEach((id) => { if (typeof id === "string" && id) ids.add(id); });
  return ids.size;
}

function withSticky(winner, other) {
  let out = winner;
  if (other && other.ouraSeeded && !winner.ouraSeeded) out = { ...out, ouraSeeded: true };
  if (homeV2Migrated(winner) && !winner.migratedAt && other && other.migratedAt) out = { ...out, migratedAt: other.migratedAt };
  return out;
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

/* Appends Next up once, and only when the flag is on and this copy is a real
   edit that already has a catalog tile. A migration is left alone. An edit
   with no catalog tile gets a paint flag instead of an items change.
   A saved homeNextHidden preference is a decision: the seed marks itself
   done and does not add the tile. updatedAt is not moved: a seed must not
   outrank a newer edit. */
function signedInWithRoutines(state) {
  if (!app.session || !app.session.user) return false;
  const items = state && state.dailyRoutines && state.dailyRoutines.items;
  return Array.isArray(items) && items.some((item) => item && !(typeof item.deletedAt === "number" && item.deletedAt > 0));
}

export function seedRoutineNextUp(state) {
  if (!state || typeof state !== "object" || app.ROUTINES_ENABLED !== true) return state;
  const home = state.layout && state.layout.homeV2;
  if (!home || typeof home !== "object" || Array.isArray(home) || home.v !== 2 || !Array.isArray(home.items)) return state;
  if (home.migrated === true || (typeof home.migratedAt === "number" && home.migratedAt > 0)) return state;
  const hidden = Array.isArray(home.hidden) ? home.hidden : [];
  const present = home.items.includes(NEXT_UP_TILE_ID) || hidden.includes(NEXT_UP_TILE_ID);
  if (present) {
    if (home.routineNextSeeded !== true) home.routineNextSeeded = true;
    return state;
  }
  if (home.routineNextSeeded === true) return state;
  const prefs = state.dailyRoutines && state.dailyRoutines.prefs;
  if (prefs && prefs.homeNextHidden === true) {
    home.routineNextSeeded = true;
    return state;
  }
  if (!signedInWithRoutines(state)) return state;
  const hasCatalog = home.items.some((id) => typeof id === "string" && HOME_WIDGETS[id]);
  home.routineNextSeeded = true;
  if (!hasCatalog) {
    const hiddenSet = new Set(hidden);
    const emptied = home.items.length === 0 || home.items.every((id) => hiddenSet.has(id));
    if (!emptied) home.routineNextAside = true;
    return state;
  }
  home.items = home.items.concat(NEXT_UP_TILE_ID);
  return state;
}

/* Writes homeV2. Pass { afterMerge: true } only after mergeRemote. */
export function applyHomeMigration(state, now = Date.now(), opts) {
  if (!state || typeof state !== "object") return seedRoutineNextUp(state);
  const afterMerge = !!(opts && opts.afterMerge);
  const existing = state.layout && state.layout.homeV2;
  const clean = asV2(existing, now);

  if (clean && !homeV2Migrated(clean)) return seedRoutineNextUp(state);

  const built = migrateHomeLayout(state);
  if (clean && homeV2Migrated(clean)) {
    const from = typeof clean.updatedAt === "number" ? clean.updatedAt : 0;
    const source = built ? built.updatedAt : 0;
    const keysChanged = typeof clean.migratedFrom === "string" && clean.migratedFrom !== sourceKey(state);
    if (!(afterMerge && built && keysChanged && source > from)) return seedRoutineNextUp(state);
  }
  if (!built) return seedRoutineNextUp(state);
  if (!state.layout || typeof state.layout !== "object" || Array.isArray(state.layout)) state.layout = {};
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  state.layout.homeV2 = {
    ...base,
    v: 2,
    items: built.items,
    hidden: built.hidden,
    updatedAt: built.updatedAt,
    migratedAt: now,
    migrated: true,
    migratedFrom: sourceKey(state),
  };
  return seedRoutineNextUp(state);
}

/* Same kind: newer updatedAt, then more distinct ids, then items, hidden, and sizes.
   An edit beats a migration. ouraSeeded sticks. */
export function pickHomeV2(localLayout, remoteLayout, now = Date.now()) {
  const local = asV2(localLayout && localLayout.homeV2, now);
  const remote = asV2(remoteLayout && remoteLayout.homeV2, now);
  if (!local && !remote) return null;
  if (!local) return remote;
  if (!remote) return local;

  const localEdited = !homeV2Migrated(local);
  const remoteEdited = !homeV2Migrated(remote);
  let winner = local;
  let other = remote;
  if (localEdited !== remoteEdited) {
    winner = localEdited ? local : remote;
    other = localEdited ? remote : local;
  } else {
    const lt = clampAt(local.updatedAt, now);
    const rt = clampAt(remote.updatedAt, now);
    if (rt > lt) { winner = remote; other = local; }
    else if (lt > rt) { winner = local; other = remote; }
    else {
      const ln = distinctIdCount(local);
      const rn = distinctIdCount(remote);
      if (rn > ln) { winner = remote; other = local; }
      else if (ln > rn) { winner = local; other = remote; }
      else {
        const lk = contentKey(local);
        const rk = contentKey(remote);
        if (rk > lk) { winner = remote; other = local; }
        else { winner = local; other = remote; }
      }
    }
  }
  return withSticky(winner, other);
}
