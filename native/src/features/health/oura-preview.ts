import type { OuraState } from './use-oura';

/** States the development preview of the Oura card can show. */
export const OURA_PREVIEW_STATES = ['off', 'on', 'expired', 'busy', 'failed', 'unreachable'] as const;
export type OuraPreviewState = typeof OURA_PREVIEW_STATES[number];
const noop = () => {};
/** A made-up Oura card in one state, for development screenshots only. Nothing is connected, read or sent; every button does nothing. */
export function previewOura(state: OuraPreviewState): OuraState {
  return { state: state === 'busy' || state === 'failed' ? 'off' : state, busy: state === 'busy', failed: state === 'failed' || state === 'unreachable', connect: noop, refresh: noop, disconnect: noop };
}
