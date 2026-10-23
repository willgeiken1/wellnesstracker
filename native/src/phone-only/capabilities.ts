// No native imports: even evaluating a native module can throw when it is absent.
const unavailable = Object.freeze({
  available: false,
  async run(_loadAndRun: () => unknown): Promise<false> { return false; },
});
export const health = unavailable;
export const widgets = unavailable;
export const push = unavailable;
