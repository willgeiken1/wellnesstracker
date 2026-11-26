// app.json remains the default source of truth. Only this explicit opt-in changes it.
const base = require('./app.json').expo;
const safePlugins = new Set([
  'expo-router', './plugins/withStripLocalNetworkingRelease', 'expo-splash-screen',
  'expo-build-properties', 'expo-dev-client', './plugins/withDevSchemeDebugOnly',
  'expo-camera', 'expo-font', 'expo-sqlite', 'expo-secure-store', 'expo-sharing', 'expo-status-bar',
  // Face ID lock: only the Face ID usage line, no entitlement, so the Personal Team build keeps it.
  'expo-local-authentication',
]);
const appIcons = require('./plugins/app-icons');
/** The app icon picker (Settings, Appearance): Lit Peaks in the default palette is the primary, every other style,
 * palette and look an alternate. Added to every variant. */
const withAppIcons = config => ({ ...config, ios: { ...config.ios, icon: appIcons.PRIMARY_ART },
  plugins: [...(config.plugins ?? []).filter(p => (Array.isArray(p) ? p[0] : p) !== 'expo-alternate-app-icons'), appIcons.plugin] });
module.exports = (context) => {
  const resolved = withAppIcons(build(context));
  // Design check only: a static web build (one HTML page) for side-by-side screenshots against the mockup.
  return process.env.FIDELITY_WEB ? { ...resolved, web: { ...resolved.web, output: 'single' } } : resolved;
};
function build({ config }) {
  if (process.env.APP_VARIANT !== 'freeiphone') return config;
  // Rebuild from a known schema, rather than copying future capabilities or backend extras.
  return {
    name: 'Insight Wellness (Phone)', slug: base.slug, version: base.version,
    orientation: base.orientation, icon: base.icon, scheme: base.scheme,
    userInterfaceStyle: base.userInterfaceStyle,
    ios: {
      icon: base.ios.icon, bundleIdentifier: base.ios.bundleIdentifier,
      supportsTablet: false, deploymentTarget: base.ios.deploymentTarget,
      entitlements: {},
    },
    android: base.android, web: base.web, experiments: base.experiments,
    plugins: [...config.plugins.filter(plugin => safePlugins.has(Array.isArray(plugin) ? plugin[0] : plugin))
      .map(plugin => base.plugins.find(p => (Array.isArray(p) ? p[0] : p) === (Array.isArray(plugin) ? plugin[0] : plugin)))
      .map(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-dev-client'
        ? ['expo-dev-client', { launchMode: 'most-recent', embeddedBundle: true }] : (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-sharing' ? ['expo-sharing', { ios: { enabled: false }, android: { enabled: true, singleShareMimeTypes: ['application/json', 'text/json', 'text/plain'] } }] : plugin),
      './plugins/withPhoneOnlyBundle'],
    extra: { appVariant: 'freeiphone', phoneOnly: true, capabilities: { health: false, widgets: false, push: false } },
    updates: { enabled: false },
  };
}
