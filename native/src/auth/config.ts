/** Draft builds may use only a local loopback endpoint. Never include config values in errors. */
export function authConfig(url = '', key = ''): { url: string; key: string } | null {
  if (url.toLowerCase().includes('pvodxxmfgflvgvbdotlv')) throw new Error('Production Supabase is blocked in this build.');
  if (!url || !key) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Supabase requires a loopback URL.'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Supabase requires a loopback URL in this build.');
  }
  if (!key.startsWith('sb_publishable_')) throw new Error('Supabase requires a publishable key.');
  return { url, key };
}
