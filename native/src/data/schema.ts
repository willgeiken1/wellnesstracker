import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
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
  target_reps: integer('target_reps'),
  rep_min: integer('rep_min'),
  rep_max: integer('rep_max'),
  superset_group: text('superset_group')
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
  notes: text('notes'),
  superset_group: text('superset_group')
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
  rpe: real('rpe'),
  tag: text('tag')
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
  fat_g: real('fat_g'),
  fiber_g: real('fiber_g'),
  sugar_g: real('sugar_g'),
  sodium_mg: real('sodium_mg')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
export const saved_foods = sqliteTable('saved_foods', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  serving_g: real('serving_g'),
  energy_kj: real('energy_kj'),
  protein_g: real('protein_g'),
  carbs_g: real('carbs_g'),
  fat_g: real('fat_g'),
  fiber_g: real('fiber_g'),
  sugar_g: real('sugar_g'),
  sodium_mg: real('sodium_mg')
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
  text: text('text'),
  step: real('step'),
  bar_weight: real('bar_weight'),
  unit_override: text('unit_override')
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
  rest_seconds: integer('rest_seconds'),
  plate_set: text('plate_set'),
  rest_per_exercise: text('rest_per_exercise'),
  rest_style: text('rest_style')
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

export const sync_conflicts = sqliteTable('sync_conflicts', { owner_id: text('owner_id').notNull(), table_name: text('table_name').notNull(), row_id: text('row_id').notNull(), reason: text('reason').notNull() }, t => [primaryKey({columns:[t.owner_id,t.table_name,t.row_id]})]);

export const custom_exercises = sqliteTable('custom_exercises', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  main_muscle: text('main_muscle'),
  helpers: text('helpers'),
  equipment: text('equipment')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const plans = sqliteTable('plans', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  mode: text('mode'),
  days_per_week: integer('days_per_week')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const pauses = sqliteTable('pauses', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  start_day: text('start_day'),
  end_day: text('end_day')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const purges = sqliteTable('purges', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  from_day: text('from_day'),
  to_day: text('to_day'),
  cutoff_ms: integer('cutoff_ms'),
  tz: text('tz')
}, t => [primaryKey({ columns: [t.owner_id, t.id] }), uniqueIndex('purges_owner_version').on(t.owner_id,t.updated_at,t.device_id).where(sql`${t.cutoff_ms} IS NOT NULL`)]);

// Daily routines: phone only until their row-sync migration ships.
export const daily_blocks = sqliteTable('daily_blocks', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  color: text('color'),
  position: integer('position'),
  start_min: integer('start_min'),
  end_min: integer('end_min'),
  days_mask: integer('days_mask'),
  hidden: integer('hidden'),
  app_id: text('app_id'),
  remind: integer('remind'),
  hidden_sub: text('hidden_sub')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const daily_items = sqliteTable('daily_items', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  kind: text('kind'),
  type: text('type'),
  compound_id: text('compound_id'),
  note: text('note'),
  time_min: integer('time_min'),
  start_day: text('start_day'),
  on_hand: real('on_hand'),
  on_hand_day: text('on_hand_day'),
  on_hand_at: integer('on_hand_at'),
  mixed_day: text('mixed_day'),
  calc_vial: real('calc_vial'),
  calc_vial_unit: text('calc_vial_unit'),
  calc_water: real('calc_water'),
  app_id: text('app_id'),
  position: integer('position'),
  dose: text('dose'),
  days_mask: integer('days_mask'),
  per_day: real('per_day'),
  vial: real('vial'),
  supply_word: text('supply_word'),
  site: text('site'),
  mixed: text('mixed')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const daily_placements = sqliteTable('daily_placements', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  block_id: text('block_id'),
  item_id: text('item_id'),
  position: integer('position'),
  item_rank: integer('item_rank')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const daily_compounds = sqliteTable('daily_compounds', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  amount: real('amount'),
  unit: text('unit'),
  start_day: text('start_day'),
  archived_at: integer('archived_at'),
  chart_line: integer('chart_line')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const daily_logs = sqliteTable('daily_logs', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  item_id: text('item_id'),
  compound_id: text('compound_id'),
  day: text('day'),
  status: text('status'),
  amount: real('amount'),
  unit: text('unit'),
  note: text('note'),
  at: integer('at'),
  site: text('site'),
  rest: integer('rest'),
  undone: integer('undone'),
  // Phone only (migration 0007): what a done check-off took off the item's on-hand count.
  on_hand_used: real('on_hand_used')
}, t => [primaryKey({ columns: [t.owner_id, t.id] }), index('daily_logs_owner_day').on(t.owner_id,t.day)]);

export const daily_types = sqliteTable('daily_types', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  name: text('name'),
  position: integer('position')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

export const daily_prefs = sqliteTable('daily_prefs', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  last_block_id: text('last_block_id'),
  day_rollover_hour: integer('day_rollover_hour'),
  focus_mode: integer('focus_mode'),
  tips_hidden: integer('tips_hidden'),
  history_graph: text('history_graph'),
  home_next_hidden: integer('home_next_hidden'),
  setup_status: text('setup_status'),
  setup_answers: text('setup_answers'),
  setup_at: integer('setup_at'),
  added: text('added'),
  type_tabs: text('type_tabs'),
  collapsed_blocks: text('collapsed_blocks'),
  reveal_blocks: text('reveal_blocks')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);

// Pauses of a daily routine: phone only, like the other daily_* tables.
export const daily_pauses = sqliteTable('daily_pauses', {
  owner_id: text('owner_id').notNull(), id: text('id').notNull(), updated_at: integer('updated_at').notNull(), deleted_at: integer('deleted_at'), device_id: text('device_id').notNull(),
  block_id: text('block_id'),
  from_day: text('from_day'),
  until_day: text('until_day'),
  why: text('why'),
  position: integer('position')
}, t => [primaryKey({ columns: [t.owner_id, t.id] })]);
