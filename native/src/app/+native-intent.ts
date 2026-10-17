const allowedRoutes = new Set(['/food/log', '/workout/start']);

/** Only explicit Insight entry points may reach the router, on cold or warm opens. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // A base lets us parse bare paths too; its scheme deliberately cannot pass the gate.
    const url = new URL(path, 'https://invalid.local');
    if (url.protocol.toLowerCase() !== 'insight:' || url.username || url.password || url.port) return '/';
    const route = `/${url.hostname}${url.pathname}`.toLowerCase().replace(/^\/+/, '/').replace(/\/+$/, '');
    return allowedRoutes.has(route) ? route : '/';
  } catch {
    return '/';
  }
}
