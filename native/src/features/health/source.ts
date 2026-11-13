/** One body-weight reading as a health service reports it. */
export type WeightSample = { id: string; at: Date; kg: number };
/** A kind of asleep a device recorded. Older devices record plain asleep, which carries no stage. */
export type SleepStage = 'core' | 'deep' | 'rem';
/** One stretch of the night: asleep (with its stage when the device knows it), or awake when `awake` is set.
 * In-bed stretches are never included. */
export type SleepSpan = { start: Date; end: Date; awake?: boolean; stage?: SleepStage };
/** Heart readings that are averaged rather than added up. */
export type HeartMetric = 'heartRate' | 'restingHeartRate' | 'hrv';
/** Average, lowest and highest of a reading in a window. */
export type Spread = { average: number; min: number; max: number };
/** `ask`: Insight has not asked yet. `asked`: the person has seen Apple's sheet. iOS never says which
 * types they allowed to be read, so "asked" is as much as an app can know. */
export type HealthAccess = 'unavailable' | 'ask' | 'asked';
/** Read-only view of a health service. Nothing here can write to it. */
export interface HealthSource {
  access(): Promise<HealthAccess>;
  /** Shows the system permission sheet. Resolves once it closes. */
  request(): Promise<void>;
  weights(since: Date): Promise<WeightSample[]>;
  /** Steps between two instants, counted once even when a phone and a watch both recorded them. */
  steps(from: Date, to: Date): Promise<number>;
  /** Active calories (kcal) between two instants, counted once across a phone and a watch. */
  activeEnergy(from: Date, to: Date): Promise<number>;
  /** Exercise minutes between two instants, as Apple counts them for the green ring. */
  exerciseMinutes(from: Date, to: Date): Promise<number>;
  sleep(from: Date, to: Date): Promise<SleepSpan[]>;
  /** Heart rate and resting heart rate in beats a minute, HRV (SDNN) in milliseconds. Null when nothing was recorded. */
  heart(metric: HeartMetric, from: Date, to: Date): Promise<Spread | null>;
  /** Water drunk (mL) between two instants. */
  water(from: Date, to: Date): Promise<number>;
  /** Mindful sessions between two instants, as stretches; overlaps are merged by the reader. */
  mindful(from: Date, to: Date): Promise<{ start: Date; end: Date }[]>;
  /** Body-fat readings since a date, oldest first, as a percentage (22.5 means 22.5%). */
  bodyFat(since: Date): Promise<{ at: Date; percent: number }[]>;
  /** The newest VO2 max estimate, in mL/(kg·min), with when it was recorded. Null when there is none. */
  vo2Max(): Promise<{ value: number; at: Date } | null>;
}
