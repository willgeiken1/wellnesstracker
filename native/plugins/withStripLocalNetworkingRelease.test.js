const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const xcode = require('xcode');
const { parse } = require('xcode/lib/parser/pbxproj');

const pluginPath = path.join(__dirname, 'withStripLocalNetworkingRelease.js');
const appTarget = '111111111111111111111111';
const widgetTarget = '222222222222222222222222';
const plistBuddyAvailable = process.platform === 'darwin' && existsSync('/usr/libexec/PlistBuddy');
assert.ok(process.env.REQUIRE_PLISTBUDDY !== '1' || plistBuddyAvailable,
  'REQUIRE_PLISTBUDDY=1: real macOS PlistBuddy tests must run, not skip');
const plistBuddyOptions = { skip: plistBuddyAvailable ? false : 'requires real macOS /usr/libexec/PlistBuddy (unavailable on Linux)' };

const phaseName = '[Insight Daily] Strip Local Networking for Release';
const expoPhaseName = '[Expo Dev Launcher] Strip Local Network Keys for Release';

async function getPhase(existingPhase = true, withDevLauncher = false) {
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
  let widgetPhaseId;
  if (withDevLauncher) {
    project.addBuildPhase([], 'PBXShellScriptBuildPhase', expoPhaseName, widgetTarget, {
      shellPath: '/bin/sh', shellScript: 'echo widget phase',
    });
    widgetPhaseId = project.pbxNativeTargetSection()[widgetTarget].buildPhases[0].value;
  }
  let firstResult;
  // Exercise Expo's registered mod twice, as on repeated non-clean prebuilds.
  for (let i = 0; i < 2; i++) {
    let config = plugin({ name: 'Insight Daily', slug: 'insight-daily' });
    // Match app.json order; Expo executes the later-registered mod first.
    if (withDevLauncher) config = require('expo-dev-launcher/app.plugin').default(config, {});
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
  assert.equal(targets[widgetTarget].buildPhases.length, withDevLauncher ? 1 : 0);
  if (withDevLauncher) {
    assert.equal(targets[widgetTarget].buildPhases[0].value, widgetPhaseId);
    const section = parse(project.writeSync()).project.objects.PBXShellScriptBuildPhase;
    const expoIds = Object.keys(section).filter((id) => section[id]?.name === `"${expoPhaseName}"`);
    assert.deepEqual(expoIds, [widgetPhaseId], 'only the unrelated widget phase should remain');
  }
  const phaseId = targets[appTarget].buildPhases.find((phase) => phase.comment === phaseName).value;
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

test('adds one phase with processed plist input dependency and idempotency', () => getPhase(false));
test('upgrades the existing phase with processed plist input dependency and idempotency', () => getPhase());

test('removes the redundant Expo dev-launcher app phase after Expo mods, preserving widget phases', async () => {
  await getPhase(false, true);
  await getPhase(true, true);
});

test('DEBUG=1 preserves keys; Release, Profile and custom configurations strip keys and write stamps', plistBuddyOptions, async () => {
  const script = await getPhase();
  const buildDir = mkdtempSync(path.join(tmpdir(), 'insight-ats-'));
  const plistPath = path.join(buildDir, 'Synthetic App.app', 'Info.plist');
  const derivedDir = path.join(buildDir, 'Derived Files');
  mkdirSync(path.dirname(plistPath));
  mkdirSync(derivedDir);
  const buddy = (command) => execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plistPath], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const run = (configuration, definitions = '') => execFileSync('/bin/sh', ['-c', script], {
    env: { ...process.env, CONFIGURATION: configuration, GCC_PREPROCESSOR_DEFINITIONS: definitions, TARGET_BUILD_DIR: buildDir,
      INFOPLIST_PATH: 'Synthetic App.app/Info.plist', DERIVED_FILE_DIR: derivedDir },
  });
  try {
    for (const [configuration, definitions, debug] of [
      ['Debug', '$(inherited) DEBUG=1 OTHER=1', true],
      ['Release', '', false], ['Profile', 'NDEBUG=1', false],
      ['Internal', 'OTHER_DEBUG=1 DEBUG=10', false],
      ['Debug', 'DEBUG=0', false], ['CustomDebug', '', false], ['CustomDebug', 'DEBUG=1', true],
      ['Debug', '"DEBUG=1"', true], ['Debug', "'DEBUG=1'", true],
      ['Debug', '$(inherited)\t"DEBUG=1" OTHER=1', true],
      ['Debug', '"DEBUG=0" "DEBUG=10" "OTHER_DEBUG=1"', false],
      ['Debug', '"DEBUG=1', false], ['Debug', 'DEBUG=1"', false],
    ]) {
      writeFileSync(plistPath, '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<plist version="1.0"><dict><key>NSAppTransportSecurity</key><dict>' +
        '<key>NSAllowsLocalNetworking</key><true/>' +
        '<key>NSAllowsArbitraryLoads</key><false/></dict>' +
        '<key>NSBonjourServices</key><array><string>_synthetic._tcp</string></array>' +
        '<key>NSLocalNetworkUsageDescription</key><string>Synthetic Metro access</string>' +
        '</dict></plist>');
      run(configuration, definitions);
      assert.ok(existsSync(path.join(derivedDir, `insight-strip-local-networking-${configuration}.stamp`)));
      assert.equal(buddy('Print :NSAppTransportSecurity:NSAllowsArbitraryLoads'), 'false');
      if (!debug) {
        assert.throws(() => buddy('Print :NSAppTransportSecurity:NSAllowsLocalNetworking'));
        assert.throws(() => buddy('Print :NSBonjourServices'));
        assert.throws(() => buddy('Print :NSLocalNetworkUsageDescription'));
        run(configuration, definitions); // Absent key must succeed too.
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

// Missing files must fail even on Linux, before PlistBuddy would be invoked.
test('all builds including quoted DEBUG=1 fail closed when the processed plist is missing', async () => {
  const script = await getPhase();
  const buildDir = mkdtempSync(path.join(tmpdir(), 'insight-ats-missing-'));
  try {
    for (const [configuration, definitions] of [['Release', ''], ['Profile', ''], ['Internal', ''], ['Debug', 'DEBUG=1'], ['Debug', '"DEBUG=1"']]) {
      const result = spawnSync('/bin/sh', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, CONFIGURATION: configuration, GCC_PREPROCESSOR_DEFINITIONS: definitions,
          TARGET_BUILD_DIR: buildDir, INFOPLIST_PATH: 'Missing.app/Info.plist', DERIVED_FILE_DIR: buildDir },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /error:.*missing.*plist/i);
      assert.ok(!existsSync(path.join(buildDir, `insight-strip-local-networking-${configuration}.stamp`)));
    }
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
});

test('fails closed if any local-network key survives deletion', plistBuddyOptions, async () => {
  const script = await getPhase();
  const buildDir = mkdtempSync(path.join(tmpdir(), 'insight-ats-failure-'));
  const plistPath = path.join(buildDir, 'Info.plist');
  const wrapperPath = path.join(buildDir, 'PlistBuddy');
  try {
    // Inject a failed Delete at the tool boundary; all Print operations use real PlistBuddy.
    writeFileSync(wrapperPath, '#!/bin/sh\nif [ "$2" = "Delete $KEEP_KEY" ]; then exit 1; fi\nexec /usr/libexec/PlistBuddy "$@"\n', { mode: 0o755 });
    for (const key of [':NSAppTransportSecurity:NSAllowsLocalNetworking', ':NSBonjourServices', ':NSLocalNetworkUsageDescription']) {
      writeFileSync(plistPath, '<plist version="1.0"><dict><key>NSAppTransportSecurity</key><dict>' +
        '<key>NSAllowsLocalNetworking</key><true/></dict><key>NSBonjourServices</key><array/>' +
        '<key>NSLocalNetworkUsageDescription</key><string>Synthetic</string></dict></plist>');
      const result = spawnSync('/bin/sh', ['-c', script.replaceAll('/usr/libexec/PlistBuddy', '"' + wrapperPath + '"')], {
        encoding: 'utf8',
        env: { ...process.env, CONFIGURATION: 'Release', GCC_PREPROCESSOR_DEFINITIONS: '', KEEP_KEY: key,
          TARGET_BUILD_DIR: buildDir, INFOPLIST_PATH: 'Info.plist', DERIVED_FILE_DIR: buildDir },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /error:.*local.network.*remains/i);
      assert.ok(result.stderr.includes(key));
      assert.ok(!existsSync(path.join(buildDir, 'insight-strip-local-networking-Release.stamp')));
    }
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
});
