import { OURA_PREVIEW_STATES } from '@/features/health/oura-preview';
let fixtureRequest = 0;
const allowedRoutes = new Set(['/food/log', '/workout/start']);

/** Only explicit Insight entry points may reach the router, on cold or warm opens. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // A base lets us parse bare paths too; its scheme deliberately cannot pass the gate.
    const url = new URL(path, 'https://invalid.local');
    if (url.protocol.toLowerCase() !== 'insight:' || url.username || url.password || url.port) return '/';
    const route = `/${url.hostname}${url.pathname}`.toLowerCase().replace(/^\/+/, '/').replace(/\/+$/, '');
    if (__DEV__ && route === '/dev/logger-fixture') {
      const state=url.searchParams.get('state');
      if (!state || !['logger','keypad','rest','summary'].includes(state)) return '/';
      return `${route}?state=${state}&offline=${url.searchParams.get('offline') === '0' ? '0' : '1'}&request=${++fixtureRequest}`;
    }
    if (__DEV__ && route === '/dev/sample-data') return route;
    if (__DEV__ && route === '/dev/oura-preview') {
      const state = url.searchParams.get('state');
      // Opened inside Settings, so it has Settings' own back button and Settings underneath.
      return state && (OURA_PREVIEW_STATES as readonly string[]).includes(state) ? `/settings/dev-oura-preview?state=${state}` : '/';
    }
    if (!allowedRoutes.has(route)) return '/';
    const routine=url.searchParams.get('routine');
    return route==='/workout/start' && routine && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(routine) ? `${route}?routine=${routine}` : route;
  } catch {
    return '/';
  }
}
