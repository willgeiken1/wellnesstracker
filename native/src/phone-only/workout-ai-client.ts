/** Backend transport is absent in the free iPhone build. */
export function createLocalWorkoutAiClient() { return null; }
// Preserve the public quota error type without importing backend code.
export class WorkoutSummaryLimitError extends Error {}
