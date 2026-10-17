import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
export const profile = sqliteTable('profile', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  dob: text('dob'),
  weight_unit: text('weight_unit'),
  height_m: real('height_m')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const weigh_ins = sqliteTable('weigh_ins', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  weight_kg: real('weight_kg'),
  entered_value: real('entered_value'),
  entered_unit: text('entered_unit'),
  source: text('source')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const measurements = sqliteTable('measurements', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  waist_m: real('waist_m'),
  hips_m: real('hips_m'),
  chest_m: real('chest_m'),
  arm_m: real('arm_m'),
  thigh_m: real('thigh_m')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const routines = sqliteTable('routines', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  position: integer('position')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const routine_exercises = sqliteTable('routine_exercises', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  routine_id: text('routine_id'),
  exercise: text('exercise'),
  position: integer('position'),
  target_sets: integer('target_sets'),
  target_reps: integer('target_reps')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const sessions = sqliteTable('sessions', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  routine_id: text('routine_id'),
  name: text('name'),
  origin: text('origin'),
  started_at: integer('started_at'),
  finished_at: integer('finished_at'),
  duration_ms: integer('duration_ms'),
  notes: text('notes')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const entries = sqliteTable('entries', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  session_id: text('session_id'),
  exercise: text('exercise'),
  position: integer('position'),
  notes: text('notes')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const sets = sqliteTable('sets', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  entry_id: text('entry_id'),
  position: integer('position'),
  weight_kg: real('weight_kg'),
  entered_value: real('entered_value'),
  entered_unit: text('entered_unit'),
  reps: integer('reps'),
  left_weight_kg: real('left_weight_kg'),
  left_entered_value: real('left_entered_value'),
  left_entered_unit: text('left_entered_unit'),
  left_reps: integer('left_reps'),
  right_weight_kg: real('right_weight_kg'),
  right_entered_value: real('right_entered_value'),
  right_entered_unit: text('right_entered_unit'),
  right_reps: integer('right_reps'),
  rpe: real('rpe')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const cardio_sessions = sqliteTable('cardio_sessions', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  kind: text('kind'),
  duration_ms: integer('duration_ms'),
  distance_m: real('distance_m'),
  notes: text('notes')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const food_entries = sqliteTable('food_entries', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  meal_id: text('meal_id'),
  saved_food_id: text('saved_food_id'),
  name: text('name'),
  amount_g: real('amount_g'),
  energy_kj: real('energy_kj'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const saved_foods = sqliteTable('saved_foods', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  serving_g: real('serving_g'),
  energy_kj: real('energy_kj'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const food_targets = sqliteTable('food_targets', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  energy_kj: real('energy_kj'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const meals = sqliteTable('meals', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  position: integer('position')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const goals = sqliteTable('goals', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  kind: text('kind'),
  target_value: real('target_value'),
  target_unit: text('target_unit'),
  target_day: text('target_day')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const plan_days = sqliteTable('plan_days', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  day: text('day'),
  routine_id: text('routine_id'),
  status: text('status')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const machine_notes = sqliteTable('machine_notes', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  exercise: text('exercise'),
  text: text('text')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const home_layout = sqliteTable('home_layout', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  widget: text('widget'),
  position: integer('position'),
  hidden: integer('hidden')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const settings = sqliteTable('settings', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  theme_override: text('theme_override'),
  accent: text('accent'),
  rest_seconds: integer('rest_seconds')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const photos = sqliteTable('photos', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  file_name: text('file_name'),
  captured_at: integer('captured_at'),
  width: integer('width'),
  height: integer('height')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const oura_days = sqliteTable('oura_days', { owner_id: text('owner_id').notNull(), day: text('day').notNull(), cache: text('cache').notNull() }, t => [primaryKey({columns:[t.owner_id,t.day]})]);
export const sync_outbox = sqliteTable('sync_outbox', { owner_id: text('owner_id').notNull(), table_name: text('table_name').notNull(), row_id: text('row_id').notNull(), revision: text('revision').notNull() }, t => [primaryKey({columns:[t.owner_id,t.table_name,t.row_id]})]);
export const sync_state = sqliteTable('sync_state', { owner_id: text('owner_id').notNull(), key: text('key').notNull(), value: text('value').notNull() }, t => [primaryKey({columns:[t.owner_id,t.key]})]);
