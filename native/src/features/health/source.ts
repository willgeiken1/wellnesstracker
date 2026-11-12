/** One body-weight reading as a health service reports it. */
export type WeightSample = { id: string; at: Date; kg: number };
/** `ask`: Insight has not asked yet. `asked`: the person has seen Apple's sheet. iOS never says which
 * types they allowed to be read, so "asked" is as much as an app can know. */
export type HealthAccess = 'unavailable' | 'ask' | 'asked';
/** Read-only view of a health service. Nothing here can write to it. */
export interface HealthSource {
  access(): Promise<HealthAccess>;
  /** Shows the system permission sheet. Resolves once it closes. */
  request(): Promise<void>;
  weights(since: Date): Promise<WeightSample[]>;
}
