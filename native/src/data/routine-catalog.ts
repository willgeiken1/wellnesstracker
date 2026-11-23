/* Daily routines (not workout templates, which are `routines`). Names, doses, units, notes, sites and
   supply are medication data: phone only, never to AI, Sentry, PostHog or logs.
   These tables are not in catalog.ts because that file is the wire catalog the server checks itself
   against, and routines are not on the wire. */
export const routineColumns = {
  "daily_blocks": {
    "name": "text",
    "color": "text",
    "position": "integer",
    "start_min": "integer",
    "end_min": "integer",
    "days_mask": "integer",
    "hidden": "integer"
  },
  "daily_items": {
    "name": "text",
    "kind": "text",
    "type": "text",
    "compound_id": "text",
    "note": "text",
    "time_min": "integer",
    "start_day": "text",
    "on_hand": "integer",
    "on_hand_day": "text",
    "on_hand_at": "integer",
    "mixed_day": "text",
    "calc_vial": "real",
    "calc_vial_unit": "text",
    "calc_water": "real"
  },
  "daily_placements": {
    "block_id": "text",
    "item_id": "text",
    "position": "integer"
  },
  "daily_compounds": {
    "name": "text",
    "amount": "real",
    "unit": "text",
    "start_day": "text",
    "archived_at": "integer",
    "chart_line": "integer"
  },
  "daily_logs": {
    "item_id": "text",
    "compound_id": "text",
    "day": "text",
    "status": "text",
    "amount": "real",
    "unit": "text",
    "note": "text",
    "at": "integer",
    "site": "text",
    "rest": "integer",
    "undone": "integer"
  },
  "daily_types": {
    "name": "text",
    "position": "integer"
  },
  "daily_prefs": {
    "last_block_id": "text",
    "day_rollover_hour": "integer",
    "focus_mode": "integer",
    "tips_hidden": "integer",
    "history_graph": "text",
    "home_next_hidden": "integer",
    "setup_status": "text",
    "setup_answers": "text",
    "setup_at": "integer",
    "added": "text",
    "type_tabs": "text",
    "collapsed_blocks": "text",
    "reveal_blocks": "text"
  }
} as const;
