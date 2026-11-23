// app.json remains the default source of truth. Only this explicit opt-in changes it.
const base = require('./app.json').expo;
const trialStub = process.env.INSIGHT_TRIAL_STUB === '1' || process.env.EXPO_PUBLIC_INSIGHT_TRIAL_STUB === '1';
function withTrial(config) {
  if (!trialStub) return config;
  return { ...config, extra: { ...(config.extra || {}), insightTrialStub: true } };
}
const safePlugins = new Set([
  'expo-router', './plugins/withStripLocalNetworkingRelease', 'expo-splash-screen',
  'expo-build-properties', 'expo-dev-client', './plugins/withDevSchemeDebugOnly',
  'expo-camera', 'expo-font', 'expo-sqlite', 'expo-secure-store', 'expo-sharing', 'expo-status-bar',
]);
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'freeiphone') return withTrial(config);
  // Rebuild from a known schema, rather than copying future capabilities or backend extras.
  return withTrial({
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
  });
};
