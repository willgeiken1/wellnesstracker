import type { Row, Table } from '../src/data/rows';

/** Synthetic examples for the M1-03 columns; never user data. */
export const syncedV1Examples: [Table, Row['data']][] = [
 ['sets',{tag:'warmup'}], ['routine_exercises',{rep_min:6,rep_max:10,superset_group:'fixture'}],
 ['entries',{superset_group:'fixture'}], ['machine_notes',{step:5,bar_weight:20,unit_override:'kg'}],
 ['custom_exercises',{name:'Fixture lift',main_muscle:'quads',helpers:'["glutes"]',equipment:'barbell'}],
 ['settings',{plate_set:'[20,10,5]',rest_per_exercise:'{"Fixture lift":90}',rest_style:'countdown'}],
 ['plans',{mode:'fixed',days_per_week:3}], ['food_entries',{fiber_g:3,sugar_g:null,sodium_mg:20}],
 ['saved_foods',{fiber_g:null,sugar_g:0,sodium_mg:null}], ['pauses',{start_day:'2026-10-01',end_day:null}],
];
