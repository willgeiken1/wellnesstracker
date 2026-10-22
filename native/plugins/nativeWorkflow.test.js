const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { load } = require('js-yaml');

const workflow = load(readFileSync(path.join(__dirname, '../../.github/workflows/native.yml'), 'utf8'));
const step = workflow.jobs.plistbuddy.steps.find((entry) => entry.name?.startsWith('Strict pbxproj'));

test('native PRs include the macOS Release/Debug check', () => {
  assert.ok(workflow.on.pull_request.paths.includes('native/**'));
  assert.ok(workflow.on.pull_request.paths.includes('.github/workflows/native.yml'));
  assert.equal(workflow.jobs.plistbuddy.env.REQUIRE_PLISTBUDDY, '1');
  assert.equal(workflow.jobs.plistbuddy.if, 'github.event.repository.private == false');
});

test('strict CI step rejects zero passes, skips, todos and runner failures', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'insight-ci-guard-'));
  try {
    // Run the actual workflow shell with a synthetic Node test reporter.
    writeFileSync(path.join(dir, 'node'), '#!/bin/sh\nprintf "%s\\n" "$SYNTHETIC_TAP"\nexit "$SYNTHETIC_EXIT"\n', { mode: 0o755 });
    for (const [tap, exit, expected] of [
      ['# pass 1\n# fail 0\n# skipped 0\n# todo 0', '0', true],
      ['# pass 0\n# fail 0\n# skipped 0\n# todo 0', '0', false],
      ['# pass 0\n# fail 0\n# skipped 1\n# todo 0', '0', false],
      ['# pass 1\n# fail 0\n# skipped 1\n# todo 0', '0', false],
      ['# pass 1\n# fail 1\n# skipped 0\n# todo 0', '1', false],
      ['# pass 1\n# fail 0\n# skipped 0\n# todo 0', '1', false],
      ['# pass 1\n# fail 0\n# skipped 0\n# todo 1', '0', false],
      ['', '0', false],
    ]) {
      const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', step.run], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RUNNER_TEMP: dir,
          SYNTHETIC_TAP: tap, SYNTHETIC_EXIT: exit },
      });
      assert.equal(result.status === 0, expected, `${tap}; exit=${exit}\n${result.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
