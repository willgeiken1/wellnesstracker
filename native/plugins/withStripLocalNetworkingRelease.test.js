const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const xcode = require('xcode');
const { parse } = require('xcode/lib/parser/pbxproj');

const pluginPath = path.join(__dirname, 'withStripLocalNetworkingRelease.js');
const appTarget = '111111111111111111111111';
const widgetTarget = '222222222222222222222222';
const phaseName = '[Insight Daily] Strip Local Networking for Release';

async function getPhase(existingPhase = true) {
  assert.ok(existsSync(pluginPath), 'Release ATS config plugin must exist');
  const plugin = require(pluginPath);
  const project = xcode.project('synthetic.pbxproj');
  project.hash = {
    project: {
      objects: {
        PBXNativeTarget: {
          [appTarget]: { name: 'InsightDaily', buildPhases: [] },
          [widgetTarget]: { name: 'Widgets', buildPhases: [] },
        },
        PBXBuildFile: {},
        PBXFileReference: {},
      },
    },
  };
  // Start with the previous plugin's ineffective phase, before CocoaPods embedding.
  if (existingPhase) {
    project.addBuildPhase([], 'PBXShellScriptBuildPhase', phaseName, appTarget, {
      shellPath: '/bin/sh', shellScript: 'echo old phase',
    });
  }
  project.addBuildPhase([], 'PBXShellScriptBuildPhase', '[CP] Embed Pods Frameworks', appTarget, {
    shellPath: '/bin/sh', shellScript: 'echo embed',
  });
  let firstResult;
  // Exercise Expo's registered mod twice, as on repeated non-clean prebuilds.
  for (let i = 0; i < 2; i++) {
    const config = plugin({ name: 'Insight Daily', slug: 'insight-daily' });
    await config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: { projectName: 'InsightDaily' },
    });
    if (i === 0) firstResult = project.writeSync();
    else assert.equal(project.writeSync(), firstResult, 'repeat application must not change the project');
  }
  const targets = project.pbxNativeTargetSection();
  assert.equal(targets[appTarget].buildPhases.length, 2);
  assert.equal(targets[widgetTarget].buildPhases.length, 0);
  assert.equal(targets[appTarget].buildPhases.at(-1).comment, phaseName);
  const phaseId = targets[appTarget].buildPhases.at(-1).value;
  const phase = project.hash.project.objects.PBXShellScriptBuildPhase[phaseId];
  assert.equal(phase.shellPath, '/bin/sh');
  assert.deepEqual(phase.inputPaths, ['"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)"']);
  assert.deepEqual(phase.outputPaths, ['"$(DERIVED_FILE_DIR)/insight-strip-local-networking-$(CONFIGURATION).stamp"']);
  const serializedPhase = parse(project.writeSync()).project.objects.PBXShellScriptBuildPhase[phaseId];
  assert.deepEqual(serializedPhase.inputPaths, phase.inputPaths, 'input paths survive pbxproj serialization');
  assert.deepEqual(serializedPhase.outputPaths, phase.outputPaths, 'output paths survive pbxproj serialization');
  // xcode stores escaped quotes but literal newlines until project serialization.
  return phase.shellScript.slice(1, -1).replace(/\\"/g, '"');
}

test('adds one phase with plist dependencies, last position and idempotency', () => getPhase(false));
test('upgrades the existing phase with plist dependencies, last position and idempotency', () => getPhase());

test('built plist loses all three local-network keys only in Release and writes a stamp', {
  skip: process.platform !== 'darwin' ? 'requires macOS PlistBuddy' : false,
}, async () => {
  const script = await getPhase();
  const buildDir = mkdtempSync(path.join(tmpdir(), 'insight-ats-'));
  const plistPath = path.join(buildDir, 'Synthetic App.app', 'Info.plist');
  const derivedDir = path.join(buildDir, 'Derived Files');
  mkdirSync(path.dirname(plistPath));
  mkdirSync(derivedDir);
  const buddy = (command) => execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plistPath], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const run = (configuration) => execFileSync('/bin/sh', ['-c', script], {
    env: { ...process.env, CONFIGURATION: configuration, TARGET_BUILD_DIR: buildDir,
      INFOPLIST_PATH: 'Synthetic App.app/Info.plist', DERIVED_FILE_DIR: derivedDir },
  });
  try {
    for (const configuration of ['Debug', 'Profile', 'Release']) {
      writeFileSync(plistPath, '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<plist version="1.0"><dict><key>NSAppTransportSecurity</key><dict>' +
        '<key>NSAllowsLocalNetworking</key><true/>' +
        '<key>NSAllowsArbitraryLoads</key><false/></dict>' +
        '<key>NSBonjourServices</key><array><string>_synthetic._tcp</string></array>' +
        '<key>NSLocalNetworkUsageDescription</key><string>Synthetic Metro access</string>' +
        '</dict></plist>');
      run(configuration);
      assert.ok(existsSync(path.join(derivedDir, `insight-strip-local-networking-${configuration}.stamp`)));
      assert.equal(buddy('Print :NSAppTransportSecurity:NSAllowsArbitraryLoads'), 'false');
      if (configuration === 'Release') {
        assert.throws(() => buddy('Print :NSAppTransportSecurity:NSAllowsLocalNetworking'));
        assert.throws(() => buddy('Print :NSBonjourServices'));
        assert.throws(() => buddy('Print :NSLocalNetworkUsageDescription'));
        run(configuration); // Absent key must succeed too.
      } else {
        assert.equal(buddy('Print :NSAppTransportSecurity:NSAllowsLocalNetworking'), 'true');
        assert.match(buddy('Print :NSBonjourServices'), /_synthetic\._tcp/);
        assert.equal(buddy('Print :NSLocalNetworkUsageDescription'), 'Synthetic Metro access');
      }
    }
    writeFileSync(plistPath, '<plist version="1.0"><dict/></plist>');
    run('Release'); // An absent ATS dictionary must also succeed.
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
});
