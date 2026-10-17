/** Preserve the host segment in our custom scheme on both cold and warm opens. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (!path.startsWith('insight://')) return path;
  try {
    const url = new URL(path);
    const route = `/${url.hostname}${url.pathname}`.replace(/^\/+/, '/').replace(/\/$/, '');
    if (route === '/food/log' || route === '/workout/start') return route;
    return '/';
  } catch {
    return '/';
  }
}
