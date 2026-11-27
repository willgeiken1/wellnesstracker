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
// D1 upgrade: erase payloads on existing tombstones; preserve versions/outbox and source.
export const tombstoneSql = `UPDATE profile SET name=NULL, dob=NULL, weight_unit=NULL, height_m=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE weigh_ins SET day=NULL, weight_kg=NULL, entered_value=NULL, entered_unit=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE measurements SET day=NULL, waist_m=NULL, hips_m=NULL, chest_m=NULL, arm_m=NULL, thigh_m=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE routines SET name=NULL, position=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE routine_exercises SET routine_id=NULL, exercise=NULL, position=NULL, target_sets=NULL, target_reps=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE sessions SET day=NULL, routine_id=NULL, name=NULL, origin=NULL, started_at=NULL, finished_at=NULL, duration_ms=NULL, notes=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE entries SET session_id=NULL, exercise=NULL, position=NULL, notes=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE sets SET entry_id=NULL, position=NULL, weight_kg=NULL, entered_value=NULL, entered_unit=NULL, reps=NULL, left_weight_kg=NULL, left_entered_value=NULL, left_entered_unit=NULL, left_reps=NULL, right_weight_kg=NULL, right_entered_value=NULL, right_entered_unit=NULL, right_reps=NULL, rpe=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE cardio_sessions SET day=NULL, kind=NULL, duration_ms=NULL, distance_m=NULL, notes=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE food_entries SET day=NULL, meal_id=NULL, saved_food_id=NULL, name=NULL, amount_g=NULL, energy_kj=NULL, protein_g=NULL, carbs_g=NULL, fat_g=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE saved_foods SET name=NULL, serving_g=NULL, energy_kj=NULL, protein_g=NULL, carbs_g=NULL, fat_g=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE food_targets SET day=NULL, energy_kj=NULL, protein_g=NULL, carbs_g=NULL, fat_g=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE meals SET name=NULL, position=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE goals SET kind=NULL, target_value=NULL, target_unit=NULL, target_day=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE plan_days SET day=NULL, routine_id=NULL, status=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE machine_notes SET exercise=NULL, text=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE home_layout SET widget=NULL, position=NULL, hidden=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE settings SET theme_override=NULL, accent=NULL, rest_seconds=NULL WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
UPDATE photos SET file_name=NULL, captured_at=NULL, width=NULL, height=NULL WHERE deleted_at IS NOT NULL;`;
export const workoutLocalSql = `CREATE TABLE workout_local (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id,key));
--> statement-breakpoint
CREATE TABLE workout_milestones (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id,key));
--> statement-breakpoint
CREATE TABLE workout_weekly (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id,key));`;
export const v1ColumnsSql = `ALTER TABLE sets ADD COLUMN tag TEXT;
--> statement-breakpoint
ALTER TABLE routine_exercises ADD COLUMN rep_min INTEGER;
--> statement-breakpoint
ALTER TABLE routine_exercises ADD COLUMN rep_max INTEGER;
--> statement-breakpoint
ALTER TABLE routine_exercises ADD COLUMN superset_group TEXT;
--> statement-breakpoint
ALTER TABLE entries ADD COLUMN superset_group TEXT;
--> statement-breakpoint
ALTER TABLE machine_notes ADD COLUMN step REAL;
--> statement-breakpoint
ALTER TABLE machine_notes ADD COLUMN bar_weight REAL;
--> statement-breakpoint
ALTER TABLE machine_notes ADD COLUMN unit_override TEXT;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN plate_set TEXT;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN rest_per_exercise TEXT;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN rest_style TEXT;
--> statement-breakpoint
ALTER TABLE food_entries ADD COLUMN fiber_g REAL;
--> statement-breakpoint
ALTER TABLE food_entries ADD COLUMN sugar_g REAL;
--> statement-breakpoint
ALTER TABLE food_entries ADD COLUMN sodium_mg REAL;
--> statement-breakpoint
ALTER TABLE saved_foods ADD COLUMN fiber_g REAL;
--> statement-breakpoint
ALTER TABLE saved_foods ADD COLUMN sugar_g REAL;
--> statement-breakpoint
ALTER TABLE saved_foods ADD COLUMN sodium_mg REAL;
--> statement-breakpoint
CREATE TABLE custom_exercises (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, main_muscle TEXT, helpers TEXT, equipment TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE plans (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, mode TEXT, days_per_week INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE pauses (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, start_day TEXT, end_day TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE purges (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, from_day TEXT, to_day TEXT, cutoff_ms INTEGER, tz TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE UNIQUE INDEX purges_owner_version ON purges(owner_id,updated_at,device_id) WHERE cutoff_ms IS NOT NULL;`;
// Daily routines. Local only: no server table exists, and the sync gate for them is off.
export const dailyRoutinesSql = `CREATE TABLE IF NOT EXISTS daily_blocks (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, color TEXT, position INTEGER, start_min INTEGER, end_min INTEGER, days_mask INTEGER, hidden INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_items (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, kind TEXT, type TEXT, compound_id TEXT, note TEXT, time_min INTEGER, start_day TEXT, on_hand INTEGER, on_hand_day TEXT, on_hand_at INTEGER, mixed_day TEXT, calc_vial REAL, calc_vial_unit TEXT, calc_water REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_placements (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, block_id TEXT, item_id TEXT, position INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_compounds (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, amount REAL, unit TEXT, start_day TEXT, archived_at INTEGER, chart_line INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_logs (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, item_id TEXT, compound_id TEXT, day TEXT, status TEXT, amount REAL, unit TEXT, note TEXT, at INTEGER, site TEXT, rest INTEGER, undone INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_types (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, position INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_prefs (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, last_block_id TEXT, day_rollover_hour INTEGER, focus_mode INTEGER, tips_hidden INTEGER, history_graph TEXT, home_next_hidden INTEGER, setup_status TEXT, setup_answers TEXT, setup_at INTEGER, added TEXT, type_tabs TEXT, collapsed_blocks TEXT, reveal_blocks TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daily_logs_owner_day ON daily_logs(owner_id,day);`;
// The Routines screens' store: columns for what the screens keep that the tables had no place for, and pauses.
// Local only, like 0005. Each changed table is rebuilt with its new columns and its rows copied over, so the step
// also runs on a database where it ran before. on_hand keeps fractional grams, which its INTEGER column stores as REAL.
export const dailyRoutinesLocalSql = `CREATE TABLE daily_blocks_0006 (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, color TEXT, position INTEGER, start_min INTEGER, end_min INTEGER, days_mask INTEGER, hidden INTEGER, app_id TEXT, remind INTEGER, hidden_sub TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
INSERT INTO daily_blocks_0006 (owner_id, id, updated_at, deleted_at, device_id, name, color, position, start_min, end_min, days_mask, hidden) SELECT owner_id, id, updated_at, deleted_at, device_id, name, color, position, start_min, end_min, days_mask, hidden FROM daily_blocks;
--> statement-breakpoint
DROP TABLE daily_blocks;
--> statement-breakpoint
ALTER TABLE daily_blocks_0006 RENAME TO daily_blocks;
--> statement-breakpoint
CREATE TABLE daily_items_0006 (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, name TEXT, kind TEXT, type TEXT, compound_id TEXT, note TEXT, time_min INTEGER, start_day TEXT, on_hand INTEGER, on_hand_day TEXT, on_hand_at INTEGER, mixed_day TEXT, calc_vial REAL, calc_vial_unit TEXT, calc_water REAL, app_id TEXT, position INTEGER, dose TEXT, days_mask INTEGER, per_day REAL, vial REAL, supply_word TEXT, site TEXT, mixed TEXT, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
INSERT INTO daily_items_0006 (owner_id, id, updated_at, deleted_at, device_id, name, kind, type, compound_id, note, time_min, start_day, on_hand, on_hand_day, on_hand_at, mixed_day, calc_vial, calc_vial_unit, calc_water) SELECT owner_id, id, updated_at, deleted_at, device_id, name, kind, type, compound_id, note, time_min, start_day, on_hand, on_hand_day, on_hand_at, mixed_day, calc_vial, calc_vial_unit, calc_water FROM daily_items;
--> statement-breakpoint
DROP TABLE daily_items;
--> statement-breakpoint
ALTER TABLE daily_items_0006 RENAME TO daily_items;
--> statement-breakpoint
CREATE TABLE daily_placements_0006 (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, block_id TEXT, item_id TEXT, position INTEGER, item_rank INTEGER, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
INSERT INTO daily_placements_0006 (owner_id, id, updated_at, deleted_at, device_id, block_id, item_id, position) SELECT owner_id, id, updated_at, deleted_at, device_id, block_id, item_id, position FROM daily_placements;
--> statement-breakpoint
DROP TABLE daily_placements;
--> statement-breakpoint
ALTER TABLE daily_placements_0006 RENAME TO daily_placements;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS daily_pauses (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, block_id TEXT, from_day TEXT, until_day TEXT, why TEXT, position INTEGER, PRIMARY KEY(owner_id,id));`;
// What a done check-off took off an item's on-hand count, so taking the tick back puts back exactly that. Local only,
// like 0005 and 0006. daily_logs is rebuilt with the new column and its rows copied over, as 0006 does, so the step
// also runs on a database where it ran before.
export const dailyUsedLocalSql = `CREATE TABLE daily_logs_0007 (owner_id TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL, item_id TEXT, compound_id TEXT, day TEXT, status TEXT, amount REAL, unit TEXT, note TEXT, at INTEGER, site TEXT, rest INTEGER, undone INTEGER, on_hand_used REAL, PRIMARY KEY(owner_id,id));
--> statement-breakpoint
INSERT INTO daily_logs_0007 (owner_id, id, updated_at, deleted_at, device_id, item_id, compound_id, day, status, amount, unit, note, at, site, rest, undone) SELECT owner_id, id, updated_at, deleted_at, device_id, item_id, compound_id, day, status, amount, unit, note, at, site, rest, undone FROM daily_logs;
--> statement-breakpoint
DROP TABLE daily_logs;
--> statement-breakpoint
ALTER TABLE daily_logs_0007 RENAME TO daily_logs;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daily_logs_owner_day ON daily_logs(owner_id,day);`;
export default { journal: { entries: [{ idx: 0, when: 1792238400000, tag: '0000_local_rows', breakpoints: true }, { idx: 1, when: 1792238400001, tag: '0001_sync_conflicts', breakpoints: true }, { idx: 2, when: 1792238400002, tag: '0002_minimal_tombstones', breakpoints: true }, { idx: 3, when: 1792238400003, tag: '0003_workout_local', breakpoints: true }, { idx: 4, when: 1792238400004, tag: '0004_v1_columns', breakpoints: true }, { idx: 5, when: 1792238400005, tag: '0005_daily_routines', breakpoints: true }, { idx: 6, when: 1792238400006, tag: '0006_daily_routines_local', breakpoints: true }, { idx: 7, when: 1792238400007, tag: '0007_daily_used_local', breakpoints: true }] }, migrations: { m0000: initialSql, m0001: conflictSql, m0002: tombstoneSql, m0003: workoutLocalSql, m0004: v1ColumnsSql, m0005: dailyRoutinesSql, m0006: dailyRoutinesLocalSql, m0007: dailyUsedLocalSql } };
