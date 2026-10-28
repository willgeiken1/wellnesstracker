// Runs the same synthetic, in-memory PGlite gates as CI. No configuration/HTTP.
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
if (process.argv.length !== 2) throw new Error('Usage: node native/server/row-sync/dry-run.cjs (no database arguments)');
require('./artifacts.cjs').verifyLedger();
const native = join(__dirname, '../..');
const result = spawnSync(process.execPath, [
  '--experimental-vm-modules', join(native,'node_modules/jest/bin/jest.js'),
  '--ci', '--selectProjects', 'data-server', '--runTestsByPath', 'tests/server/apply-gates.test.ts',
], { cwd: native, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
