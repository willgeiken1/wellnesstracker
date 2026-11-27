const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
// Store builds get Sentry's debug IDs so uploaded source maps match crash reports. The phone-only build loads no Sentry code.
const config = process.env.APP_VARIANT === 'freeiphone'
  ? getDefaultConfig(__dirname)
  : require('@sentry/react-native/metro').getSentryExpoConfig(__dirname, { enableSourceContextInDevelopment: false });
// Shared, pure importer also runs in the Supabase edge function.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../supabase/functions/_shared')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// expo-sqlite's web worker loads wa-sqlite as a .wasm asset (web screenshots for the design check).
if (process.env.FIDELITY_WEB && config.resolver.assetExts && !config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
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
    // The kept photo files touch only the phone's own files; the phone-only build loads them from core, not auth.
    if (relative === 'src/auth/owner-files.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/core/owner-files.ts') };
    }
    if (relative === 'src/telemetry/sdk.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only/telemetry-sdk.ts') };
    }
    if (relative === 'src/features/food/ai/client.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only/food-ai-client.ts') };
    }
    if (relative === 'src/features/health/oura-client.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only/oura-client.ts') };
    }
    if (relative === 'src/features/workout/ai/client.ts') {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src/phone-only/workout-ai-client.ts') };
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
