// Drizzle bundled migration; SQL is a TS literal so Metro needs no SQL transform.
export const initialSql = `CREATE TABLE profile (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, dob TEXT, weight_unit TEXT, height_m REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE weigh_ins (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, weight_kg REAL, entered_value REAL, entered_unit TEXT, source TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE measurements (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, waist_m REAL, hips_m REAL, chest_m REAL, arm_m REAL, thigh_m REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE routines (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, position INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE routine_exercises (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, routine_id TEXT, exercise TEXT, position INTEGER, target_sets INTEGER, target_reps INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE sessions (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, routine_id TEXT, name TEXT, origin TEXT, started_at INTEGER, finished_at INTEGER, duration_ms INTEGER, notes TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE entries (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, session_id TEXT, exercise TEXT, position INTEGER, notes TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE sets (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, entry_id TEXT, position INTEGER, weight_kg REAL, entered_value REAL, entered_unit TEXT, reps INTEGER, left_weight_kg REAL, left_entered_value REAL, left_entered_unit TEXT, left_reps INTEGER, right_weight_kg REAL, right_entered_value REAL, right_entered_unit TEXT, right_reps INTEGER, rpe REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE cardio_sessions (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, kind TEXT, duration_ms INTEGER, distance_m REAL, notes TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE food_entries (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, meal_id TEXT, saved_food_id TEXT, name TEXT, amount_g REAL, energy_kj REAL, protein_g REAL, carbs_g REAL, fat_g REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE saved_foods (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, serving_g REAL, energy_kj REAL, protein_g REAL, carbs_g REAL, fat_g REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE food_targets (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, energy_kj REAL, protein_g REAL, carbs_g REAL, fat_g REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE meals (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, position INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE goals (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, kind TEXT, target_value REAL, target_unit TEXT, target_day TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE plan_days (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, day TEXT, routine_id TEXT, status TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE machine_notes (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, exercise TEXT, text TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE home_layout (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, widget TEXT, position INTEGER, hidden INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE settings (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, theme_override TEXT, accent TEXT, rest_seconds INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE photos (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, file_name TEXT, captured_at INTEGER, width INTEGER, height INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE oura_days (owner_id TEXT NOT NULL, day TEXT NOT NULL, cache TEXT NOT NULL, PRIMARY KEY(owner_id, day));
--> statement-breakpoint
CREATE TABLE sync_outbox (owner_id TEXT NOT NULL, table_name TEXT NOT NULL, row_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(owner_id,table_name,row_id));
--> statement-breakpoint
CREATE TABLE sync_state (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id,key));`;
export const conflictSql = `CREATE TABLE sync_conflicts (owner_id TEXT NOT NULL, table_name TEXT NOT NULL, row_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason='provenance'), PRIMARY KEY(owner_id,table_name,row_id));`;
export default { journal: { entries: [{ idx: 0, when: 1792238400000, tag: '0000_local_rows', breakpoints: true }, { idx: 1, when: 1792238400001, tag: '0001_sync_conflicts', breakpoints: true }] }, migrations: { m0000: initialSql, m0001: conflictSql } };
