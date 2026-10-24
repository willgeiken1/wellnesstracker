const { withXcodeProject } = require('expo/config-plugins');
const prefix = 'export APP_VARIANT=freeiphone EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1\\n';
module.exports = function withPhoneOnlyBundle(config) {
  return withXcodeProject(config, config => {
    const phases = Object.values(config.modResults.hash.project.objects.PBXShellScriptBuildPhase);
    const phase = phases.find(value => value && typeof value === 'object' && value.name?.replaceAll('"', '') === 'Bundle React Native code and images');
    if (!phase || (!phase.shellScript.includes('export SKIP_BUNDLING=1') && !phase.shellScript.includes(prefix))) {
      throw new Error('Phone-only bundling phase changed; inspect the Expo template.');
    }
    if (!phase.shellScript.includes(prefix)) {
      phase.shellScript = '"' + prefix + phase.shellScript.slice(1).replace('export SKIP_BUNDLING=1', 'export FORCE_BUNDLING=1');
    }
    return config;
  });
};
