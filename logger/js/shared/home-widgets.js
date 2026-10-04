/* STUB — replaced by step 1 (the Home widget registry).
   The id list and getHomeLayout / setHomeLayout match the locked interface.
   render / preview only draw a labeled tile so a migrated layout can be previewed.
   Rebase this file away when step 1 lands. */

const OURA = new Set(["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "last-night"]);

const SPECS = [
  ["readiness", "Readiness", "recovery", "small"],
  ["sleep-score", "Sleep score", "recovery", "small"],
  ["sleep-duration", "Sleep", "recovery", "small"],
  ["hrv", "HRV", "recovery", "small"],
  ["resting-hr", "Resting HR", "recovery", "small"],
  ["steps", "Steps", "recovery", "small"],
  ["weekly-goal", "Weekly goal", "training", "small"],
  ["food-today", "Food today", "food", "small"],
  ["food-yesterday", "Food yesterday", "food", "small"],
  ["weight-trend", "Weight", "body", "small"],
  ["cardio-minutes", "Cardio minutes", "training", "small"],
  ["today", "Today", "training", "medium"],
  ["this-week", "This week", "training", "medium"],
  ["pattern", "Pattern", "insights", "medium"],
  ["headline", "Headline", "insights", "medium"],
  ["muscles", "Muscles", "training", "medium"],
  ["cardio", "Cardio", "training", "medium"],
  ["last-night", "Last night", "recovery", "medium"],
];

function tile(entry) {
  return `<span class="hv2-k">${entry.category}</span><span class="hv2-name">${entry.name}</span>`;
}

export const HOME_WIDGETS = Object.fromEntries(SPECS.map(([id, name, category, size]) => {
  const entry = { id, name, category, size, needsOura: OURA.has(id), render: null, preview: null };
  entry.render = () => tile(entry);
  entry.preview = () => tile(entry);
  return [id, entry];
}));

export function getHomeLayout(state) {
  const home = state && state.layout && state.layout.homeV2;
  if (!home || home.v !== 2) return null;
  return home;
}

export function setHomeLayout(state, layout) {
  if (!state || typeof state !== "object") return;
  if (!state.layout || typeof state.layout !== "object" || Array.isArray(state.layout)) state.layout = {};
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    state.layout.homeV2 = layout;
    return;
  }
  const next = { ...layout };
  delete next.migrated;
  delete next.migratedAt;
  state.layout.homeV2 = next;
}

/* Preview only. Production Home still renders the v1 widgets. */
export function renderHomeV2(layout) {
  const items = layout && Array.isArray(layout.items) ? layout.items : [];
  const hidden = layout && Array.isArray(layout.hidden) ? layout.hidden : [];
  const card = (id) => {
    const entry = HOME_WIDGETS[id];
    if (!entry) return "";
    return `<article class="hv2-card hv2-${entry.size}" data-hv2="${entry.id}">${entry.render()}</article>`;
  };
  const hiddenRow = hidden.filter((id) => HOME_WIDGETS[id]).map((id) => HOME_WIDGETS[id].name).join(", ");
  return `<section class="hv2" aria-label="Home layout">
    <style>
      .hv2 { margin: 0 0 16px; }
      .hv2-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .hv2-card { background: var(--surface); color: var(--text); border-radius: 20px; padding: 14px 14px 16px; min-height: 84px; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; }
      .hv2-medium { grid-column: 1 / -1; min-height: 112px; }
      .hv2-k { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
      .hv2-name { font-family: var(--display); font-size: 20px; font-weight: 600; letter-spacing: -.02em; }
      .hv2-hidden { margin: 10px 2px 0; color: var(--muted); font-size: 13px; }
    </style>
    <div class="hv2-grid">${items.map(card).join("")}</div>
    ${hiddenRow ? `<p class="hv2-hidden">Hidden: ${hiddenRow}</p>` : ""}
  </section>`;
}
