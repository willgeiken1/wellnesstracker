const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = '[Insight Daily] Strip Local Networking for Release';
const EXPO_PHASE_NAME = '[Expo Dev Launcher] Strip Local Network Keys for Release';

// Depend on the processed plist: phase position alone does not order Info.plist processing.
module.exports = function withStripLocalNetworkingRelease(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetId = project.findTargetKey(config.modRequest.projectName ?? '');
    if (!targetId) {
      throw new Error('Release ATS plugin could not find the app target');
    }

    const phaseName = PHASE_NAME;
    const phases = project.pbxNativeTargetSection()[targetId].buildPhases;
    // Supersede Expo's earlier, unordered strip phase on the app target only.
    // app.json registers this mod before expo-dev-client, so it executes after Expo's mod.
    const scriptPhases = project.hash.project.objects.PBXShellScriptBuildPhase;
    let foundExpoPhase = false;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (phases[i].comment === EXPO_PHASE_NAME) {
        foundExpoPhase = true;
        const [obsolete] = phases.splice(i, 1);
        delete scriptPhases[obsolete.value];
        delete scriptPhases[`${obsolete.value}_comment`];
      }
    }
    const hasDevClient = config.plugins?.some((entry) =>
      (Array.isArray(entry) ? entry[0] : entry) === 'expo-dev-client');
    if (hasDevClient && !foundExpoPhase) {
      throw new Error('expo-dev-client local-network phase was not found; verify Expo phase naming and mod ordering');
    }
    // Separate alternatives require matching quotes; shell quoting introduces no backslashes.
    const debugDefinition = `(^|[[:space:]])(DEBUG=1|["]DEBUG=1["]|[']DEBUG=1['])([[:space:]]|$)`;
    const quotedDebugDefinition = "'" + debugDefinition.replaceAll("'", `'"'"'`) + "'";
    // Assumes ENABLE_USER_SCRIPT_SANDBOXING is off (Expo default); PlistBuddy edits the input.
    // Debug also fails closed: the processed-plist input orders this after ProcessInfoPlistFile.
    // Real Xcode Debug/Release builds must still confirm that dependency ordering.
    // Non-debug builds strip ALL NSBonjourServices, not just Expo's Metro service entries.
    const options = {
      shellPath: '/bin/sh',
      inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'],
      outputPaths: ['"$(DERIVED_FILE_DIR)/insight-strip-local-networking-$(CONFIGURATION).stamp"'],
      // RN/Expo marks debug builds with a DEBUG=1 preprocessor definition, regardless of name.
      shellScript: `PLIST_PATH="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
if [ ! -f "$PLIST_PATH" ]; then
  echo "error: Missing processed plist: $PLIST_PATH" >&2
  exit 1
fi
if ! printf '%s' "$GCC_PREPROCESSOR_DEFINITIONS" | grep -Eq ${quotedDebugDefinition}; then
  /usr/libexec/PlistBuddy -c "Delete :NSAppTransportSecurity:NSAllowsLocalNetworking" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :NSBonjourServices" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :NSLocalNetworkUsageDescription" "$PLIST_PATH" 2>/dev/null || true
  for KEY in :NSAppTransportSecurity:NSAllowsLocalNetworking :NSBonjourServices :NSLocalNetworkUsageDescription; do
    if /usr/libexec/PlistBuddy -c "Print $KEY" "$PLIST_PATH" >/dev/null 2>&1; then
      echo "error: Local-network key remains in processed plist: $KEY" >&2
      exit 1
    fi
  done
fi
touch "$DERIVED_FILE_DIR/insight-strip-local-networking-$CONFIGURATION.stamp"
`,
    };
    if (!phases.some((phase) => phase.comment === phaseName)) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', phaseName, targetId, options);
    }

    // Upgrade the earlier phase in place on non-clean prebuilds, retaining its UUID.
    const addedIndex = phases.findIndex((phase) => phase.comment === phaseName);
    const [added] = phases.splice(addedIndex, 1);
    Object.assign(project.hash.project.objects.PBXShellScriptBuildPhase[added.value], {
      ...options,
      shellScript: '"' + options.shellScript.replace(/"/g, '\\"') + '"',
    });
    // Keep placement stable; the declared processed-plist input provides ordering, not position.
    phases.push(added);
    return config;
  });
};

module.exports.PHASE_NAME = PHASE_NAME;
module.exports.EXPO_PHASE_NAME = EXPO_PHASE_NAME;
