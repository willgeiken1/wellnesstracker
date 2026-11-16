/** Insight's own hosted Supabase project. It is the only hosted endpoint the app will talk to. */
export const INSIGHT_SUPABASE_REF = 'pvodxxmfgflvgvbdotlv';
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Accepts a local loopback endpoint (development) or Insight's hosted project over HTTPS (store builds).
 * Any other host is refused, and only a publishable key is accepted. Never include config values in errors.
 */
export function authConfig(url = '', key = ''): { url: string; key: string } | null {
  if (!url || !key) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Supabase URL is not valid.'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Supabase URL must be a bare origin.');
  }
  const loopback = LOOPBACK_HOSTS.includes(parsed.hostname) && ['http:', 'https:'].includes(parsed.protocol);
  const hosted = parsed.protocol === 'https:' && parsed.hostname === `${INSIGHT_SUPABASE_REF}.supabase.co` && parsed.port === '';
  if (!loopback && !hosted) throw new Error('Supabase URL must be a loopback address or the Insight project.');
  if (!key.startsWith('sb_publishable_')) throw new Error('Supabase requires a publishable key.');
  return { url, key };
}
