/** One body-weight reading as a health service reports it. */
export type WeightSample = { id: string; at: Date; kg: number };
/** One stretch of the night: asleep, or awake when `awake` is set. In-bed stretches are never included. */
export type SleepSpan = { start: Date; end: Date; awake?: boolean };
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
  sleep(from: Date, to: Date): Promise<SleepSpan[]>;
}
