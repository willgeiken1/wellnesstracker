// Physical columns shared by local repositories and wire validation. No arbitrary payload blobs.
export const columns = {
  "profile": {
    "name": "text",
    "dob": "text",
    "weight_unit": "text",
    "height_m": "real"
  },
  "weigh_ins": {
    "day": "text",
    "weight_kg": "real",
    "entered_value": "real",
    "entered_unit": "text",
    "source": "text"
  },
  "measurements": {
    "day": "text",
    "waist_m": "real",
    "hips_m": "real",
    "chest_m": "real",
    "arm_m": "real",
    "thigh_m": "real"
  },
  "routines": {
    "name": "text",
    "position": "integer"
  },
  "routine_exercises": {
    "routine_id": "text",
    "exercise": "text",
    "position": "integer",
    "target_sets": "integer",
    "target_reps": "integer"
  },
  "sessions": {
    "day": "text",
    "routine_id": "text",
    "name": "text",
    "origin": "text",
    "started_at": "integer",
    "finished_at": "integer",
    "duration_ms": "integer",
    "notes": "text"
  },
  "entries": {
    "session_id": "text",
    "exercise": "text",
    "position": "integer",
    "notes": "text"
  },
  "sets": {
    "entry_id": "text",
    "position": "integer",
    "weight_kg": "real",
    "entered_value": "real",
    "entered_unit": "text",
    "reps": "integer",
    "left_weight_kg": "real",
    "left_entered_value": "real",
    "left_entered_unit": "text",
    "left_reps": "integer",
    "right_weight_kg": "real",
    "right_entered_value": "real",
    "right_entered_unit": "text",
    "right_reps": "integer",
    "rpe": "real"
  },
  "cardio_sessions": {
    "day": "text",
    "kind": "text",
    "duration_ms": "integer",
    "distance_m": "real",
    "notes": "text"
  },
  "food_entries": {
    "day": "text",
    "meal_id": "text",
    "saved_food_id": "text",
    "name": "text",
    "amount_g": "real",
    "energy_kj": "real",
    "protein_g": "real",
    "carbs_g": "real",
    "fat_g": "real"
  },
  "saved_foods": {
    "name": "text",
    "serving_g": "real",
    "energy_kj": "real",
    "protein_g": "real",
    "carbs_g": "real",
    "fat_g": "real"
  },
  "food_targets": {
    "day": "text",
    "energy_kj": "real",
    "protein_g": "real",
    "carbs_g": "real",
    "fat_g": "real"
  },
  "meals": {
    "name": "text",
    "position": "integer"
  },
  "goals": {
    "kind": "text",
    "target_value": "real",
    "target_unit": "text",
    "target_day": "text"
  },
  "plan_days": {
    "day": "text",
    "routine_id": "text",
    "status": "text"
  },
  "machine_notes": {
    "exercise": "text",
    "text": "text"
  },
  "home_layout": {
    "widget": "text",
    "position": "integer",
    "hidden": "integer"
  },
  "settings": {
    "theme_override": "text",
    "accent": "text",
    "rest_seconds": "integer"
  },
  "photos": {
    "file_name": "text",
    "captured_at": "integer",
    "width": "integer",
    "height": "integer"
  }
} as const;
export type Table = keyof typeof columns;
export const syncedTables = Object.keys(columns) as Table[];
