const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
if (process.env.APP_VARIANT === 'freeiphone') {
  config.cacheVersion = 'freeiphone-v1';
  config.resolver.resolveRequest = (context, name, platform) => {
    if (/^(?:@supabase\/|@sentry\/|sentry-expo(?:\/|$)|posthog-)/.test(name)) {
      throw new Error('Backend modules are unavailable in the phone-only build. Telemetry is also blocked.');
    }
    const resolved = context.resolveRequest(context, name, platform);
    if (resolved.type !== 'sourceFile') return resolved;
    const relative = path.relative(__dirname, resolved.filePath).split(path.sep).join('/');
    if (relative === 'src/auth/provider.tsx' || relative === 'src/auth/screens.tsx') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only', path.basename(relative)) };
    }
    if (relative === 'src/features/food/ai/client.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only/food-ai-client.ts') };
    }
    // Fail the build if a future route accidentally imports backend/configuration code.
    // flags.ts contains only pure local row/catalog helpers; no transport or backend imports.
    if (relative.startsWith('src/auth/') || (relative.startsWith('src/data/sync/') && relative !== 'src/data/sync/flags.ts')) {
      throw new Error('Backend modules are unavailable in the phone-only build.');
    }
    return resolved;
  };
}
module.exports = config;
