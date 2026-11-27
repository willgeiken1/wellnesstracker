/* The sample-data tour is asked for once, by Explore with sample data, and then plays over the first Home that opens.
 * The request lives in memory: switching into sample data rebuilds the app's screens, and a later open of sample data
 * (Settings, Look around) has no tour. */
let pending = false;
const listeners = new Set<() => void>();

export function requestTour() { pending = true; listeners.forEach(l => l()); }
/** Takes the request: true once, then false until the next request. */
export function takeTour(): boolean { const was = pending; pending = false; return was; }
export function tourPending() { return pending; }
export function onTourRequest(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
