const { withBaseMod, withXcodeProject, AndroidConfig } = require('expo/config-plugins');
const { mkdir, access } = require('node:fs/promises');
const path = require('node:path');

const devScheme = 'exp+insight-daily';
const phaseName = '[Insight Daily] Remove Dev Scheme Outside Debug';
const isDevData = data => data.$?.['android:scheme']?.toLowerCase() === devScheme;

module.exports = function withDevSchemeDebugOnly(config) {
  // Run after expo-dev-client's manifest mod. Writing the debug overlay here keeps
  // the actual activity name and upstream data together, without ordering a
  // dangerous mod ahead of the main manifest mod.
  config = withBaseMod(config, { platform: 'android', mod: 'manifest',
    async action(config) {
      // Expo mods are a stack: unwind earlier mods before removing their generated scheme.
      const { nextMod, ...request } = config.modRequest;
      config = await nextMod({ ...config, modRequest: request });
      const debugActivities = [];
      for (const app of config.modResults.manifest.application ?? []) {
        for (const activity of app.activity ?? []) {
          const moved = [];
          activity['intent-filter'] = (activity['intent-filter'] ?? []).filter(filter => {
            const data = (filter.data ?? []).filter(isDevData);
            if (!data.length) return true;
            moved.push({ ...filter, data });
            filter.data = filter.data.filter(entry => !isDevData(entry));
            return filter.data.length > 0;
          });
          if (moved.length) debugActivities.push({ $: { 'android:name': activity.$['android:name'] }, 'intent-filter': moved });
        }
      }
      const debugPath = path.join(config.modRequest.platformProjectRoot, 'app/src/debug/AndroidManifest.xml');
      await mkdir(path.dirname(debugPath), { recursive: true });
      let debug;
      try {
        await access(debugPath);
        debug = await AndroidConfig.Manifest.readAndroidManifestAsync(debugPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        debug = { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' } } };
      }
      debug.manifest.application ??= [{}];
      const app = debug.manifest.application[0];
      app.activity ??= [];
      for (const moved of debugActivities) {
        let activity = app.activity.find(item => item.$['android:name'] === moved.$['android:name']);
        if (!activity) { activity = { $: moved.$ }; app.activity.push(activity); }
        // Replace only our scheme data on repeat application, preserving other debug declarations.
        const kept = (activity['intent-filter'] ?? []).filter(filter => {
          if (!filter.data?.some(isDevData)) return true;
          filter.data = filter.data.filter(entry => !isDevData(entry));
          return filter.data.length > 0;
        });
        const unique = [...new Map(moved['intent-filter'].map(filter => [JSON.stringify(filter), filter])).values()];
        activity['intent-filter'] = [...kept, ...unique];
      }
      await AndroidConfig.Manifest.writeAndroidManifestAsync(debugPath, debug);
      return config;
    },
  });

  return withXcodeProject(config, config => {
    const project = config.modResults;
    const targetId = project.findTargetKey(config.modRequest.projectName ?? '');
    if (!targetId) throw new Error('Dev scheme plugin could not find app target');
    const options = {
      shellPath: '/bin/sh',
      inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'],
      outputPaths: ['"$(DERIVED_FILE_DIR)/insight-dev-scheme-$(CONFIGURATION).stamp"'],
      shellScript: `set -eu
if [ "$CONFIGURATION" != "Debug" ]; then
  PLIST_PATH="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
  /usr/bin/plutil -lint "$PLIST_PATH" >/dev/null || exit 1
  buddy() { /usr/libexec/PlistBuddy -c "$1" "$PLIST_PATH"; }
  entry=0
  while buddy "Print :CFBundleURLTypes:$entry" >/dev/null 2>&1; do
    index=0
    while value=$(buddy "Print :CFBundleURLTypes:$entry:CFBundleURLSchemes:$index" 2>/dev/null); do
      if [ "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" = "${devScheme}" ]; then
        buddy "Delete :CFBundleURLTypes:$entry:CFBundleURLSchemes:$index" || exit 1
      else
        index=$((index + 1))
      fi
    done
    if ! buddy "Print :CFBundleURLTypes:$entry:CFBundleURLSchemes:0" >/dev/null 2>&1; then
      buddy "Delete :CFBundleURLTypes:$entry" || exit 1
    else
      entry=$((entry + 1))
    fi
  done
  # Verify the processed plist, not the source plist, before allowing signing.
  if buddy "Print :CFBundleURLTypes" 2>/dev/null | grep -Fiq '${devScheme}'; then
    echo "Dev scheme remains in non-Debug Info.plist" >&2
    exit 1
  fi
fi
touch "$DERIVED_FILE_DIR/insight-dev-scheme-$CONFIGURATION.stamp"
`,
    };
    const phases = project.pbxNativeTargetSection()[targetId].buildPhases;
    if (!phases.some(phase => phase.comment === phaseName)) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', phaseName, targetId, options);
    }
    const phase = phases.find(item => item.comment === phaseName);
    Object.assign(project.hash.project.objects.PBXShellScriptBuildPhase[phase.value], {
      ...options, shellScript: '"' + options.shellScript.replace(/"/g, '\\"') + '"',
    });
    return config;
  });
};
