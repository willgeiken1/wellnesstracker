// Reserved row-sync tables; parity is checked against the native catalog.
export const rowSyncTables = [
  "profile",
  "weigh_ins",
  "measurements",
  "routines",
  "routine_exercises",
  "sessions",
  "entries",
  "sets",
  "cardio_sessions",
  "food_entries",
  "saved_foods",
  "food_targets",
  "meals",
  "goals",
  "plan_days",
  "machine_notes",
  "home_layout",
  "settings",
  "photos",
  "custom_exercises",
  "plans",
  "pauses",
  "purges",
] as const;

// Only absent schema is optional during rollout. Permission/network failures remain errors.
export function rowSyncNotSetUp(error: { code?: string } | null | undefined): boolean {
  return !!error?.code && ["42883", "42P01", "PGRST202", "PGRST205"].includes(error.code);
}
