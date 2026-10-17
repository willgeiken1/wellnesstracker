const { withXcodeProject } = require('expo/config-plugins');

// Depend on the processed plist: phase position alone does not order Info.plist processing.
module.exports = function withStripLocalNetworkingRelease(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetId = project.findTargetKey(config.modRequest.projectName ?? '');
    if (!targetId) {
      throw new Error('Release ATS plugin could not find the app target');
    }

    const phaseName = '[Insight Daily] Strip Local Networking for Release';
    const phases = project.pbxNativeTargetSection()[targetId].buildPhases;
    const options = {
      shellPath: '/bin/sh',
      inputPaths: ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"'],
      outputPaths: ['"$(DERIVED_FILE_DIR)/insight-strip-local-networking-$(CONFIGURATION).stamp"'],
      // RN/Expo marks debug builds with a DEBUG=1 preprocessor definition, regardless of name.
      shellScript: `if ! printf '%s\\n' "$GCC_PREPROCESSOR_DEFINITIONS" | grep -Eq '(^|[[:space:]])DEBUG=1([[:space:]]|$)'; then
  PLIST_PATH="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
  if [ ! -f "$PLIST_PATH" ]; then
    echo "error: Missing processed plist: $PLIST_PATH" >&2
    exit 1
  fi
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
