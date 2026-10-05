// Every browser harness launches through here.
// DNS for any host other than localhost and 127.0.0.1 fails closed, so a boot
// cannot reach Sentry, PostHog, Supabase, or the font hosts.

export const OFFLINE_CHROME_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
];

export async function launchOfflineBrowser(chromium, overrides = {}) {
  const options = { args: OFFLINE_CHROME_ARGS.concat(overrides.args || []) };
  if (overrides.executablePath) options.executablePath = overrides.executablePath;
  else if (overrides.channel) options.channel = overrides.channel;
  return chromium.launch(options);
}

// Console noise from hosts the resolver is supposed to black-hole.
export function isOfflineNoise(message) {
  return /supabase|sentry|posthog|fonts\.google|fonts\.gstatic|favicon|Failed to fetch|net::|ERR_NAME_NOT_RESOLVED/i.test(String(message || ""));
}
